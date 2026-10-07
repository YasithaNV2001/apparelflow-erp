import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PUT as putCounts } from "@/app/api/orders/[id]/counts/route";
import { POST as approve } from "@/app/api/orders/[id]/approve/route";
import { POST as reject } from "@/app/api/orders/[id]/reject/route";
import { POST as submit } from "@/app/api/orders/[id]/submit/route";
import type { OrderDto } from "@/lib/api-types";
import { cuttingOrders, verificationLogs } from "@/server/db/schema";
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

const NOTE = "Shortage: Sleeve Cuffs 96/100 (−4).";

type Role = keyof typeof TEST_USERS;

async function call(
  handler: typeof reject,
  role: Role,
  method: string,
  path: string,
  id: number | string,
  body: unknown = {},
): Promise<Response> {
  const cookie = await sessionCookieFor(testDb.db, TEST_USERS[role].email);
  return handler(apiRequest(path, { method, cookie, body }), routeParams(id));
}

function rejectAs(role: Role, id: number | string, body: unknown): Promise<Response> {
  return call(reject, role, "POST", `/api/orders/${id}/reject`, id, body);
}

async function rejectedOrder(id: number, body: unknown): Promise<OrderDto> {
  const response = await rejectAs("verifier", id, body);
  expect(response.status).toBe(200);
  return ((await response.json()) as { order: OrderDto }).order;
}

async function expectStillPending(order: TestOrder): Promise<void> {
  const [stored] = await testDb.db.select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
  expect(stored.status).toBe("PENDING_VERIFICATION");
  const logs = await testDb.db.select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
  expect(logs).toHaveLength(0);
}

describe("POST /api/orders/:id/reject", () => {
  it("returns the batch to the supervisor with the trimmed note and a full snapshot", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, [50, 50, 100, 50, 96]);
    const rejected = await rejectedOrder(order.id, { rejectionNote: `  ${NOTE}  ` });

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.logs).toHaveLength(1);
    expect(rejected.logs[0]).toMatchObject({
      decision: "REJECTED",
      rejectionNote: NOTE,
      approvalNote: null,
      verifier: { fullName: TEST_USERS.verifier.fullName },
      verificationRound: 1,
      wastagePct: 4.44,
    });
    expect(rejected.logs[0].variances.map((item) => item.status)).toEqual(["GREEN", "GREEN", "GREEN", "GREEN", "RED"]);
  });

  it("saves counts sent with the rejection, so the snapshot shows what the verifier saw", async () => {
    const order = await createOrder(testDb.db);
    const rejected = await rejectedOrder(order.id, {
      rejectionNote: NOTE,
      items: countSheet(order, [50, 50, 100, null, 96]),
    });
    expect(rejected.items.map((item) => item.actualQty)).toEqual([50, 50, 100, null, 96]);
    expect(rejected.logs[0].variances[4]).toMatchObject({ actual: 96, variance: -4, status: "RED" });
  });

  it("allows rejecting a batch whose counts all match, e.g. for a fabric defect (D11)", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, [50, 50, 100, 50, 100]);
    const rejected = await rejectedOrder(order.id, { rejectionNote: "Visible dye streak on front panels." });
    expect(rejected.status).toBe("REJECTED");
  });

  it("ignores a verifier, decision or status sent by the client (D19)", async () => {
    const order = await createOrder(testDb.db);
    await rejectedOrder(order.id, { rejectionNote: NOTE, verifierId: 999, decision: "APPROVED", status: "VERIFIED" });

    const [log] = await testDb.db.select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
    expect(log).toMatchObject({
      verifierId: await findUserId(testDb.db, TEST_USERS.verifier.email),
      decision: "REJECTED",
    });
  });

  it.each([
    { case: "9 characters after trimming", rejectionNote: "  123456789  " },
    { case: "501 characters", rejectionNote: "x".repeat(501) },
    { case: "a number", rejectionNote: 1234567890 },
    { case: "null", rejectionNote: null },
  ])("returns 400 for a note of $case", async ({ rejectionNote }) => {
    const order = await createOrder(testDb.db);
    const response = await rejectAs("verifier", order.id, { rejectionNote });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", details: { fields: { rejectionNote: ["Give a reason of 10–500 characters."] } } },
    });
    await expectStillPending(order);
  });

  it("accepts a note of exactly 10 characters", async () => {
    const order = await createOrder(testDb.db);
    expect((await rejectedOrder(order.id, { rejectionNote: "1234567890" })).status).toBe("REJECTED");
  });

  it("returns 400 for a component from another order, and rejects nothing", async () => {
    const order = await createOrder(testDb.db);
    const other = await createOrder(testDb.db, { recipeCode: "REC-CT02", targetQty: 60 });
    const response = await rejectAs("verifier", order.id, {
      rejectionNote: NOTE,
      items: [{ componentId: other.items[0].componentId, actualQty: 1 }],
    });
    expect(response.status).toBe(400);
    await expectStillPending(order);
  });

  it("returns 409 for the second of two rejections", async () => {
    const order = await createOrder(testDb.db);
    await rejectedOrder(order.id, { rejectionNote: NOTE });
    expect((await rejectAs("verifier", order.id, { rejectionNote: NOTE })).status).toBe(409);
  });

  it("returns 409 for a verified order", async () => {
    const order = await createOrder(testDb.db);
    await setCounts(testDb.db, order, [50, 50, 100, 50, 100]);
    await recordDecision(testDb.db, order, "APPROVED");
    expect((await rejectAs("verifier", order.id, { rejectionNote: NOTE })).status).toBe(409);
  });

  it("returns 404 for an order still being cut", async () => {
    const order = await createOrder(testDb.db, { status: "CUTTING_IN_PROGRESS" });
    expect((await rejectAs("verifier", order.id, { rejectionNote: NOTE })).status).toBe(404);
  });

  it.each(["supervisor", "sewing"] as const)("refuses the %s role with 403", async (role) => {
    const order = await createOrder(testDb.db);
    expect((await rejectAs(role, order.id, { rejectionNote: NOTE })).status).toBe(403);
    await expectStillPending(order);
  });
});

