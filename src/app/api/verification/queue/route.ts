import { withApi } from "@/server/http/with-api";
import { listVerificationQueue } from "@/server/services/verification";

/** GET /api/verification/queue — orders waiting for a count; query params are ignored (PLAN §7.1). */
export const GET = withApi({ access: ["cutting_verifier"] }, async () => {
  return Response.json({ orders: await listVerificationQueue() });
});
