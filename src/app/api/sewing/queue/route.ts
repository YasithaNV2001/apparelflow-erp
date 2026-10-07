import { withApi } from "@/server/http/with-api";
import { listSewingQueue } from "@/server/services/sewing";

/** GET /api/sewing/queue — verified batches only, filtered in SQL; query params are ignored (PDF §9). */
export const GET = withApi({ access: ["sewing_supervisor"] }, async () => {
  return Response.json({ orders: await listSewingQueue() });
});
