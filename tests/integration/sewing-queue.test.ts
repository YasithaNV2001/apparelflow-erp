import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as submit } from "@/app/api/orders/[id]/submit/route";
import { GET as getQueue } from "@/app/api/sewing/queue/route";
import type { SewingOrderDto } from "@/lib/api-types";
import { apiRequest, routeParams, sessionCookieFor } from "../helpers/auth";
import {
  createOrder,
  recordDecision,
  recordSewingStart,
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

async function queueAs(role: keyof typeof TEST_USERS, query = ""): Promise<Response> {
  const cookie = await sessionCookieFor(testDb.db, TEST_USERS[role].email);
  return getQueue(apiRequest(`/api/sewing/queue${query}`, { cookie }));
}

async function queuedOrders(query = ""): Promise<SewingOrderDto[]> {
  const response = await queueAs("sewing", query);
  expect(response.status).toBe(200);
  return ((await response.json()) as { orders: SewingOrderDto[] }).orders;
}

async function approve(order: TestOrder): Promise<void> {
  await setCounts(testDb.db, order, ALL_GREEN);
  await recordDecision(testDb.db, order, "APPROVED");
}

/** One order in every status; only CUT-00004 and CUT-00006 are waiting for sewing. */
async function ordersInEveryStatus(): Promise<void> {
  await createOrder(testDb.db); // CUT-00001, pending
  await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" }); // CUT-00002
  const rejected = await createOrder(testDb.db); // CUT-00003
  await recordDecision(testDb.db, rejected, "REJECTED", "Shortage: cuffs 96/100");
  await approve(await createOrder(testDb.db)); // CUT-00004
  const started = await createOrder(testDb.db); // CUT-00005, already on the assembly line
  await approve(started);
  await recordSewingStart(testDb.db, started);
  await approve(await createOrder(testDb.db)); // CUT-00006
}

describe("GET /api/sewing/queue", () => {
  it("lists only verified batches that have not started sewing", async () => {
    await ordersInEveryStatus();
    const orders = await queuedOrders();
    expect(orders.map((order) => [order.orderNo, order.status])).toEqual([
      ["CUT-00004", "VERIFIED"],
      ["CUT-00006", "VERIFIED"],
    ]);
  });

  it("ignores query params that try to widen the list", async () => {
    await ordersInEveryStatus();
    const orders = await queuedOrders("?status=PENDING_VERIFICATION&all=true");
    expect(orders.map((order) => order.orderNo)).toEqual(["CUT-00004", "CUT-00006"]);
  });

  it("puts the batch approved first at the front", async () => {
    const first = await createOrder(testDb.db); // CUT-00001
    const second = await createOrder(testDb.db); // CUT-00002
    await approve(second);
    await approve(first);
    expect((await queuedOrders()).map((order) => order.orderNo)).toEqual(["CUT-00002", "CUT-00001"]);
  });

  it("sends each batch with its counts and its approval, attributed to the verifier", async () => {
    await approve(await createOrder(testDb.db, { targetQty: 50, actualFabricYds: 94 }));
    const [order] = await queuedOrders();
    expect(order).toMatchObject({
      orderNo: "CUT-00001",
      recipe: { code: "REC-BL01", name: "Casual Blouse" },
      targetQty: 50,
      wastagePct: 4.44,
      summary: { green: 5, yellow: 0, red: 0, uncounted: 0 },
      approval: {
        decision: "APPROVED",
        verifier: { fullName: TEST_USERS.verifier.fullName },
        wastagePct: 4.44,
      },
      sewingStartedBy: null,
      sewingStartedAt: null,
    });
    expect(order.items.map((item) => item.actualQty)).toEqual(ALL_GREEN);
  });

  it("never sends the rejections a batch had before it was approved", async () => {
    const order = await createOrder(testDb.db);
    await recordDecision(testDb.db, order, "REJECTED", "Shortage: cuffs 96/100");
    const cookie = await sessionCookieFor(testDb.db, TEST_USERS.supervisor.email);
    const resubmitted = await submit(
      apiRequest(`/api/orders/${order.id}/submit`, { method: "POST", cookie, body: {} }),
      routeParams(order.id),
    );
    expect(resubmitted.status).toBe(200);
    await approve(order);

    const response = await queueAs("sewing");
    const body = await response.text();
    expect(body).not.toContain("REJECTED");
    expect(body).not.toContain("Shortage: cuffs 96/100");
    const { orders } = JSON.parse(body) as { orders: SewingOrderDto[] };
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      orderNo: order.orderNo,
      verificationRound: 2,
      approval: { decision: "APPROVED", rejectionNote: null },
    });
  });

  it.each(["supervisor", "verifier"] as const)("refuses the %s role with 403", async (role) => {
    await approve(await createOrder(testDb.db));
    const response = await queueAs(role);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN_ROLE" } });
  });

  it("refuses anonymous callers with 401", async () => {
    expect((await getQueue(apiRequest("/api/sewing/queue"))).status).toBe(401);
  });
});
