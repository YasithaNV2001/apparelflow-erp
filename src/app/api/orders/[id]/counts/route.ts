import { saveCountsSchema } from "@/domain/validation";
import { parseRouteId, withApi } from "@/server/http/with-api";
import { saveCounts } from "@/server/services/verification";

/** PUT /api/orders/:id/counts — autosave some or all counts while verifying (PLAN §7.2). */
export const PUT = withApi(
  { access: ["cutting_verifier"], body: saveCountsSchema },
  async ({ user, body, params }) => {
    return Response.json({ order: await saveCounts(user, parseRouteId(params), body) });
  },
);
