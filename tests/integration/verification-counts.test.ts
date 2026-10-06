import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PUT as putCounts } from "@/app/api/orders/[id]/counts/route";
import type { OrderDto } from "@/lib/api-types";
import { verificationItems } from "@/server/db/schema";
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

async function putCountsAs(
  role: keyof typeof TEST_USERS,
  id: number | string,
  body: unknown,
): Promise<Response> {
  const cookie = await sessionCookieFor(testDb.db, TEST_USERS[role].email);
  return putCounts(apiRequest(`/api/orders/${id}/counts`, { method: "PUT", cookie, body }), routeParams(id));
}

async function savedOrder(id: number, body: unknown): Promise<OrderDto> {
  const response = await putCountsAs("verifier", id, body);
  expect(response.status).toBe(200);
  return ((await response.json()) as { order: OrderDto }).order;
}

function storedItems(order: TestOrder) {
  return testDb.db
    .select()
    .from(verificationItems)
    .where(eq(verificationItems.orderId, order.id))
    .orderBy(verificationItems.id);
}

/** Front panel and cuffs only: a partial save, as autosave sends it. */
function frontAndCuffs(order: TestOrder, front: number | null, cuffs: number | null) {
  const [frontPanel, , , , sleeveCuffs] = order.items;
  return {
    items: [
      { componentId: frontPanel.componentId, actualQty: front },
      { componentId: sleeveCuffs.componentId, actualQty: cuffs },
    ],
  };
}

describe("PUT /api/orders/:id/counts", () => {
  it("saves a partial sheet and answers with the server's traffic lights and summary", async () => {
    const order = await createOrder(testDb.db);
    const saved = await savedOrder(order.id, frontAndCuffs(order, 50, 96));

    expect(saved.items.map((item) => [item.actualQty, item.status])).toEqual([
      [50, "GREEN"],
      [null, "UNCOUNTED"],
      [null, "UNCOUNTED"],
      [null, "UNCOUNTED"],
      [96, "RED"],
    ]);
    expect(saved.items[4].variance).toBe(-4);
    expect(saved.summary).toMatchObject({ green: 1, red: 1, uncounted: 3, canApprove: false });
  });

  it("stamps the session verifier as the counter and ignores a counter sent in the body", async () => {
    const order = await createOrder(testDb.db);
    const sheet = countSheet(order, [50, 50, 100, 50, 100]).map((entry) => ({ ...entry, countedBy: 1 }));
    await savedOrder(order.id, { items: sheet, countedBy: 1, status: "VERIFIED" });

    const verifierId = await findUserId(testDb.db, TEST_USERS.verifier.email);
    const items = await storedItems(order);
    expect(items.every((item) => item.countedBy === verifierId && item.countedAt !== null)).toBe(true);
  });

  it("keeps the order waiting for verification, whatever the body says", async () => {
    const order = await createOrder(testDb.db);
    const saved = await savedOrder(order.id, {
      items: countSheet(order, [50, 50, 100, 50, 100]),
      status: "VERIFIED",
    });
    expect(saved.status).toBe("PENDING_VERIFICATION");
    expect(saved.summary.canApprove).toBe(true);
  });

  it("treats 0 as a real count, which is short (D17)", async () => {
    const order = await createOrder(testDb.db);
    const saved = await savedOrder(order.id, frontAndCuffs(order, 0, null));
    expect(saved.items[0]).toMatchObject({ actualQty: 0, variance: -50, status: "RED" });
  });

  it("clears a count with null, back to not counted", async () => {
    const order = await createOrder(testDb.db);
    await savedOrder(order.id, frontAndCuffs(order, 50, 100));
    const saved = await savedOrder(order.id, frontAndCuffs(order, null, 100));

    expect(saved.items[0]).toMatchObject({ actualQty: null, status: "UNCOUNTED" });
    const [front] = await storedItems(order);
    expect(front).toMatchObject({ actualQty: null, countedBy: null, countedAt: null });
  });

  it.each([
    { case: "an empty sheet", body: { items: [] } },
    { case: "no sheet", body: {} },
    { case: "a numeric string", body: { items: [{ componentId: 1, actualQty: "12" }] } },
    { case: "a decimal", body: { items: [{ componentId: 1, actualQty: 2.5 }] } },
    { case: "a negative count", body: { items: [{ componentId: 1, actualQty: -1 }] } },
    { case: "text", body: { items: [{ componentId: 1, actualQty: "abc" }] } },
    { case: "an empty string", body: { items: [{ componentId: 1, actualQty: "" }] } },
    {
      case: "a duplicate component",
      body: { items: [{ componentId: 1, actualQty: 50 }, { componentId: 1, actualQty: 49 }] },
    },
  ])("returns 400 for $case", async ({ body }) => {
    const order = await createOrder(testDb.db);
    expect((await putCountsAs("verifier", order.id, body)).status).toBe(400);
  });

  it("returns 400 for a component from another recipe and saves nothing", async () => {
    const order = await createOrder(testDb.db);
    const cropTop = await createOrder(testDb.db, { recipeCode: "REC-CT02", targetQty: 60 });
    const response = await putCountsAs("verifier", order.id, {
      items: [
        { componentId: order.items[0].componentId, actualQty: 50 },
        { componentId: cropTop.items[0].componentId, actualQty: 60 },
      ],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect((await storedItems(order)).every((item) => item.actualQty === null)).toBe(true);
  });

  it("returns 409 once the order is verified (frozen audit trail)", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, [50, 50, 100, 50, 100]);
    await recordDecision(testDb.db, order, "APPROVED");

    const response = await putCountsAs("verifier", order.id, frontAndCuffs(order, 49, 100));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_STATE" } });
  });

  it("returns 409 for an order the verifier rejected", async () => {
    const order = await createOrder(testDb.db);
    await recordDecision(testDb.db, order, "REJECTED", "Shortage: cuffs 96/100");
    expect((await putCountsAs("verifier", order.id, frontAndCuffs(order, 50, 100))).status).toBe(409);
  });

  it("returns 404 for an order still being cut, which the verifier cannot see", async () => {
    const order = await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" });
    expect((await putCountsAs("verifier", order.id, frontAndCuffs(order, 50, 100))).status).toBe(404);
  });

  it("returns 404 for an order that does not exist", async () => {
    expect((await putCountsAs("verifier", 999, { items: [{ componentId: 1, actualQty: 1 }] })).status).toBe(404);
  });

  it.each(["supervisor", "sewing"] as const)("refuses the %s role with 403", async (role) => {
    const order = await createOrder(testDb.db);
    expect((await putCountsAs(role, order.id, frontAndCuffs(order, 50, 100))).status).toBe(403);
    expect((await storedItems(order)).every((item) => item.actualQty === null)).toBe(true);
  });
});
