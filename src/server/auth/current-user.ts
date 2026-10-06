import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE_NAME } from "./cookies";
import { findUserForToken, type SessionUser } from "./session";

/**
 * The user behind the page being rendered, or null. Pages use it only to decide what to show
 * (sign-in redirect or 403 view); their data still comes from the API (PLAN §4.4).
 * cache() runs it once per request, so the layout and the page share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? findUserForToken(token) : null;
});

/** For pages behind sign-in: the user, or a redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
