import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { classifyComponent } from "@/domain/traffic-light";
import { cuttingOrders, verificationItems, verificationLogs } from "@/server/db/schema";
import { rejectionMessage } from "../helpers/db-errors";
import { createOrder, findUserId, setCounts, type TestOrder } from "../helpers/factories";
import { TEST_USERS } from "../helpers/fixtures";
import { createTestDb, resetDb, type TestDb } from "../helpers/test-db";

// Raw SQL on purpose: these tests attack the database directly, the way a buggy
// service or a hand-written SQL session would (PLAN §9.3 "DB guards").

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});

beforeEach(async () => {
  await resetDb(testDb.db);
});

afterAll(async () => {
  await testDb.close();
});

// Casual Blouse × 50 expects 50 / 50 / 100 / 50 / 100.
const ALL_MATCH = [50, 50, 100, 50, 100];
const CUFFS_SHORT = [50, 50, 100, 50, 96];

async function setStatus(order: TestOrder, status: string): Promise<void> {
  await testDb.db.execute(
    sql`UPDATE cutting_orders SET status = ${status}::order_status WHERE id = ${order.id}`,
  );
}

async function statusOf(order: TestOrder): Promise<string> {
  const [row] = await testDb.db
    .select({ status: cuttingOrders.status })
    .from(cuttingOrders)
    .where(eq(cuttingOrders.id, order.id));
  return row.status;
}

async function insertLog(
  order: TestOrder,
  decision: "APPROVED" | "REJECTED",
  rejectionNote: string | null,
): Promise<void> {
  await testDb.db.insert(verificationLogs).values({
    orderId: order.id,
    verifierId: await findUserId(testDb.db, TEST_USERS.verifier.email),
    decision,
    rejectionNote,
    wastagePct: 4.44,
    verificationRound: 1,
    expectedFabricYds: 90,
    actualFabricYds: 94,
    wastageExceedsCap: false,
    variances: [],
  });
}

describe("generated item status", () => {
  it.each([100, 102, 96, 0, null])(
    "matches classifyComponent for expected 100, actual %s",
    async (actualQty) => {
      const order = await createOrder(testDb.db);
      const sleeves = order.items[2]; // expected 100
      await testDb.db
        .update(verificationItems)
        .set({ actualQty })
        .where(eq(verificationItems.id, sleeves.id));

      const [row] = await testDb.db
        .select({ status: verificationItems.status })
        .from(verificationItems)
        .where(eq(verificationItems.id, sleeves.id));
      const expected = classifyComponent(100, actualQty);
      expect(row.status).toBe(expected === "UNCOUNTED" ? null : expected);
    },
  );
});

describe("hard stop", () => {
  it("refuses VERIFIED while any component is uncounted", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, [50, 50, 100, null, 100]);
    expect(await rejectionMessage(() => setStatus(order, "VERIFIED"))).toMatch(/^HARD_STOP/);
    expect(await statusOf(order)).toBe("PENDING_VERIFICATION");
  });

  it("refuses VERIFIED while any component is short (cuffs 96/100)", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, CUFFS_SHORT);
    expect(await rejectionMessage(() => setStatus(order, "VERIFIED"))).toMatch(/^HARD_STOP/);
  });

  it("refuses VERIFIED for an order without components", async () => {
    const order = await createOrder(testDb.db, { withItems: false });
    expect(await rejectionMessage(() => setStatus(order, "VERIFIED"))).toBe(
      "HARD_STOP: order has no components",
    );
  });

  it("allows VERIFIED when every component is counted and none is short", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, [50, 50, 102, 50, 100]); // one YELLOW is fine (D12)
    await setStatus(order, "VERIFIED");
    expect(await statusOf(order)).toBe("VERIFIED");
  });
});

