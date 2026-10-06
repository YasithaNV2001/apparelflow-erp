import "server-only";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
// Relative import: drizzle-kit and the seed scripts load this file without the @/ alias.
import {
  ORDER_STATUSES,
  REJECTION_NOTE_MIN_LENGTH,
  ROLES,
  TARGET_QTY_MAX,
  TARGET_QTY_MIN,
  VERIFICATION_DECISIONS,
  type ComponentStatus,
} from "../../domain/constants";

// Column names follow PDF §8 exactly; extra columns are refinements (PLAN §6.1).

export const userRole = pgEnum("user_role", ROLES);
export const orderStatus = pgEnum("order_status", ORDER_STATUSES);
export const verificationDecision = pgEnum("verification_decision", VERIFICATION_DECISIONS);

/** Numbers each order CUT-00001, CUT-00002, … The integrity migration makes the column own it. */
export const orderNoSeq = pgSequence("order_no_seq");

/** Writes a constant into DDL as a literal; CHECK constraints cannot take query parameters. */
function sqlLiteral(value: number) {
  return sql.raw(String(value));
}

function createdAt() {
  return timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
}

export const users = pgTable(
  "users",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    fullName: text("full_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("users_email_lower_case", sql`${t.email} = lower(${t.email})`)],
);

export const recipes = pgTable(
  "recipes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    recipeCode: text("recipe_code").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    stdFabricYards: numeric("std_fabric_yards", { precision: 6, scale: 2, mode: "number" }).notNull(),
    wastageCap: numeric("wastage_cap", { precision: 5, scale: 2, mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("recipes_std_fabric_yards_positive", sql`${t.stdFabricYards} > 0`),
    check("recipes_wastage_cap_not_negative", sql`${t.wastageCap} >= 0`),
  ],
);

export const recipeComponents = pgTable(
  "recipe_components",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    recipeId: integer("recipe_id").notNull().references(() => recipes.id),
    componentName: text("component_name").notNull(),
    piecesPerGarment: integer("pieces_per_garment").notNull(),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    unique("recipe_components_recipe_name_unique").on(t.recipeId, t.componentName),
    check("recipe_components_pieces_positive", sql`${t.piecesPerGarment} > 0`),
  ],
);

export const cuttingOrders = pgTable(
  "cutting_orders",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    orderNo: text("order_no")
      .notNull()
      .unique()
      .default(sql`'CUT-' || lpad(nextval('order_no_seq')::text, 5, '0')`),
    recipeId: integer("recipe_id").notNull().references(() => recipes.id),
    targetQty: integer("target_qty").notNull(),
    fabricRollId: text("fabric_roll_id").notNull(),
    actualFabricYds: numeric("actual_fabric_yds", { precision: 8, scale: 2, mode: "number" }).notNull(),
    status: orderStatus("status").notNull(),
    createdBy: integer("created_by").notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Refinements: snapshots taken at creation so recipe edits never change past orders (D15).
    expectedFabricYds: numeric("expected_fabric_yds", { precision: 8, scale: 2, mode: "number" }).notNull(),
    wastageCapSnapshot: numeric("wastage_cap_snapshot", { precision: 5, scale: 2, mode: "number" }).notNull(),
    verificationRound: integer("verification_round").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    sewingStartedBy: integer("sewing_started_by").references(() => users.id),
    sewingStartedAt: timestamp("sewing_started_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "cutting_orders_target_qty_range",
      sql`${t.targetQty} BETWEEN ${sqlLiteral(TARGET_QTY_MIN)} AND ${sqlLiteral(TARGET_QTY_MAX)}`,
    ),
    check("cutting_orders_actual_fabric_positive", sql`${t.actualFabricYds} > 0`),
    index("cutting_orders_status_idx").on(t.status),
  ],
);

/** One counted component inside a verification log snapshot (D29). */
export interface VarianceSnapshot {
  componentId: number;
  componentName: string;
  expected: number;
  actual: number | null;
  variance: number | null;
  status: ComponentStatus;
}

export const verificationItems = pgTable(
  "verification_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    orderId: integer("order_id").notNull().references(() => cuttingOrders.id),
    componentId: integer("component_id").notNull().references(() => recipeComponents.id),
    expectedQty: integer("expected_qty").notNull(),
    actualQty: integer("actual_qty"),
    // Computed by Postgres, so no client or service can write a wrong colour (PLAN §6.1).
    status: text("status").generatedAlwaysAs(
      sql`CASE WHEN actual_qty IS NULL THEN NULL WHEN actual_qty = expected_qty THEN 'GREEN' WHEN actual_qty > expected_qty THEN 'YELLOW' ELSE 'RED' END`,
    ),
    countedBy: integer("counted_by").references(() => users.id),
    countedAt: timestamp("counted_at", { withTimezone: true }),
  },
  (t) => [
    // Its index starts with order_id, so it also serves lookups by order.
    unique("verification_items_order_component_unique").on(t.orderId, t.componentId),
    check("verification_items_expected_positive", sql`${t.expectedQty} > 0`),
    check("verification_items_actual_not_negative", sql`${t.actualQty} IS NULL OR ${t.actualQty} >= 0`),
  ],
);

export const verificationLogs = pgTable(
  "verification_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    orderId: integer("order_id").notNull().references(() => cuttingOrders.id),
    verifierId: integer("verifier_id").notNull().references(() => users.id),
    decision: verificationDecision("decision").notNull(),
    rejectionNote: text("rejection_note"),
    wastagePct: numeric("wastage_pct", { precision: 6, scale: 2, mode: "number" }).notNull(),
    createdAt: createdAt(),
    // Refinements: a complete, immutable record of each decision (D28, D29).
    approvalNote: text("approval_note"),
    verificationRound: integer("verification_round").notNull(),
    expectedFabricYds: numeric("expected_fabric_yds", { precision: 8, scale: 2, mode: "number" }).notNull(),
    actualFabricYds: numeric("actual_fabric_yds", { precision: 8, scale: 2, mode: "number" }).notNull(),
    wastageExceedsCap: boolean("wastage_exceeds_cap").notNull(),
    variances: jsonb("variances").$type<VarianceSnapshot[]>().notNull(),
  },
  (t) => [
    // IS NOT NULL matters: a CHECK passes when its expression is NULL.
    check(
      "verification_logs_rejection_needs_note",
      sql`${t.decision} <> 'REJECTED' OR (${t.rejectionNote} IS NOT NULL AND char_length(btrim(${t.rejectionNote})) >= ${sqlLiteral(REJECTION_NOTE_MIN_LENGTH)})`,
    ),
    check(
      "verification_logs_approval_has_no_rejection_note",
      sql`${t.decision} <> 'APPROVED' OR ${t.rejectionNote} IS NULL`,
    ),
    index("verification_logs_order_idx").on(t.orderId),
  ],
);
