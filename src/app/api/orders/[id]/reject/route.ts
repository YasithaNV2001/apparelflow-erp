import { rejectOrderSchema } from "@/domain/validation";
import { parseRouteId, withApi } from "@/server/http/with-api";
import { rejectOrder } from "@/server/services/verification";

/** POST /api/orders/:id/reject — back to the cutting supervisor; a 10–500 character reason is required. */
export const POST = withApi(
  { access: ["cutting_verifier"], body: rejectOrderSchema },
  async ({ user, body, params }) => {
    return Response.json({ order: await rejectOrder(user, parseRouteId(params), body) });
  },
);
