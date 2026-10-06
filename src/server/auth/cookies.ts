import "server-only";
import { SESSION_TTL_SECONDS } from "./jwt";

export const SESSION_COOKIE_NAME = "af_session";

/**
 * Set-Cookie value for a new session (PLAN D4). HttpOnly: page scripts cannot read it.
 * SameSite=Lax: other sites cannot send it with their POSTs. Secure: HTTPS only in production.
 */
export function sessionCookie(token: string): string {
  return serializeSessionCookie(token, SESSION_TTL_SECONDS);
}

/** Set-Cookie value that makes the browser delete the session cookie (logout). */
export function expiredSessionCookie(): string {
  return serializeSessionCookie("", 0);
}

/** One cookie's value from a raw Cookie header such as "theme=light; af_session=eyJ…". */
export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator !== -1 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function serializeSessionCookie(value: string, maxAgeSeconds: number): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}
