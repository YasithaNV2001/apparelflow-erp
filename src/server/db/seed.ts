import "server-only";
import { sql } from "drizzle-orm";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../../domain/demo-accounts";
import { hashPassword } from "../auth/password";
import type { Db } from "./client";
import { recipeComponents, recipes, users } from "./schema";

// Names and numbers exactly as PDF §7.1 specifies them (PLAN §6.3).
export const SEED_RECIPES = [
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
] as const;

/**
 * Idempotent: upserts users by email and recipes by code, so running it twice changes nothing
 * that matters. Demo orders are added in P4, through the real services.
 */
export async function seedDatabase(db: Db): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await db
    .insert(users)
    .values(DEMO_ACCOUNTS.map((account) => ({ ...account, passwordHash })))
    .onConflictDoUpdate({
      target: users.email,
      set: {
        role: sql`excluded.role`,
        fullName: sql`excluded.full_name`,
        passwordHash: sql`excluded.password_hash`,
      },
    });

  for (const { components, ...recipe } of SEED_RECIPES) {
    const [saved] = await db
      .insert(recipes)
      .values(recipe)
      .onConflictDoUpdate({
        target: recipes.recipeCode,
        set: {
          name: sql`excluded.name`,
          category: sql`excluded.category`,
          stdFabricYards: sql`excluded.std_fabric_yards`,
          wastageCap: sql`excluded.wastage_cap`,
        },
      })
      .returning({ id: recipes.id });

    await db
      .insert(recipeComponents)
      .values(
        components.map((component, index) => ({
          ...component,
          recipeId: saved.id,
          sortOrder: index + 1,
        })),
      )
      .onConflictDoUpdate({
        target: [recipeComponents.recipeId, recipeComponents.componentName],
        set: {
          piecesPerGarment: sql`excluded.pieces_per_garment`,
          sortOrder: sql`excluded.sort_order`,
        },
      });
  }
}

/** Empties every table, restarts ids and order numbers, then seeds. TRUNCATE skips the row triggers. */
export async function resetDatabase(db: Db): Promise<void> {
  await db.execute(sql`
    TRUNCATE users, recipes, recipe_components, cutting_orders, verification_items, verification_logs
    RESTART IDENTITY CASCADE
  `);
  await seedDatabase(db);
}