describe("The rework cycle: reject → re-cut → resubmit → recount → approve (D9)", () => {
  it("clears the counts, raises the round and keeps both decisions in the audit log", async () => {
    const order = await createOrder(testDb.db);
    const sheet = (counts: (number | null)[]) => ({ items: countSheet(order, counts) });

    await call(putCounts, "verifier", "PUT", `/api/orders/${order.id}/counts`, order.id, sheet([50, 50, 100, 50, 96]));
    await rejectedOrder(order.id, { rejectionNote: NOTE });

    const resubmit = await call(submit, "supervisor", "POST", `/api/orders/${order.id}/submit`, order.id, {
      actualFabricYds: 95.5,
    });
    const resubmitted = ((await resubmit.json()) as { order: OrderDto }).order;
    expect(resubmitted).toMatchObject({ status: "PENDING_VERIFICATION", verificationRound: 2 });
    expect(resubmitted.items.every((item) => item.actualQty === null)).toBe(true);

    const approval = await call(approve, "verifier", "POST", `/api/orders/${order.id}/approve`, order.id, {
      ...sheet([50, 50, 100, 50, 100]),
      approvalNote: "Recut cuffs counted.",
    });
    expect(approval.status).toBe(200);
    const approved = ((await approval.json()) as { order: OrderDto }).order;

    expect(approved.status).toBe("VERIFIED");
    expect(approved.logs.map((log) => [log.decision, log.verificationRound, log.wastagePct])).toEqual([
      ["REJECTED", 1, 4.44],
      ["APPROVED", 2, 6.11],
    ]);
    // The first decision's snapshot is untouched by the recount.
    expect(approved.logs[0].variances[4]).toMatchObject({ actual: 96, status: "RED" });
    expect(approved.logs[1].variances[4]).toMatchObject({ actual: 100, status: "GREEN" });
  });
});
