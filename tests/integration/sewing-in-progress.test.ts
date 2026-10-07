import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as startSewing } from "@/app/api/orders/[id]/start-sewing/route";
import { GET as getInProgress } from "@/app/api/sewing/in-progress/route";
import { GET as getQueue } from "@/app/api/sewing/queue/route";
import type { SewingOrderDto } from "@/lib/api-types";
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

// Casual Blouse × 50 with every component counted exactly.
const ALL_GREEN = [50, 50, 100, 50, 100];

async function sewingCookie(): Promise<string> {
  return sessionCookieFor(testDb.db, TEST_USERS.sewing.email);
}

async function listAs(role: keyof typeof TEST_USERS, query = ""): Promise<Response> {
  const cookie = await sessionCookieFor(testDb.db, TEST_USERS[role].email);
  return getInProgress(apiRequest(`/api/sewing/in-progress${query}`, { cookie }));
}

async function onAssemblyLine(query = ""): Promise<SewingOrderDto[]> {
  const response = await listAs("sewing", query);
  expect(response.status).toBe(200);
  return ((await response.json()) as { orders: SewingOrderDto[] }).orders;
}

async function inQueue(): Promise<string[]> {
  const response = await getQueue(apiRequest("/api/sewing/queue", { cookie: await sewingCookie() }));
  return ((await response.json()) as { orders: SewingOrderDto[] }).orders.map((order) => order.orderNo);
}

async function verifiedOrder(): Promise<TestOrder> {
  const order = await createOrder(testDb.db);
  await setCounts(testDb.db, order, ALL_GREEN);
  await recordDecision(testDb.db, order, "APPROVED");
  return order;
}

/** Through the real endpoint, so the start time comes from the database clock. */
async function start(order: TestOrder): Promise<void> {
  const request = apiRequest(`/api/orders/${order.id}/start-sewing`, { method: "POST", cookie: await sewingCookie() });
  expect((await startSewing(request, routeParams(order.id))).status).toBe(200);
}

/** One order in every status; CUT-00004 and CUT-00005 are on the assembly line, CUT-00005 started first. */
async function ordersInEveryStatus(): Promise<void> {
  await createOrder(testDb.db); // CUT-00001, pending
  await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" }); // CUT-00002
  const rejected = await createOrder(testDb.db); // CUT-00003
  await recordDecision(testDb.db, rejected, "REJECTED", "Shortage: cuffs 96/100");
  const startedLast = await verifiedOrder(); // CUT-00004
  const startedFirst = await verifiedOrder(); // CUT-00005
  await verifiedOrder(); // CUT-00006, still in the queue
  await start(startedFirst);
  await start(startedLast);
}

describe("GET /api/sewing/in-progress", () => {
  it("lists only batches on the assembly line, most recently started first", async () => {
    await ordersInEveryStatus();
    const orders = await onAssemblyLine();
    expect(orders.map((order) => [order.orderNo, order.status])).toEqual([
      ["CUT-00004", "SEWING_IN_PROGRESS"],
      ["CUT-00005", "SEWING_IN_PROGRESS"],
    ]);
    for (const order of orders) {
      expect(order.sewingStartedBy).toMatchObject({ fullName: TEST_USERS.sewing.fullName });
      expect(order.sewingStartedAt).toEqual(expect.any(String));
    }
  });

  it("ignores query params that try to widen the list", async () => {
    await ordersInEveryStatus();
    const orders = await onAssemblyLine("?status=PENDING_VERIFICATION&all=true");
    expect(orders.map((order) => order.orderNo)).toEqual(["CUT-00004", "CUT-00005"]);
  });

  it("moves a started batch from the queue to the assembly line", async () => {
    const order = await verifiedOrder();
    expect(await inQueue()).toEqual([order.orderNo]);
    expect(await onAssemblyLine()).toEqual([]);

    await start(order);

    expect(await inQueue()).toEqual([]);
    expect((await onAssemblyLine()).map((started) => started.orderNo)).toEqual([order.orderNo]);
  });

  it.each(["supervisor", "verifier"] as const)("refuses the %s role with 403", async (role) => {
    const response = await listAs(role);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN_ROLE" } });
  });

  it("refuses anonymous callers with 401", async () => {
    expect((await getInProgress(apiRequest("/api/sewing/in-progress"))).status).toBe(401);
  });
});
