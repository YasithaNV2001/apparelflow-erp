import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as approve } from "@/app/api/orders/[id]/approve/route";
import type { OrderDto } from "@/lib/api-types";
import { cuttingOrders, verificationItems, verificationLogs } from "@/server/db/schema";
import { apiRequest, routeParams, sessionCookieFor } from "../helpers/auth";
import {
  countSheet,
  createOrder,
  findUserId,
  recordDecision,
  setCounts,
  type TestOrder,
} from "../helpers/factories";
import { TEST_USERS } from "../helpers/fixtures";
import { createTestDb, resetDb, type TestDb } from "../helpers/test-db";

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

// Casual Blouse × 50: front, back, sleeves, collar, cuffs.
const ALL_GREEN = [50, 50, 100, 50, 100];

async function approveAs(
  role: keyof typeof TEST_USERS,
  id: number | string,
  body: unknown = {},
): Promise<Response> {
  const cookie = await sessionCookieFor(testDb.db, TEST_USERS[role].email);
  return approve(apiRequest(`/api/orders/${id}/approve`, { method: "POST", cookie, body }), routeParams(id));
}

async function approvedOrder(id: number, body: unknown = {}): Promise<OrderDto> {
  const response = await approveAs("verifier", id, body);
  expect(response.status).toBe(200);
  return ((await response.json()) as { order: OrderDto }).order;
}

async function expectUnchanged(order: TestOrder, counts: readonly (number | null)[]): Promise<void> {
  const [stored] = await testDb.db.select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
  expect(stored.status).toBe("PENDING_VERIFICATION");
  const items = await testDb.db
    .select()
    .from(verificationItems)
    .where(eq(verificationItems.orderId, order.id))
    .orderBy(verificationItems.id);
  expect(items.map((item) => item.actualQty)).toEqual(counts);
  const logs = await testDb.db.select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
  expect(logs).toHaveLength(0);
}

describe("POST /api/orders/:id/approve: approvable batches", () => {
  it("approves counts saved earlier by autosave, with an empty body", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, ALL_GREEN);
    const approved = await approvedOrder(order.id);

    expect(approved.status).toBe("VERIFIED");
    expect(approved.logs).toHaveLength(1);
    expect(approved.logs[0]).toMatchObject({
      decision: "APPROVED",
      verifier: { fullName: TEST_USERS.verifier.fullName },
      verificationRound: 1,
      wastagePct: 4.44,
      wastageExceedsCap: false,
      rejectionNote: null,
      approvalNote: null,
    });
  });

  it("writes a complete sheet sent with the request, then approves it", async () => {
    const order = await createOrder(testDb.db);
    const approved = await approvedOrder(order.id, { items: countSheet(order, ALL_GREEN) });
    expect(approved.items.map((item) => item.actualQty)).toEqual(ALL_GREEN);
    expect(approved.summary).toMatchObject({ green: 5, canApprove: true });
  });

  it("approves excess (YELLOW) and keeps the surplus in the variance snapshot (D12)", async () => {
    const order = await createOrder(testDb.db);
    const approved = await approvedOrder(order.id, { items: countSheet(order, [50, 50, 100, 50, 102]) });

    expect(approved.status).toBe("VERIFIED");
    expect(approved.logs[0].variances[4]).toEqual({
      componentId: order.items[4].componentId,
      componentName: "Sleeve Cuffs",
      expected: 100,
      actual: 102,
      variance: 2,
      status: "YELLOW",
    });
  });

  it("approves despite wastage over the cap, which is a warning only (D13)", async () => {
    const order = await createOrder(testDb.db, { recipeCode: "REC-CT02", targetQty: 40, actualFabricYds: 48 });
    const approved = await approvedOrder(order.id, { items: countSheet(order, [40, 40, 40, 40, 80]) });
    expect(approved.logs[0]).toMatchObject({ wastagePct: 9.09, wastageExceedsCap: true });
  });

  it("stores the trimmed approval note, and no note for one that is only spaces", async () => {
    const first = await createOrder(testDb.db);
    const noted = await approvedOrder(first.id, {
      items: countSheet(first, ALL_GREEN),
      approvalNote: "  Cuffs bundled separately.  ",
    });
    expect(noted.logs[0].approvalNote).toBe("Cuffs bundled separately.");

    const second = await createOrder(testDb.db);
    const blank = await approvedOrder(second.id, { items: countSheet(second, ALL_GREEN), approvalNote: "   " });
    expect(blank.logs[0].approvalNote).toBeNull();
  });

  it("ignores a verifier, status, wastage or time sent by the client (D19)", async () => {
    const order = await createOrder(testDb.db);
    const before = new Date();
    await approvedOrder(order.id, {
      items: countSheet(order, ALL_GREEN),
      verifierId: 999,
      verifier_id: 1,
      status: "SEWING_IN_PROGRESS",
      wastagePct: 0,
      decision: "REJECTED",
      createdAt: "2020-01-01T00:00:00.000Z",
    });

    const [log] = await testDb.db.select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
    expect(log).toMatchObject({
      verifierId: await findUserId(testDb.db, TEST_USERS.verifier.email),
      decision: "APPROVED",
      wastagePct: 4.44,
    });
    expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });
});

