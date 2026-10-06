import { expiredSessionCookie } from "@/server/auth/cookies";
import { HTTP_STATUS } from "@/server/http/errors";
import { withApi } from "@/server/http/with-api";

/**
 * POST /api/auth/logout — always succeeds by deleting the session cookie, even when the
 * session has already expired, so signing out can never get stuck (PLAN §7.2).
 */
export const POST = withApi({ access: "public" }, async () => {
  return new Response(null, {
    status: HTTP_STATUS.NO_CONTENT,
    headers: { "Set-Cookie": expiredSessionCookie() },
  });
});
