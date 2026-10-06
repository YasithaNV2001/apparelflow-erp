import { parseRouteId, withApi } from "@/server/http/with-api";
import { getOrderForUser } from "@/server/services/orders";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/:id — supervisors see any order; verifiers only pending or self-decided ones
 * (others get 404). The sewing role is refused with 403 before anything is loaded (D21).
 */
export const GET = withApi(
  { access: ["cutting_supervisor", "cutting_verifier"] },
  async ({ user, params }) => {
    return Response.json({ order: await getOrderForUser(user, parseRouteId(params)) });
  },
);
