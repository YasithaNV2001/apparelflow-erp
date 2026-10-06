-- Integrity guards (PLAN §6.2, D6). The database itself enforces the workflow, so a
-- buggy service or a hand-written SQL session still cannot break these rules.
-- Error messages start with a code that the API maps to an HTTP status:
-- HARD_STOP → 422; ILLEGAL_TRANSITION, ITEM_LOCKED, ORDER_LOCKED, AUDIT_IMMUTABLE → 409.

-- Row Level Security on, with no policies: Supabase's auto-generated Data API
-- (anon/authenticated roles) sees nothing. The app connects as the table owner,
-- which bypasses RLS.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipe_components" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cutting_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- TRUNCATE ... RESTART IDENTITY then also restarts order numbers at CUT-00001.
ALTER SEQUENCE "order_no_seq" OWNED BY "cutting_orders"."order_no";--> statement-breakpoint

-- 1) The audit log is append-only.
CREATE OR REPLACE FUNCTION af_block_log_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_IMMUTABLE: verification_logs is append-only';
END;
$$;--> statement-breakpoint

CREATE TRIGGER verification_logs_append_only
BEFORE UPDATE OR DELETE ON "verification_logs"
FOR EACH ROW EXECUTE FUNCTION af_block_log_mutation();--> statement-breakpoint

-- 2) Items are created uncounted with their order; afterwards only the count may change,
--    and only while the order is PENDING_VERIFICATION. Items are never deleted.
CREATE OR REPLACE FUNCTION af_guard_items() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  current_status order_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ITEM_LOCKED: verification_items cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT status INTO current_status FROM cutting_orders WHERE id = NEW.order_id;
    IF current_status NOT IN ('CUTTING_IN_PROGRESS', 'PENDING_VERIFICATION')
       OR NEW.actual_qty IS NOT NULL THEN
      RAISE EXCEPTION 'ITEM_LOCKED: items are created uncounted, before verification';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.order_id <> OLD.order_id
     OR NEW.component_id <> OLD.component_id
     OR NEW.expected_qty <> OLD.expected_qty THEN
    RAISE EXCEPTION 'ITEM_LOCKED: identity and expected_qty are fixed at order creation';
  END IF;

  SELECT status INTO current_status FROM cutting_orders WHERE id = OLD.order_id;
  IF current_status <> 'PENDING_VERIFICATION' THEN
    RAISE EXCEPTION 'ITEM_LOCKED: counts can only change while PENDING_VERIFICATION (current: %)', current_status;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER verification_items_guard
BEFORE INSERT OR UPDATE OR DELETE ON "verification_items"
FOR EACH ROW EXECUTE FUNCTION af_guard_items();--> statement-breakpoint

-- 3) Orders: legal start states, frozen core fields, legal transitions only,
--    the DB-level hard stop, and no deletes.
CREATE OR REPLACE FUNCTION af_guard_orders() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ORDER_LOCKED: cutting orders cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('CUTTING_IN_PROGRESS', 'PENDING_VERIFICATION') THEN
      RAISE EXCEPTION 'ILLEGAL_TRANSITION: a new order must start in CUTTING_IN_PROGRESS or PENDING_VERIFICATION (got %)', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.order_no <> OLD.order_no
     OR NEW.recipe_id <> OLD.recipe_id
     OR NEW.target_qty <> OLD.target_qty
     OR NEW.created_by <> OLD.created_by
     OR NEW.created_at <> OLD.created_at
     OR NEW.expected_fabric_yds <> OLD.expected_fabric_yds
     OR NEW.wastage_cap_snapshot <> OLD.wastage_cap_snapshot THEN
    RAISE EXCEPTION 'ORDER_LOCKED: core order fields cannot change after creation';
  END IF;

  IF (NEW.actual_fabric_yds <> OLD.actual_fabric_yds OR NEW.fabric_roll_id <> OLD.fabric_roll_id)
     AND OLD.status NOT IN ('CUTTING_IN_PROGRESS', 'REJECTED') THEN
    RAISE EXCEPTION 'ORDER_LOCKED: fabric details can only change while cutting or after rejection';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'CUTTING_IN_PROGRESS'  AND NEW.status = 'PENDING_VERIFICATION') OR
      (OLD.status = 'REJECTED'             AND NEW.status = 'PENDING_VERIFICATION') OR
      (OLD.status = 'PENDING_VERIFICATION' AND NEW.status IN ('VERIFIED', 'REJECTED')) OR
      (OLD.status = 'VERIFIED'             AND NEW.status = 'SEWING_IN_PROGRESS')
    ) THEN
      RAISE EXCEPTION 'ILLEGAL_TRANSITION: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'VERIFIED' THEN
      IF NOT EXISTS (SELECT 1 FROM verification_items WHERE order_id = NEW.id) THEN
        RAISE EXCEPTION 'HARD_STOP: order has no components';
      END IF;
      IF EXISTS (
        SELECT 1 FROM verification_items
        WHERE order_id = NEW.id AND (actual_qty IS NULL OR actual_qty < expected_qty)
      ) THEN
        RAISE EXCEPTION 'HARD_STOP: uncounted or short components';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER cutting_orders_guard
BEFORE INSERT OR UPDATE OR DELETE ON "cutting_orders"
FOR EACH ROW EXECUTE FUNCTION af_guard_orders();
