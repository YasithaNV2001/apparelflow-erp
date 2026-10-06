import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { parseWholeNumber } from "../../domain/validation";

const ALGORITHM = "HS256";
const MIN_SECRET_LENGTH = 32;

/** Sessions last 8 hours, one working shift (PLAN D4). */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionClaims {
  userId: number;
}

export async function signSessionToken(userId: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/**
 * The claims of a valid, unexpired token that we signed, or null for anything else:
 * tampered, expired, wrong algorithm, wrong secret or malformed. The caller answers 401
 * without saying which, so an attacker learns nothing.
 */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  // Outside the try: a missing secret is a server misconfiguration (500), not a bad token.
  const key = secretKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: [ALGORITHM] });
    const subject = parseWholeNumber(payload.sub ?? "");
    if (subject.kind !== "number" || subject.value <= 0) {
      return null;
    }
    return { userId: subject.value };
  } catch {
    return null;
  }
}

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters long`);
  }
  return new TextEncoder().encode(secret);
}
