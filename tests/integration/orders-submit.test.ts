import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as submit } from "@/app/api/orders/[id]/submit/route";
import type { OrderDto } from "@/lib/api-types";
import { verificationLogs } from "@/server/db/schema";
import { apiRequest, routeParams, sessionCookieFor } from "../helpers/auth";
import { createOrder, recordDecision, setCounts, type TestOrder } from "../helpers/factories";
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

async function submitAs(
  role: keyof typeof TEST_USERS,
  id: number | string,
  body: unknown = {},
): Promise<Response> {
  const cookie = await sessionCookieFor(testDb.db, TEST_USERS[role].email);
  return submit(apiRequest(`/api/orders/${id}/submit`, { method: "POST", cookie, body }), routeParams(id));
}

async function submittedOrder(id: number, body: unknown = {}): Promise<OrderDto> {
  const response = await submitAs("supervisor", id, body);
  expect(response.status).toBe(200);
  return ((await response.json()) as { order: OrderDto }).order;
}

async function rejectedOrder(): Promise<TestOrder> {
  const order = await createOrder(testDb.db);
  await setCounts(testDb.db, order, [50, 50, 100, 50, 96]);
  await recordDecision(testDb.db, order, "REJECTED", "Shortage: cuffs 96/100");
  return order;
}

describe("POST /api/orders/:id/submit", () => {
  it("moves a cutting order to PENDING_VERIFICATION, round 1", async () => {
    const order = await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" });
    const submitted = await submittedOrder(order.id);
    expect(submitted).toMatchObject({ status: "PENDING_VERIFICATION", verificationRound: 1 });
    expect(submitted.submittedAt).not.toBeNull();
  });

  it("accepts a corrected fabric figure while still cutting", async () => {
    const order = await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" });
    const submitted = await submittedOrder(order.id, { actualFabricYds: 96 });
    expect(submitted).toMatchObject({ actualFabricYds: 96, wastagePct: 6.67, wastageExceedsCap: true });
  });

  it("resubmits a rejected order for a fresh recount (D9)", async () => {
    const order = await rejectedOrder();
    const resubmitted = await submittedOrder(order.id, { actualFabricYds: 95.5 });

    expect(resubmitted).toMatchObject({ status: "PENDING_VERIFICATION", verificationRound: 2, actualFabricYds: 95.5 });
    expect(resubmitted.items.every((item) => item.actualQty === null)).toBe(true);
    expect(resubmitted.logs.map((log) => log.decision)).toEqual(["REJECTED"]);
  });

  it("keeps the rejection log after the resubmit (audit trail)", async () => {
    const order = await rejectedOrder();
    await submittedOrder(order.id);
    const logs = await testDb.db.select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
    expect(logs).toHaveLength(1);
  });

  it("returns 409 for an order already waiting for verification", async () => {
    const order = await createOrder(testDb.db);
    const response = await submitAs("supervisor", order.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_STATE" } });
  });

  it("returns 409 for a verified order", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, [50, 50, 100, 50, 100]);
    await recordDecision(testDb.db, order, "APPROVED");
    expect((await submitAs("supervisor", order.id)).status).toBe(409);
  });

  it("returns 400 for an invalid fabric figure", async () => {
    const order = await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" });
    expect((await submitAs("supervisor", order.id, { actualFabricYds: 94.555 })).status).toBe(400);
  });

  it("returns 404 for an order that does not exist", async () => {
    expect((await submitAs("supervisor", 999)).status).toBe(404);
  });

  it.each(["verifier", "sewing"] as const)("refuses the %s role with 403", async (role) => {
    const order = await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" });
    expect((await submitAs(role, order.id)).status).toBe(403);
  });
});
