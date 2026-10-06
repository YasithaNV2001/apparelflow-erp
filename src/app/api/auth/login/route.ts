import { loginSchema } from "@/domain/validation";
import { sessionCookie } from "@/server/auth/cookies";
import { signSessionToken } from "@/server/auth/jwt";
import { withApi } from "@/server/http/with-api";
import { authenticateWithPassword } from "@/server/services/auth";

/** POST /api/auth/login — public. Sets the httpOnly session cookie on success (PLAN §7.2, D4). */
export const POST = withApi({ access: "public", body: loginSchema }, async ({ body }) => {
  const user = await authenticateWithPassword(body);
  const token = await signSessionToken(user.id);
  return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(token) } });
});
