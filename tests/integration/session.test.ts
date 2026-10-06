import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "@/server/auth/cookies";
import { signSessionToken } from "@/server/auth/jwt";
import { getUserFromRequest } from "@/server/auth/session";
import { users } from "@/server/db/schema";
import { apiRequest, sessionCookieFor } from "../helpers/auth";
import { TEST_USERS } from "../helpers/fixtures";
import { createTestDb, resetDb, type TestDb } from "../helpers/test-db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});

beforeEach(async () => {
  await resetDb(testDb.db);
});

afterAll(async () => {
  await testDb.close();
});

describe("getUserFromRequest", () => {
  it("returns the signed-in user, loaded from the database", async () => {
    const cookie = await sessionCookieFor(testDb.db, TEST_USERS.verifier.email);
    expect(await getUserFromRequest(apiRequest("/api/auth/me", { cookie }))).toMatchObject({
      email: TEST_USERS.verifier.email,
      fullName: TEST_USERS.verifier.fullName,
      role: "cutting_verifier",
    });
  });

  it("returns null without a session cookie", async () => {
    expect(await getUserFromRequest(apiRequest("/api/auth/me"))).toBeNull();
  });

  it("returns null for a tampered token", async () => {
    const cookie = await sessionCookieFor(testDb.db, TEST_USERS.verifier.email);
    expect(await getUserFromRequest(apiRequest("/api/auth/me", { cookie: `${cookie}x` }))).toBeNull();
  });

  it("returns null when the token's user no longer exists", async () => {
    const cookie = `${SESSION_COOKIE_NAME}=${await signSessionToken(999)}`;
    expect(await getUserFromRequest(apiRequest("/api/auth/me", { cookie }))).toBeNull();
  });

  it("uses the role in the database, not one remembered at login (D4)", async () => {
    const cookie = await sessionCookieFor(testDb.db, TEST_USERS.verifier.email);
    await testDb.db
      .update(users)
      .set({ role: "sewing_supervisor" })
      .where(eq(users.email, TEST_USERS.verifier.email));
    const user = await getUserFromRequest(apiRequest("/api/auth/me", { cookie }));
    expect(user?.role).toBe("sewing_supervisor");
  });
});
