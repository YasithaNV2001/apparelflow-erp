import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/orders/route";
import type { OrderDto } from "@/lib/api-types";
import { apiRequest, sessionCookieFor } from "../helpers/auth";
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

// Casual Blouse is recipe 1, Crop Top recipe 2 (fixture insertion order).
const BLOUSE_X50 = { recipeId: 1, targetQty: 50, fabricRollId: "fab-roll-882", actualFabricYds: 94 };

async function createAs(role: keyof typeof TEST_USERS, body: unknown): Promise<Response> {
  const cookie = await sessionCookieFor(testDb.db, TEST_USERS[role].email);
  return POST(apiRequest("/api/orders", { method: "POST", cookie, body }));
}

async function createdOrder(body: unknown): Promise<OrderDto> {
  const response = await createAs("supervisor", body);
  expect(response.status).toBe(201);
  return ((await response.json()) as { order: OrderDto }).order;
}

describe("POST /api/orders: server-side multiplier and snapshots", () => {
  it("computes Casual Blouse × 50 as 50 / 50 / 100 / 50 / 100 (PDF §7.2)", async () => {
    const order = await createdOrder(BLOUSE_X50);

    expect(order.items.map((item) => [item.componentName, item.expectedQty])).toEqual([
      ["Front Body Panel", 50],
      ["Back Body Panel", 50],
      ["Sleeves (Left & Right)", 100],
      ["Collar & Stand", 50],
      ["Sleeve Cuffs", 100],
    ]);
    expect(order).toMatchObject({
      orderNo: "CUT-00001",
      status: "CUTTING_IN_PROGRESS",
      verificationRound: 0,
      submittedAt: null,
      fabricRollId: "FAB-ROLL-882",
      expectedFabricYds: 90,
      actualFabricYds: 94,
      wastagePct: 4.44,
      wastageCap: 5,
      wastageExceedsCap: false,
      recipe: { code: "REC-BL01", name: "Casual Blouse" },
      createdBy: { fullName: TEST_USERS.supervisor.fullName },
    });
    expect(order.items.every((item) => item.actualQty === null && item.status === "UNCOUNTED")).toBe(true);
    expect(order.summary).toMatchObject({ uncounted: 5, canApprove: false });
  });

  it("computes Crop Top × 60 as 60 / 60 / 60 / 60 / 120 with 66 yd expected", async () => {
    const order = await createdOrder({ recipeId: 2, targetQty: 60, fabricRollId: "FAB-ROLL-902", actualFabricYds: 70 });
    expect(order.items.map((item) => item.expectedQty)).toEqual([60, 60, 60, 60, 120]);
    expect(order).toMatchObject({ expectedFabricYds: 66, wastagePct: 6.06, wastageCap: 8, wastageExceedsCap: false });
  });

  it("creates and submits in one transaction when asked (D8)", async () => {
    const order = await createdOrder({ ...BLOUSE_X50, submitForVerification: true });
    expect(order.status).toBe("PENDING_VERIFICATION");
    expect(order.verificationRound).toBe(1);
    expect(order.submittedAt).not.toBeNull();
  });

  it("flags wastage above the recipe's cap without blocking (D13)", async () => {
    const order = await createdOrder({ recipeId: 2, targetQty: 40, fabricRollId: "FAB-ROLL-915", actualFabricYds: 48 });
    expect(order).toMatchObject({ wastagePct: 9.09, wastageCap: 8, wastageExceedsCap: true });
  });

  it("ignores expected counts, status, author and wastage sent by the client (D19)", async () => {
    const order = await createdOrder({
      ...BLOUSE_X50,
      status: "VERIFIED",
      createdBy: 3,
      expectedQty: 1,
      expectedFabricYds: 1,
      wastagePct: 0,
      items: [{ componentId: 1, expectedQty: 1, actualQty: 1 }],
    });
    expect(order.status).toBe("CUTTING_IN_PROGRESS");
    expect(order.createdBy.fullName).toBe(TEST_USERS.supervisor.fullName);
    expect(order.items.map((item) => item.expectedQty)).toEqual([50, 50, 100, 50, 100]);
    expect(order).toMatchObject({ expectedFabricYds: 90, wastagePct: 4.44 });
  });
});

describe("POST /api/orders: rejections", () => {
  it("returns 400 for a recipe that does not exist", async () => {
    const response = await createAs("supervisor", { ...BLOUSE_X50, recipeId: 999 });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", details: { fields: { recipeId: ["Choose a recipe from the list."] } } },
    });
  });

  // Every rejection listed in PLAN §5.7 for this payload.
  it.each([
    { field: "targetQty", value: 0 },
    { field: "targetQty", value: -5 },
    { field: "targetQty", value: 2.5 },
    { field: "targetQty", value: "50" },
    { field: "targetQty", value: "" },
    { field: "targetQty", value: null },
    { field: "fabricRollId", value: "" },
    { field: "fabricRollId", value: "   " },
    { field: "fabricRollId", value: "roll 882!" },
    { field: "actualFabricYds", value: 0 },
    { field: "actualFabricYds", value: -1 },
    { field: "actualFabricYds", value: 94.555 },
    { field: "actualFabricYds", value: "94" },
  ])("returns 400 when $field is $value", async ({ field, value }) => {
    const response = await createAs("supervisor", { ...BLOUSE_X50, [field]: value });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { details: { fields: Record<string, string[]> } } };
    expect(Object.keys(body.error.details.fields)).toEqual([field]);
  });

  it.each(["targetQty", "fabricRollId", "actualFabricYds", "recipeId"])(
    "returns 400 when %s is missing",
    async (field) => {
      const body: Record<string, unknown> = { ...BLOUSE_X50 };
      delete body[field];
      expect((await createAs("supervisor", body)).status).toBe(400);
    },
  );

  it("returns 400 for an empty payload", async () => {
    expect((await createAs("supervisor", {})).status).toBe(400);
  });

  it.each(["verifier", "sewing"] as const)("refuses the %s role with 403 (R8)", async (role) => {
    expect((await createAs(role, BLOUSE_X50)).status).toBe(403);
  });

  it("refuses anonymous callers with 401", async () => {
    const response = await POST(apiRequest("/api/orders", { method: "POST", body: BLOUSE_X50 }));
    expect(response.status).toBe(401);
  });
});
