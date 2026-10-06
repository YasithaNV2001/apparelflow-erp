import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/recipes/route";
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

async function getRecipesAs(role: keyof typeof TEST_USERS): Promise<Response> {
  const cookie = await sessionCookieFor(testDb.db, TEST_USERS[role].email);
  return GET(apiRequest("/api/recipes", { cookie }));
}

describe("GET /api/recipes", () => {
  it("lists both recipes with their components in sheet order", async () => {
    const response = await getRecipesAs("supervisor");
    expect(response.status).toBe(200);

    const { recipes } = (await response.json()) as {
      recipes: { code: string; stdFabricYards: number; wastageCap: number; components: { name: string; piecesPerGarment: number }[] }[];
    };
    expect(recipes.map(({ code, stdFabricYards, wastageCap }) => ({ code, stdFabricYards, wastageCap }))).toEqual([
      { code: "REC-BL01", stdFabricYards: 1.8, wastageCap: 5 },
      { code: "REC-CT02", stdFabricYards: 1.1, wastageCap: 8 },
    ]);
    expect(recipes[0].components.map((c) => [c.name, c.piecesPerGarment])).toEqual([
      ["Front Body Panel", 1],
      ["Back Body Panel", 1],
      ["Sleeves (Left & Right)", 2],
      ["Collar & Stand", 1],
      ["Sleeve Cuffs", 2],
    ]);
  });

  it.each(["verifier", "sewing"] as const)("refuses the %s role with 403", async (role) => {
    const response = await getRecipesAs(role);
    expect(response.status).toBe(403);
  });

  it("refuses anonymous callers with 401", async () => {
    const response = await GET(apiRequest("/api/recipes"));
    expect(response.status).toBe(401);
  });
});
