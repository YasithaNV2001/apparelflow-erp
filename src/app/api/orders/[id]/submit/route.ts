import { submitOrderSchema } from "@/domain/validation";
import { parseRouteId, withApi } from "@/server/http/with-api";
import { submitOrder } from "@/server/services/orders";

/** POST /api/orders/:id/submit — submit a cutting order, or resubmit a rejected one (PLAN §5.2). */
export const POST = withApi(
  { access: ["cutting_supervisor"], body: submitOrderSchema },
  async ({ body, params }) => {
    return Response.json({ order: await submitOrder(parseRouteId(params), body) });
  },
);
