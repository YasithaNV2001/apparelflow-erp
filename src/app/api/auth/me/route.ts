import { withApi } from "@/server/http/with-api";

// Depends on the caller's cookie; never serve a cached copy.
export const dynamic = "force-dynamic";

/** GET /api/auth/me — the signed-in user, freshly loaded from the database (PLAN §7.2, D4). */
export const GET = withApi({ access: "signed-in" }, async ({ user }) => {
  return Response.json({ user });
});
