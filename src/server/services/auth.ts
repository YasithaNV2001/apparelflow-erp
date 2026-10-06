import "server-only";
import { eq } from "drizzle-orm";
import type { LoginInput } from "../../domain/validation";
import { hashPassword, verifyPassword } from "../auth/password";
import type { SessionUser } from "../auth/session";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { InvalidCredentialsError } from "../http/errors";

let dummyPasswordHash: Promise<string> | undefined;

/**
 * A real bcrypt hash to compare against when the email is unknown, so a wrong email takes
 * as long as a wrong password and response times do not reveal which accounts exist.
 */
function timingEqualiserHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword("never-a-valid-password");
  return dummyPasswordHash;
}

/** Checks email and password; any mismatch is the same generic 401 (PLAN §7.2). */
export async function authenticateWithPassword({ email, password }: LoginInput): Promise<SessionUser> {
  const [account] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email));

  const passwordMatches = await verifyPassword(
    password,
    account?.passwordHash ?? (await timingEqualiserHash()),
  );
  if (!account || !passwordMatches) {
    throw new InvalidCredentialsError();
  }
  return {
    id: account.id,
    email: account.email,
    fullName: account.fullName,
    role: account.role,
  };
}