describe("state transitions", () => {
  it("walks the legal path CUTTING → PENDING → VERIFIED → SEWING", async () => {
    const order = await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" });
    await setStatus(order, "PENDING_VERIFICATION");
    await setCounts(testDb.db, order, ALL_MATCH);
    await setStatus(order, "VERIFIED");
    await setStatus(order, "SEWING_IN_PROGRESS");
    expect(await statusOf(order)).toBe("SEWING_IN_PROGRESS");
  });

  it.each([
    { from: "PENDING_VERIFICATION", to: "SEWING_IN_PROGRESS" },
    { from: "VERIFIED", to: "PENDING_VERIFICATION" },
    { from: "VERIFIED", to: "REJECTED" },
  ])("refuses $from → $to", async ({ from, to }) => {
    const order = await createOrder(testDb.db);
    if (from === "VERIFIED") {
      await setCounts(testDb.db, order, ALL_MATCH);
      await setStatus(order, "VERIFIED");
    }
    expect(await rejectionMessage(() => setStatus(order, to))).toBe(
      `ILLEGAL_TRANSITION: ${from} -> ${to}`,
    );
  });

  it("refuses to insert an order that is already VERIFIED", async () => {
    const message = await rejectionMessage(() =>
      testDb.db.execute(sql`
        INSERT INTO cutting_orders (recipe_id, target_qty, fabric_roll_id, actual_fabric_yds,
          status, created_by, expected_fabric_yds, wastage_cap_snapshot)
        VALUES (1, 50, 'FAB-ROLL-1', 94, 'VERIFIED', 1, 90, 5)
      `),
    );
    expect(message).toMatch(/^ILLEGAL_TRANSITION: a new order must start/);
  });
});

describe("locked records", () => {
  it("freezes counts once the order is VERIFIED", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, ALL_MATCH);
    await setStatus(order, "VERIFIED");
    const message = await rejectionMessage(() =>
      testDb.db.execute(sql`UPDATE verification_items SET actual_qty = 1 WHERE order_id = ${order.id}`),
    );
    expect(message).toMatch(/^ITEM_LOCKED/);
  });

  it("refuses an item that arrives already counted", async () => {
    const order = await createOrder(testDb.db, { withItems: false });
    const message = await rejectionMessage(() =>
      testDb.db.execute(sql`
        INSERT INTO verification_items (order_id, component_id, expected_qty, actual_qty)
        VALUES (${order.id}, 1, 50, 50)
      `),
    );
    expect(message).toMatch(/^ITEM_LOCKED/);
  });

  it("refuses to change the target quantity after creation", async () => {
    const order = await createOrder(testDb.db);
    const message = await rejectionMessage(() =>
      testDb.db.execute(sql`UPDATE cutting_orders SET target_qty = 60 WHERE id = ${order.id}`),
    );
    expect(message).toMatch(/^ORDER_LOCKED/);
  });

  it.each([
    { table: "cutting_orders", code: "ORDER_LOCKED" },
    { table: "verification_items", code: "ITEM_LOCKED" },
  ])("refuses to delete rows from $table", async ({ table, code }) => {
    await createOrder(testDb.db);
    const message = await rejectionMessage(() =>
      testDb.db.execute(sql`DELETE FROM ${sql.identifier(table)}`),
    );
    expect(message.startsWith(code)).toBe(true);
  });
});

describe("audit log", () => {
  it.each([
    { label: "updated", statement: sql`UPDATE verification_logs SET wastage_pct = 0` },
    { label: "deleted", statement: sql`DELETE FROM verification_logs` },
  ])("cannot be $label", async ({ statement }) => {
    const order = await createOrder(testDb.db);
    await insertLog(order, "APPROVED", null);
    expect(await rejectionMessage(() => testDb.db.execute(statement))).toBe(
      "AUDIT_IMMUTABLE: verification_logs is append-only",
    );
  });

  it.each([null, "   ", "short"])(
    "refuses a REJECTED decision with note %j",
    async (note) => {
      const order = await createOrder(testDb.db);
      const message = await rejectionMessage(() => insertLog(order, "REJECTED", note));
      expect(message).toContain("verification_logs_rejection_needs_note");
    },
  );

  it("refuses an APPROVED decision that carries a rejection note", async () => {
    const order = await createOrder(testDb.db);
    const message = await rejectionMessage(() =>
      insertLog(order, "APPROVED", "Shortage: cuffs 96/100"),
    );
    expect(message).toContain("verification_logs_approval_has_no_rejection_note");
  });
});

describe("row level security", () => {
  it("is enabled on all six tables", async () => {
    const [row] = await testDb.db
      .select({ tables: sql<number>`count(*)::int` })
      .from(sql`pg_class`)
      .where(sql`relrowsecurity AND relname IN ('users', 'recipes', 'recipe_components',
        'cutting_orders', 'verification_items', 'verification_logs')`);
    expect(row.tables).toBe(6);
  });
});
