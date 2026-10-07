import { parseRouteId, withApi } from "@/server/http/with-api";
import { startSewing } from "@/server/services/sewing";

/** POST /api/orders/:id/start-sewing — puts a verified batch on the assembly line (PLAN §5.2). */
export const POST = withApi({ access: ["sewing_supervisor"] }, async ({ user, params }) => {
  return Response.json({ order: await startSewing(user, parseRouteId(params)) });
});
