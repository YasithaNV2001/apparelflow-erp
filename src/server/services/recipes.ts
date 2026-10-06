import "server-only";
import { asc } from "drizzle-orm";
import type { RecipeComponentDto, RecipeDto } from "../../lib/api-types";
import { getDb } from "../db/client";
import { recipeComponents, recipes } from "../db/schema";

/** Every recipe with its components in sheet order, for the New Cutting Order form (PLAN §7.2). */
export async function listRecipes(): Promise<RecipeDto[]> {
  const db = getDb();
  const recipeRows = await db.select().from(recipes).orderBy(asc(recipes.recipeCode));
  const componentRows = await db
    .select()
    .from(recipeComponents)
    .orderBy(asc(recipeComponents.recipeId), asc(recipeComponents.sortOrder));

  return recipeRows.map((recipe) => ({
    id: recipe.id,
    code: recipe.recipeCode,
    name: recipe.name,
    category: recipe.category,
    stdFabricYards: recipe.stdFabricYards,
    wastageCap: recipe.wastageCap,
    components: componentRows
      .filter((component) => component.recipeId === recipe.id)
      .map(
        (component): RecipeComponentDto => ({
          id: component.id,
          name: component.componentName,
          piecesPerGarment: component.piecesPerGarment,
          imageUrl: component.imageUrl,
        }),
      ),
  }));
}
