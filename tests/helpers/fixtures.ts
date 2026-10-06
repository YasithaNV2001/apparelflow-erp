import { hashSync } from "bcryptjs";
import type { Db } from "@/server/db/client";
import { recipeComponents, recipes, users } from "@/server/db/schema";

/** The public demo password from PLAN §6.3, reused so auth tests log in like the evaluator does. */
export const TEST_PASSWORD = "ApparelFlow#2026";

// bcrypt's minimum cost keeps fixture setup fast; the app hashes real passwords at cost 10.
const FAST_BCRYPT_COST = 4;
const TEST_PASSWORD_HASH = hashSync(TEST_PASSWORD, FAST_BCRYPT_COST);

export const TEST_USERS = {
  supervisor: {
    email: "cutting.supervisor@apparelflow.test",
    role: "cutting_supervisor",
    fullName: "Demo Cutting Supervisor",
  },
  verifier: {
    email: "cutting.verifier@apparelflow.test",
    role: "cutting_verifier",
    fullName: "Demo Cutting Verifier",
  },
  sewing: {
    email: "sewing.supervisor@apparelflow.test",
    role: "sewing_supervisor",
    fullName: "Demo Sewing Supervisor",
  },
} as const;

// The two recipes exactly as PLAN §6.3 (PDF §7.1) specifies them.
const TEST_RECIPES = [
  {
    recipeCode: "REC-BL01",
    name: "Casual Blouse",
    category: "Blouse",
    stdFabricYards: 1.8,
    wastageCap: 5,
    components: [
      { componentName: "Front Body Panel", piecesPerGarment: 1 },
      { componentName: "Back Body Panel", piecesPerGarment: 1 },
      { componentName: "Sleeves (Left & Right)", piecesPerGarment: 2 },
      { componentName: "Collar & Stand", piecesPerGarment: 1 },
      { componentName: "Sleeve Cuffs", piecesPerGarment: 2 },
    ],
  },
  {
    recipeCode: "REC-CT02",
    name: "Crop Top",
    category: "Crop Top",
    stdFabricYards: 1.1,
    wastageCap: 8,
    components: [
      { componentName: "Front Chest Panel", piecesPerGarment: 1 },
      { componentName: "Back Support Panel", piecesPerGarment: 1 },
      { componentName: "Neck Binding Strip", piecesPerGarment: 1 },
      { componentName: "Hem Elastic Casing", piecesPerGarment: 1 },
      { componentName: "Side Strap Accents", piecesPerGarment: 2 },
    ],
  },
];

export async function insertFixtures(db: Db): Promise<void> {
  await db.insert(users).values(
    Object.values(TEST_USERS).map((user) => ({
      ...user,
      passwordHash: TEST_PASSWORD_HASH,
    })),
  );
  for (const { components, ...recipe } of TEST_RECIPES) {
    const [inserted] = await db.insert(recipes).values(recipe).returning();
    await db.insert(recipeComponents).values(
      components.map((component, index) => ({
        ...component,
        recipeId: inserted.id,
        sortOrder: index + 1,
      })),
    );
  }
}
