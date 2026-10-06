import "server-only";
import { eq } from "drizzle-orm";
import type { Role } from "../../domain/constants";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { SESSION_COOKIE_NAME, readCookie } from "./cookies";
import { verifySessionToken } from "./jwt";

export interface SessionUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
}

/** The signed-in user behind an API request, or null. Reads the cookie straight from the headers. */
export async function getUserFromRequest(request: Request): Promise<SessionUser | null> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  return token ? findUserForToken(token) : null;
}

/**
 * Verifies the token, then re-loads the user from the database on every call (PLAN D4),
 * so a changed role or a deleted account takes effect on the very next request.
 */
export async function findUserForToken(token: string): Promise<SessionUser | null> {
  const claims = await verifySessionToken(token);
  if (!claims) {
    return null;
  }
  const [user] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, claims.userId));
  return user ?? null;
}