describe("POST /api/orders/:id/approve: the hard stop (422)", () => {
  it("refuses an uncounted component and names it", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, [50, 50, 100, null, 100]);

    const response = await approveAs("verifier", order.id);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: "HARD_STOP_UNCOUNTED",
        message: "Cannot approve: 1 component is not counted.",
        details: [{ component: "Collar & Stand", expected: 50 }],
      },
    });
    await expectUnchanged(order, [50, 50, 100, null, 100]);
  });

  it("refuses a sheet that leaves a component out, and writes none of it", async () => {
    const order = await createOrder(testDb.db);
    const sheet = countSheet(order, ALL_GREEN).slice(0, 4);

    const response = await approveAs("verifier", order.id, { items: sheet });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: "HARD_STOP_MISSING_COMPONENTS",
        details: [{ component: "Sleeve Cuffs", expected: 100 }],
      },
    });
    await expectUnchanged(order, [null, null, null, null, null]);
  });

  it("treats a count of 0 as short (D17)", async () => {
    const order = await createOrder(testDb.db);
    const response = await approveAs("verifier", order.id, { items: countSheet(order, [50, 50, 100, 0, 100]) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: "HARD_STOP_SHORTAGE",
        details: [{ component: "Collar & Stand", expected: 50, actual: 0, shortBy: 50 }],
      },
    });
  });

  it("rolls back the counts it wrote when the shortage check fails (PLAN §5.5 step 7)", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, [50, 50, 100, 50, null]);

    const response = await approveAs("verifier", order.id, { items: countSheet(order, [49, 50, 100, 50, 96]) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "HARD_STOP_SHORTAGE", message: "Cannot approve: 2 components are short." },
    });
    await expectUnchanged(order, [50, 50, 100, 50, null]);
  });

  it("decides on stored counts, so an earlier short count still blocks an empty body", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, [50, 50, 100, 50, 96]);
    expect((await approveAs("verifier", order.id)).status).toBe(422);
    await expectUnchanged(order, [50, 50, 100, 50, 96]);
  });
});

describe("POST /api/orders/:id/approve: invalid input (400)", () => {
  it("returns 400 for a component from another order, before checking completeness", async () => {
    const order = await createOrder(testDb.db);
    const other = await createOrder(testDb.db, { recipeCode: "REC-CT02", targetQty: 60 });
    const sheet = [...countSheet(order, ALL_GREEN).slice(0, 4), { componentId: other.items[0].componentId, actualQty: 60 }];

    const response = await approveAs("verifier", order.id, { items: sheet });
    expect(response.status).toBe(400);
    await expectUnchanged(order, [null, null, null, null, null]);
  });

  it.each([
    { case: "a cleared count", actualQty: null },
    { case: "a numeric string", actualQty: "100" },
    { case: "a decimal", actualQty: 99.5 },
  ])("returns 400 for $case in the sheet (Approve needs real counts)", async ({ actualQty }) => {
    const order = await createOrder(testDb.db);
    const sheet = countSheet(order, ALL_GREEN);
    sheet[4] = { ...sheet[4], actualQty: actualQty as number };
    expect((await approveAs("verifier", order.id, { items: sheet })).status).toBe(400);
  });

  it("returns 400 for an approval note over 500 characters", async () => {
    const order = await createOrder(testDb.db);
    const body = { items: countSheet(order, ALL_GREEN), approvalNote: "x".repeat(501) };
    expect((await approveAs("verifier", order.id, body)).status).toBe(400);
  });
});

describe("POST /api/orders/:id/approve: state and visibility", () => {
  it("returns 409 for the second of two approvals", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, ALL_GREEN);
    await approvedOrder(order.id);

    const response = await approveAs("verifier", order.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_STATE" } });
    const logs = await testDb.db.select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
    expect(logs).toHaveLength(1);
  });

  it("lets exactly one of two simultaneous approvals through", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, ALL_GREEN);
    const statuses = await Promise.all([approveAs("verifier", order.id), approveAs("verifier", order.id)]).then(
      (responses) => responses.map((response) => response.status).sort(),
    );
    expect(statuses).toEqual([200, 409]);
  });

  it("returns 409 for an order the verifier rejected", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, ALL_GREEN);
    await recordDecision(testDb.db, order, "REJECTED", "Fabric flaw on several panels");
    expect((await approveAs("verifier", order.id)).status).toBe(409);
  });

  it("returns 404 for an order still being cut", async () => {
    const order = await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" });
    expect((await approveAs("verifier", order.id)).status).toBe(404);
  });

  it.each([999, "abc"])("returns 404 for order id %s", async (id) => {
    expect((await approveAs("verifier", id)).status).toBe(404);
  });
});
