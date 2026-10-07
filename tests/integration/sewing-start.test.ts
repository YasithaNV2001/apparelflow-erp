import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as startSewing } from "@/app/api/orders/[id]/start-sewing/route";
import type { SewingOrderDto } from "@/lib/api-types";
import { cuttingOrders } from "@/server/db/schema";
import { apiRequest, routeParams, sessionCookieFor } from "../helpers/auth";
import {
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

// Casual Blouse × 50 with every component counted exactly.
const ALL_GREEN = [50, 50, 100, 50, 100];

async function startAs(
  role: keyof typeof TEST_USERS,
  orderId: number | string,
  body?: unknown,
): Promise<Response> {
  const cookie = await sessionCookieFor(testDb.db, TEST_USERS[role].email);
  const request = apiRequest(`/api/orders/${orderId}/start-sewing`, { method: "POST", cookie, body });
  return startSewing(request, routeParams(orderId));
}

async function verifiedOrder(): Promise<TestOrder> {
  const order = await createOrder(testDb.db);
  await setCounts(testDb.db, order, ALL_GREEN);
  await recordDecision(testDb.db, order, "APPROVED");
  return order;
}

async function storedOrder(order: TestOrder) {
  const [row] = await testDb.db.select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
  return row;
}

describe("POST /api/orders/:id/start-sewing", () => {
  it("puts a verified batch on the assembly line, signed by the session user", async () => {
    const order = await verifiedOrder();
    const before = Date.now();

    const response = await startAs("sewing", order.id);
    expect(response.status).toBe(200);
    const { order: started } = (await response.json()) as { order: SewingOrderDto };
    expect(started).toMatchObject({
      orderNo: order.orderNo,
      status: "SEWING_IN_PROGRESS",
      sewingStartedBy: { fullName: TEST_USERS.sewing.fullName },
      approval: { decision: "APPROVED" },
    });

    const stored = await storedOrder(order);
    expect(stored.status).toBe("SEWING_IN_PROGRESS");
    expect(stored.sewingStartedBy).toBe(await findUserId(testDb.db, TEST_USERS.sewing.email));
    // Stamped by the database during the request, and reported as stored.
    const startedAt = stored.sewingStartedAt?.getTime() ?? 0;
    expect(Math.abs(startedAt - before)).toBeLessThan(60_000);
    expect(started.sewingStartedAt).toBe(stored.sewingStartedAt?.toISOString());
  });

  it("ignores who and when the client claims started it", async () => {
    const order = await verifiedOrder();
    const response = await startAs("sewing", order.id, {
      sewingStartedBy: 999,
      sewingStartedAt: "2000-01-01T00:00:00.000Z",
      status: "VERIFIED",
    });
    expect(response.status).toBe(200);

    const stored = await storedOrder(order);
    expect(stored.status).toBe("SEWING_IN_PROGRESS");
    expect(stored.sewingStartedBy).toBe(await findUserId(testDb.db, TEST_USERS.sewing.email));
    expect(stored.sewingStartedAt?.getUTCFullYear()).not.toBe(2000);
  });

  it("answers 409 when sewing has already started, keeping the first start", async () => {
    const order = await verifiedOrder();
    expect((await startAs("sewing", order.id)).status).toBe(200);
    const firstStart = (await storedOrder(order)).sewingStartedAt;

    const again = await startAs("sewing", order.id);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: "INVALID_STATE" } });
    expect((await storedOrder(order)).sewingStartedAt).toEqual(firstStart);
  });

  it.each(["PENDING_VERIFICATION", "CUTTING_IN_PROGRESS"] as const)(
    "answers 404 for a %s order, which sewing cannot see",
    async (status) => {
      const order = await createOrder(testDb.db, { status });
      const response = await startAs("sewing", order.id);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
      expect((await storedOrder(order)).status).toBe(status);
    },
  );

  it("answers 404 for a rejected order", async () => {
    const order = await createOrder(testDb.db);
    await recordDecision(testDb.db, order, "REJECTED", "Shortage: cuffs 96/100");
    expect((await startAs("sewing", order.id)).status).toBe(404);
    expect((await storedOrder(order)).status).toBe("REJECTED");
  });

  it.each([999, "abc"])("answers 404 for the order id %j", async (orderId) => {
    expect((await startAs("sewing", orderId)).status).toBe(404);
  });

  it("answers a hidden order exactly like one that does not exist", async () => {
    const pending = await createOrder(testDb.db);
    const hidden = await startAs("sewing", pending.id);
    const missing = await startAs("sewing", 999);
    expect(hidden.status).toBe(404);
    expect(await hidden.text()).toBe(await missing.text());
  });

  it.each(["supervisor", "verifier"] as const)("refuses the %s role with 403 and changes nothing", async (role) => {
    const order = await verifiedOrder();
    const response = await startAs(role, order.id);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN_ROLE" } });
    expect((await storedOrder(order)).status).toBe("VERIFIED");
  });

  it("refuses anonymous callers with 401", async () => {
    const order = await verifiedOrder();
    const request = apiRequest(`/api/orders/${order.id}/start-sewing`, { method: "POST" });
    expect((await startSewing(request, routeParams(order.id))).status).toBe(401);
  });
});
