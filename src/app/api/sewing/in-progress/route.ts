import { withApi } from "@/server/http/with-api";
import { listSewingInProgress } from "@/server/services/sewing";

/** GET /api/sewing/in-progress — batches on the assembly line, filtered in SQL; query params are ignored. */
export const GET = withApi({ access: ["sewing_supervisor"] }, async () => {
  return Response.json({ orders: await listSewingInProgress() });
});
