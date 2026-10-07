import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyPassword } from "@/server/auth/password";
import { cuttingOrders, recipeComponents, recipes, users } from "@/server/db/schema";
import { resetDatabase, seedDatabase } from "@/server/db/seed";
import { getOrderForUser } from "@/server/services/orders";
import { createOrder } from "../helpers/factories";
import { createTestDb, type TestDb } from "../helpers/test-db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});

beforeEach(async () => {
  await resetDatabase(testDb.db);
});

afterAll(async () => {
  await testDb.close();
});

async function componentsOf(recipeCode: string) {
  return testDb.db
    .select({
      name: recipeComponents.componentName,
      pieces: recipeComponents.piecesPerGarment,
    })
    .from(recipeComponents)
    .innerJoin(recipes, eq(recipes.id, recipeComponents.recipeId))
    .where(eq(recipes.recipeCode, recipeCode))
    .orderBy(asc(recipeComponents.sortOrder));
}

describe("seed", () => {
  // Expected values typed from PDF §7.1, not imported from the seed module.
  it("creates both recipes with the exact names, fabric and caps", async () => {
    const rows = await testDb.db
      .select({
        code: recipes.recipeCode,
        name: recipes.name,
        category: recipes.category,
        yards: recipes.stdFabricYards,
        cap: recipes.wastageCap,
      })
      .from(recipes)
      .orderBy(asc(recipes.recipeCode));
    expect(rows).toEqual([
      { code: "REC-BL01", name: "Casual Blouse", category: "Blouse", yards: 1.8, cap: 5 },
      { code: "REC-CT02", name: "Crop Top", category: "Crop Top", yards: 1.1, cap: 8 },
    ]);
  });

  it("creates the Casual Blouse components in order", async () => {
    expect(await componentsOf("REC-BL01")).toEqual([
      { name: "Front Body Panel", pieces: 1 },
      { name: "Back Body Panel", pieces: 1 },
      { name: "Sleeves (Left & Right)", pieces: 2 },
      { name: "Collar & Stand", pieces: 1 },
      { name: "Sleeve Cuffs", pieces: 2 },
    ]);
  });

  it("creates the Crop Top components in order", async () => {
    expect(await componentsOf("REC-CT02")).toEqual([
      { name: "Front Chest Panel", pieces: 1 },
      { name: "Back Support Panel", pieces: 1 },
      { name: "Neck Binding Strip", pieces: 1 },
      { name: "Hem Elastic Casing", pieces: 1 },
      { name: "Side Strap Accents", pieces: 2 },
    ]);
  });

  it("creates one demo account per role, all using the demo password", async () => {
    const rows = await testDb.db
      .select({ email: users.email, role: users.role, hash: users.passwordHash })
      .from(users)
      .orderBy(asc(users.email));
    expect(rows.map(({ email, role }) => ({ email, role }))).toEqual([
      { email: "cutting.supervisor@apparelflow.test", role: "cutting_supervisor" },
      { email: "cutting.verifier@apparelflow.test", role: "cutting_verifier" },
      { email: "sewing.supervisor@apparelflow.test", role: "sewing_supervisor" },
    ]);
    for (const row of rows) {
      expect(await verifyPassword("ApparelFlow#2026", row.hash)).toBe(true);
    }
  });

  it("is idempotent: a second run adds nothing", async () => {
    expect(await seedDatabase(testDb.db)).toEqual({ demoOrders: 0 });
    expect(await testDb.db.$count(users)).toBe(3);
    expect(await testDb.db.$count(recipes)).toBe(2);
    expect(await testDb.db.$count(recipeComponents)).toBe(10);
    expect(await testDb.db.$count(cuttingOrders)).toBe(5);
  });

  it("reset replaces every order with the five demo orders, numbered from CUT-00001", async () => {
    await createOrder(testDb.db);
    expect(await resetDatabase(testDb.db)).toEqual({ demoOrders: 5 });
    const orders = await testDb.db
      .select({ orderNo: cuttingOrders.orderNo })
      .from(cuttingOrders)
      .orderBy(asc(cuttingOrders.id));
    expect(orders.map((order) => order.orderNo)).toEqual([
      "CUT-00001",
      "CUT-00002",
      "CUT-00003",
      "CUT-00004",
      "CUT-00005",
    ]);
  });
});

describe("demo orders (PLAN §6.3, D27)", () => {
  async function demoOrders() {
    const ids = await testDb.db.select({ id: cuttingOrders.id }).from(cuttingOrders).orderBy(asc(cuttingOrders.id));
    const supervisor = { id: 1, email: "", fullName: "", role: "cutting_supervisor" as const };
    return Promise.all(ids.map(({ id }) => getOrderForUser(supervisor, id)));
  }

  it("shows one order in every state, with the plan's fabric and wastage figures", async () => {
    const orders = await demoOrders();
    expect(
      orders.map((order) => [order.orderNo, order.recipe.code, order.targetQty, order.fabricRollId, order.status, order.wastagePct, order.wastageExceedsCap]),
    ).toEqual([
      ["CUT-00001", "REC-BL01", 50, "FAB-ROLL-882", "PENDING_VERIFICATION", 4.44, false],
      ["CUT-00002", "REC-CT02", 40, "FAB-ROLL-915", "PENDING_VERIFICATION", 9.09, true],
      ["CUT-00003", "REC-BL01", 30, "FAB-ROLL-871", "REJECTED", 1.85, false],
      ["CUT-00004", "REC-CT02", 60, "FAB-ROLL-902", "VERIFIED", 6.06, false],
      ["CUT-00005", "REC-BL01", 20, "FAB-ROLL-930", "CUTTING_IN_PROGRESS", 0, false],
    ]);
    expect(orders[0].items.every((item) => item.actualQty === null)).toBe(true);
    expect(orders[1].items.every((item) => item.actualQty === null)).toBe(true);
  });

  it("rejects CUT-00003 for 56/60 cuffs, logged by the demo verifier", async () => {
    const [, , rejected] = await demoOrders();
    expect(rejected.items.at(-1)).toMatchObject({ componentName: "Sleeve Cuffs", actualQty: 56, status: "RED" });
    expect(rejected.logs).toHaveLength(1);
    expect(rejected.logs[0]).toMatchObject({
      decision: "REJECTED",
      verifier: { fullName: "Demo Cutting Verifier" },
      rejectionNote: expect.stringContaining("Sleeve Cuffs 56/60"),
    });
  });

  it("verifies CUT-00004 with 122/120 side straps and an approval note", async () => {
    const [, , , verified] = await demoOrders();
    expect(verified.items.map((item) => item.status)).toEqual(["GREEN", "GREEN", "GREEN", "GREEN", "YELLOW"]);
    expect(verified.items.at(-1)).toMatchObject({ componentName: "Side Strap Accents", actualQty: 122, variance: 2 });
    expect(verified.logs).toHaveLength(1);
    expect(verified.logs[0]).toMatchObject({
      decision: "APPROVED",
      verifier: { fullName: "Demo Cutting Verifier" },
      approvalNote: "2 spare side straps bundled with the batch.",
      wastagePct: 6.06,
    });
  });
});
