import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyPassword } from "@/server/auth/password";
import { cuttingOrders, recipeComponents, recipes, users } from "@/server/db/schema";
import { resetDatabase, seedDatabase } from "@/server/db/seed";
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
    await seedDatabase(testDb.db);
    expect(await testDb.db.$count(users)).toBe(3);
    expect(await testDb.db.$count(recipes)).toBe(2);
    expect(await testDb.db.$count(recipeComponents)).toBe(10);
  });

  it("reset removes every order and restarts order numbers", async () => {
    await createOrder(testDb.db);
    await resetDatabase(testDb.db);
    expect(await testDb.db.$count(cuttingOrders)).toBe(0);
    expect(await createOrder(testDb.db)).toMatchObject({ orderNo: "CUT-00001" });
  });
});
