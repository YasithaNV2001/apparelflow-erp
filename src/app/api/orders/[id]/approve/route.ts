import { approveOrderSchema } from "@/domain/validation";
import { parseRouteId, withApi } from "@/server/http/with-api";
import { approveOrder } from "@/server/services/verification";

/** POST /api/orders/:id/approve — the hard stop: 422 unless every component is counted and none is short. */
export const POST = withApi(
  { access: ["cutting_verifier"], body: approveOrderSchema },
  async ({ user, body, params }) => {
    return Response.json({ order: await approveOrder(user, parseRouteId(params), body) });
  },
);
