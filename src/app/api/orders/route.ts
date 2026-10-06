import { createOrderSchema, orderStatusFilterSchema } from "@/domain/validation";
import { HTTP_STATUS, ValidationError } from "@/server/http/errors";
import { withApi } from "@/server/http/with-api";
import { createOrder, listOrders } from "@/server/services/orders";

export const dynamic = "force-dynamic";

/** GET /api/orders — the supervisor's order list; ?status= is the only query parameter honoured. */
export const GET = withApi({ access: ["cutting_supervisor"] }, async ({ request }) => {
  const status = orderStatusFilterSchema.safeParse(
    new URL(request.url).searchParams.get("status") ?? undefined,
  );
  if (!status.success) {
    throw new ValidationError("Unknown order status.", {
      fields: { status: ["Unknown order status."] },
      form: [],
    });
  }
  return Response.json({ orders: await listOrders(status.data) });
});

/** POST /api/orders — expected counts and snapshots are computed by the server (R16, D19). */
export const POST = withApi(
  { access: ["cutting_supervisor"], body: createOrderSchema },
  async ({ user, body }) => {
    const order = await createOrder(user, body);
    return Response.json({ order }, { status: HTTP_STATUS.CREATED });
  },
);
