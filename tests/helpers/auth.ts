import { SESSION_COOKIE_NAME } from "@/server/auth/cookies";
import { signSessionToken } from "@/server/auth/jwt";
import type { Db } from "@/server/db/client";
import { findUserId } from "./factories";

/** A Cookie header carrying a real signed session for the given user, as a browser would send it. */
export async function sessionCookieFor(db: Db, email: string): Promise<string> {
  const userId = await findUserId(db, email);
  return `${SESSION_COOKIE_NAME}=${await signSessionToken(userId)}`;
}

/** A request to our API with optional Cookie header and JSON body. */
export function apiRequest(
  path: string,
  options: { method?: string; cookie?: string; body?: unknown } = {},
): Request {
  const headers = new Headers();
  if (options.cookie) {
    headers.set("cookie", options.cookie);
  }
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return new Request(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}
