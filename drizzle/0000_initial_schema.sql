CREATE TYPE "public"."order_status" AS ENUM('CUTTING_IN_PROGRESS', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SEWING_IN_PROGRESS');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('cutting_supervisor', 'cutting_verifier', 'sewing_supervisor');--> statement-breakpoint
CREATE TYPE "public"."verification_decision" AS ENUM('APPROVED', 'REJECTED');--> statement-breakpoint
CREATE SEQUENCE "public"."order_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "cutting_orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cutting_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_no" text DEFAULT 'CUT-' || lpad(nextval('order_no_seq')::text, 5, '0') NOT NULL,
	"recipe_id" integer NOT NULL,
	"target_qty" integer NOT NULL,
	"fabric_roll_id" text NOT NULL,
	"actual_fabric_yds" numeric(8, 2) NOT NULL,
	"status" "order_status" NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_fabric_yds" numeric(8, 2) NOT NULL,
	"wastage_cap_snapshot" numeric(5, 2) NOT NULL,
	"verification_round" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"sewing_started_by" integer,
	"sewing_started_at" timestamp with time zone,
	CONSTRAINT "cutting_orders_order_no_unique" UNIQUE("order_no"),
	CONSTRAINT "cutting_orders_target_qty_range" CHECK ("cutting_orders"."target_qty" BETWEEN 1 AND 10000),
	CONSTRAINT "cutting_orders_actual_fabric_positive" CHECK ("cutting_orders"."actual_fabric_yds" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_components" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recipe_components_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"recipe_id" integer NOT NULL,
	"component_name" text NOT NULL,
	"pieces_per_garment" integer NOT NULL,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "recipe_components_recipe_name_unique" UNIQUE("recipe_id","component_name"),
	CONSTRAINT "recipe_components_pieces_positive" CHECK ("recipe_components"."pieces_per_garment" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recipes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"recipe_code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"std_fabric_yards" numeric(6, 2) NOT NULL,
	"wastage_cap" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_recipe_code_unique" UNIQUE("recipe_code"),
	CONSTRAINT "recipes_std_fabric_yards_positive" CHECK ("recipes"."std_fabric_yards" > 0),
	CONSTRAINT "recipes_wastage_cap_not_negative" CHECK ("recipes"."wastage_cap" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"full_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lower_case" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "verification_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verification_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"component_id" integer NOT NULL,
	"expected_qty" integer NOT NULL,
	"actual_qty" integer,
	"status" text GENERATED ALWAYS AS (CASE WHEN actual_qty IS NULL THEN NULL WHEN actual_qty = expected_qty THEN 'GREEN' WHEN actual_qty > expected_qty THEN 'YELLOW' ELSE 'RED' END) STORED,
	"counted_by" integer,
	"counted_at" timestamp with time zone,
	CONSTRAINT "verification_items_order_component_unique" UNIQUE("order_id","component_id"),
	CONSTRAINT "verification_items_expected_positive" CHECK ("verification_items"."expected_qty" > 0),
	CONSTRAINT "verification_items_actual_not_negative" CHECK ("verification_items"."actual_qty" IS NULL OR "verification_items"."actual_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "verification_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verification_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"verifier_id" integer NOT NULL,
	"decision" "verification_decision" NOT NULL,
	"rejection_note" text,
	"wastage_pct" numeric(6, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approval_note" text,
	"verification_round" integer NOT NULL,
	"expected_fabric_yds" numeric(8, 2) NOT NULL,
	"actual_fabric_yds" numeric(8, 2) NOT NULL,
	"wastage_exceeds_cap" boolean NOT NULL,
	"variances" jsonb NOT NULL,
	CONSTRAINT "verification_logs_rejection_needs_note" CHECK ("verification_logs"."decision" <> 'REJECTED' OR ("verification_logs"."rejection_note" IS NOT NULL AND char_length(btrim("verification_logs"."rejection_note")) >= 10)),
	CONSTRAINT "verification_logs_approval_has_no_rejection_note" CHECK ("verification_logs"."decision" <> 'APPROVED' OR "verification_logs"."rejection_note" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "cutting_orders" ADD CONSTRAINT "cutting_orders_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_orders" ADD CONSTRAINT "cutting_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_orders" ADD CONSTRAINT "cutting_orders_sewing_started_by_users_id_fk" FOREIGN KEY ("sewing_started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_items" ADD CONSTRAINT "verification_items_order_id_cutting_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."cutting_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_items" ADD CONSTRAINT "verification_items_component_id_recipe_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."recipe_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_items" ADD CONSTRAINT "verification_items_counted_by_users_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_order_id_cutting_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."cutting_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_verifier_id_users_id_fk" FOREIGN KEY ("verifier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cutting_orders_status_idx" ON "cutting_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "verification_logs_order_idx" ON "verification_logs" USING btree ("order_id");