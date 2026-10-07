// The five tests the assessment PDF requires (PLAN §9.2), named exactly as listed there.
// Each one calls the real route handlers and then checks the database itself.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as approve } from "@/app/api/orders/[id]/approve/route";
import { PUT as putCounts } from "@/app/api/orders/[id]/counts/route";
import { POST as reject } from "@/app/api/orders/[id]/reject/route";
import { cuttingOrders, verificationItems, verificationLogs } from "@/server/db/schema";
import { apiRequest, routeParams, sessionCookieFor } from "../helpers/auth";
import { countSheet, createOrder, findUserId, type TestOrder } from "../helpers/factories";
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

type Role = keyof typeof TEST_USERS;

// The PDF's worked example: Casual Blouse × 50 on 94 yd, so 50 / 50 / 100 / 50 / 100 and 4.44% wastage.
const ALL_GREEN = [50, 50, 100, 50, 100];
const CUFFS_SHORT = [50, 50, 100, 50, 96];

async function cookieFor(role: Role): Promise<string> {
  return sessionCookieFor(testDb.db, TEST_USERS[role].email);
}

async function approveAs(role: Role, order: TestOrder, body: unknown): Promise<Response> {
  const request = apiRequest(`/api/orders/${order.id}/approve`, { method: "POST", cookie: await cookieFor(role), body });
  return approve(request, routeParams(order.id));
}

async function rejectAs(role: Role, order: TestOrder, body: unknown): Promise<Response> {
  const request = apiRequest(`/api/orders/${order.id}/reject`, { method: "POST", cookie: await cookieFor(role), body });
  return reject(request, routeParams(order.id));
}

async function saveCountsAs(role: Role, order: TestOrder, counts: number[]): Promise<Response> {
  const request = apiRequest(`/api/orders/${order.id}/counts`, {
    method: "PUT",
    cookie: await cookieFor(role),
    body: { items: countSheet(order, counts) },
  });
  return putCounts(request, routeParams(order.id));
}

async function storedOrder(order: TestOrder) {
  const [row] = await testDb.db.select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
  const items = await testDb.db
    .select()
    .from(verificationItems)
    .where(eq(verificationItems.orderId, order.id))
    .orderBy(verificationItems.id);
  const logs = await testDb.db.select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
  return { status: row.status, counts: items.map((item) => item.actualQty), logs };
}

describe("PDF-required tests", () => {
  it("PDF Test 1: an order with all GREEN components can be approved by an authenticated Verifier", async () => {
    const order = await createOrder(testDb.db, { targetQty: 50, actualFabricYds: 94 });
    expect((await saveCountsAs("verifier", order, ALL_GREEN)).status).toBe(200);
    const before = Date.now();

    const response = await approveAs("verifier", order, {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ order: { status: "VERIFIED" } });

    const stored = await storedOrder(order);
    expect(stored.status).toBe("VERIFIED");
    expect(stored.logs).toHaveLength(1);
    const [log] = stored.logs;
    expect(log).toMatchObject({
      decision: "APPROVED",
      verifierId: await findUserId(testDb.db, TEST_USERS.verifier.email),
      wastagePct: 4.44,
      wastageExceedsCap: false,
      verificationRound: 1,
    });
    // Stamped by the database during the request, not sent by the client.
    expect(Math.abs(log.createdAt.getTime() - before)).toBeLessThan(60_000);
    expect(log.variances).toHaveLength(5);
    expect(log.variances.every((item) => item.status === "GREEN" && item.variance === 0)).toBe(true);
  });

  it("PDF Test 2: an order with at least one RED component blocks approval and returns an error", async () => {
    const order = await createOrder(testDb.db, { targetQty: 50, actualFabricYds: 94 });

    const response = await approveAs("verifier", order, { items: countSheet(order, CUFFS_SHORT) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: "HARD_STOP_SHORTAGE",
        details: [{ component: "Sleeve Cuffs", expected: 100, actual: 96, shortBy: 4 }],
      },
    });

    const stored = await storedOrder(order);
    expect(stored.status).toBe("PENDING_VERIFICATION");
    expect(stored.logs).toHaveLength(0);
  });

  it("PDF Test 3: rejecting an order without a reason note is rejected by backend validation", async () => {
    const order = await createOrder(testDb.db);
    const bodies = [{}, { rejectionNote: "" }, { rejectionNote: "   " }, { rejectionNote: "short" }];

    for (const body of bodies) {
      const response = await rejectAs("verifier", order, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "VALIDATION_ERROR", details: { fields: { rejectionNote: expect.any(Array) } } },
      });
    }

    const stored = await storedOrder(order);
    expect(stored.status).toBe("PENDING_VERIFICATION");
    expect(stored.logs).toHaveLength(0);
  });

  it("PDF Test 4: non-verifier roles receive 403 Forbidden when attempting verification approval", async () => {
    const order = await createOrder(testDb.db);
    expect((await saveCountsAs("verifier", order, ALL_GREEN)).status).toBe(200);

    for (const role of ["supervisor", "sewing"] as const) {
      const response = await approveAs(role, order, { items: countSheet(order, ALL_GREEN) });
      expect(response.status, role).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN_ROLE" } });
    }

    const stored = await storedOrder(order);
    expect(stored.status).toBe("PENDING_VERIFICATION");
    expect(stored.counts).toEqual(ALL_GREEN);
    expect(stored.logs).toHaveLength(0);
  });

  // Added with the sewing queue in Phase 5.
  it.todo("PDF Test 5: unapproved orders never appear in the Sewing Queue database query");
});
