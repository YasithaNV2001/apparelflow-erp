import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getOrder } from "@/app/api/orders/[id]/route";
import { GET as listOrders } from "@/app/api/orders/route";
import type { OrderDto, OrderListItemDto } from "@/lib/api-types";
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

function cookieFor(role: keyof typeof TEST_USERS): Promise<string> {
  return sessionCookieFor(testDb.db, TEST_USERS[role].email);
}

async function listAs(role: keyof typeof TEST_USERS, query = ""): Promise<Response> {
  return listOrders(apiRequest(`/api/orders${query}`, { cookie: await cookieFor(role) }));
}

async function detailAs(role: keyof typeof TEST_USERS, id: number | string): Promise<Response> {
  return getOrder(apiRequest(`/api/orders/${id}`, { cookie: await cookieFor(role) }), routeParams(id));
}

describe("GET /api/orders", () => {
  it("lists every order, newest first, with its latest decision", async () => {
    const first = await createOrder(testDb.db);
    await recordDecision(testDb.db, first, "REJECTED", "Shortage: cuffs 96/100");
    await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" });

    const response = await listAs("supervisor");
    expect(response.status).toBe(200);
    const { orders } = (await response.json()) as { orders: OrderListItemDto[] };
    expect(orders.map((order) => [order.orderNo, order.status])).toEqual([
      ["CUT-00002", "CUTTING_IN_PROGRESS"],
      ["CUT-00001", "REJECTED"],
    ]);
    expect(orders[1].latestLog).toMatchObject({
      decision: "REJECTED",
      rejectionNote: "Shortage: cuffs 96/100",
      verifier: { fullName: TEST_USERS.verifier.fullName },
    });
    expect(orders[0].latestLog).toBeNull();
  });

  it("filters by ?status=", async () => {
    await createOrder(testDb.db);
    await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" });
    const { orders } = (await (await listAs("supervisor", "?status=PENDING_VERIFICATION")).json()) as {
      orders: OrderListItemDto[];
    };
    expect(orders.map((order) => order.status)).toEqual(["PENDING_VERIFICATION"]);
  });

  it("returns 400 for an unknown status filter", async () => {
    expect((await listAs("supervisor", "?status=EVERYTHING")).status).toBe(400);
  });

  it.each(["verifier", "sewing"] as const)("refuses the %s role with 403 (D21)", async (role) => {
    expect((await listAs(role)).status).toBe(403);
  });
});

describe("GET /api/orders/:id", () => {
  it("shows the supervisor any order with items, variances and the blocker summary", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, [50, 50, 100, 50, 96]);

    const response = await detailAs("supervisor", order.id);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { order: OrderDto };
    expect(body.order.items[4]).toMatchObject({
      componentName: "Sleeve Cuffs",
      expectedQty: 100,
      actualQty: 96,
      variance: -4,
      status: "RED",
    });
    expect(body.order.summary).toMatchObject({
      green: 4,
      red: 1,
      canApprove: false,
      blockers: ["Sleeve Cuffs short by 4 (96/100)"],
    });
  });

  it("shows the verifier an order waiting for verification", async () => {
    const order = await createOrder(testDb.db);
    expect((await detailAs("verifier", order.id)).status).toBe(200);
  });

  it("shows the verifier an order they decided, with the decision log", async () => {
    const order = await createOrder(testDb.db);
    await recordDecision(testDb.db, order, "REJECTED", "Shortage: cuffs 96/100");
    const response = await detailAs("verifier", order.id);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { order: OrderDto };
    expect(body.order.logs.map((log) => log.decision)).toEqual(["REJECTED"]);
  });

  it("hides orders the verifier has no business seeing behind a 404", async () => {
    const order = await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" });
    expect((await detailAs("verifier", order.id)).status).toBe(404);
  });

  it("refuses the sewing role with 403, whatever the order's status (D21)", async () => {
    const order = await createOrder(testDb.db);
    expect((await detailAs("sewing", order.id)).status).toBe(403);
  });

  it.each([999, "abc", "0", "1e2"])("returns 404 for order id %s", async (id) => {
    expect((await detailAs("supervisor", id)).status).toBe(404);
  });
});
