import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as submit } from "@/app/api/orders/[id]/submit/route";
import { GET as getQueue } from "@/app/api/verification/queue/route";
import type { OrderListItemDto } from "@/lib/api-types";
import { apiRequest, routeParams, sessionCookieFor } from "../helpers/auth";
import { createOrder, recordDecision, setCounts } from "../helpers/factories";
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

async function queueAs(role: keyof typeof TEST_USERS, query = ""): Promise<Response> {
  const cookie = await sessionCookieFor(testDb.db, TEST_USERS[role].email);
  return getQueue(apiRequest(`/api/verification/queue${query}`, { cookie }));
}

async function queuedOrders(query = ""): Promise<OrderListItemDto[]> {
  const response = await queueAs("verifier", query);
  expect(response.status).toBe(200);
  return ((await response.json()) as { orders: OrderListItemDto[] }).orders;
}

/** One order in every status the queue must leave out, plus two waiting for a count. */
async function ordersInEveryStatus(): Promise<void> {
  await createOrder(testDb.db); // CUT-00001, pending
  await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" }); // CUT-00002
  const rejected = await createOrder(testDb.db); // CUT-00003
  await recordDecision(testDb.db, rejected, "REJECTED", "Shortage: cuffs 96/100");
  const verified = await createOrder(testDb.db); // CUT-00004
  await setCounts(testDb.db, verified, [50, 50, 100, 50, 100]);
  await recordDecision(testDb.db, verified, "APPROVED");
  await createOrder(testDb.db); // CUT-00005, pending
}

describe("GET /api/verification/queue", () => {
  it("lists only orders waiting for verification, oldest submission first", async () => {
    await ordersInEveryStatus();
    const orders = await queuedOrders();
    expect(orders.map((order) => [order.orderNo, order.status])).toEqual([
      ["CUT-00001", "PENDING_VERIFICATION"],
      ["CUT-00005", "PENDING_VERIFICATION"],
    ]);
  });

  it("ignores query params that try to widen the list", async () => {
    await ordersInEveryStatus();
    const orders = await queuedOrders("?status=VERIFIED&all=true");
    expect(orders.map((order) => order.orderNo)).toEqual(["CUT-00001", "CUT-00005"]);
  });

  it("shows a resubmitted order as round 2, with the rejection that sent it back", async () => {
    const order = await createOrder(testDb.db);
    await recordDecision(testDb.db, order, "REJECTED", "Shortage: cuffs 96/100");
    const cookie = await sessionCookieFor(testDb.db, TEST_USERS.supervisor.email);
    const resubmitted = await submit(
      apiRequest(`/api/orders/${order.id}/submit`, { method: "POST", cookie, body: {} }),
      routeParams(order.id),
    );
    expect(resubmitted.status).toBe(200);

    const [queued] = await queuedOrders();
    expect(queued).toMatchObject({
      orderNo: order.orderNo,
      verificationRound: 2,
      latestLog: { decision: "REJECTED", rejectionNote: "Shortage: cuffs 96/100" },
    });
  });

  it.each(["supervisor", "sewing"] as const)("refuses the %s role with 403", async (role) => {
    expect((await queueAs(role)).status).toBe(403);
  });

  it("refuses anonymous callers with 401", async () => {
    expect((await getQueue(apiRequest("/api/verification/queue"))).status).toBe(401);
  });
});
