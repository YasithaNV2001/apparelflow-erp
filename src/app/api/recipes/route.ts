import { withApi } from "@/server/http/with-api";
import { listRecipes } from "@/server/services/recipes";

export const dynamic = "force-dynamic";

/** GET /api/recipes — cutting supervisors only; recipes are read-only and seeded (D23). */
export const GET = withApi({ access: ["cutting_supervisor"] }, async () => {
  return Response.json({ recipes: await listRecipes() });
});
