import { SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { SESSION_COOKIE_NAME } from "@/server/auth/cookies";
import { apiRequest, sessionCookieFor } from "../helpers/auth";
import { TEST_PASSWORD, TEST_USERS } from "../helpers/fixtures";
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

function loginRequest(body: unknown): Request {
  return apiRequest("/api/auth/login", { method: "POST", body });
}

/** "af_session=eyJ…" from a response's Set-Cookie header, ready to send back as a Cookie header. */
function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}

describe("POST /api/auth/login", () => {
  it("signs in with the demo password and sets an httpOnly session cookie", async () => {
    const response = await login(loginRequest({ email: TEST_USERS.verifier.email, password: TEST_PASSWORD }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: {
        id: 2,
        email: TEST_USERS.verifier.email,
        fullName: TEST_USERS.verifier.fullName,
        role: "cutting_verifier",
      },
    });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=[\\w-]+\\.[\\w-]+\\.[\\w-]+;`));
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("accepts the email in any case and with surrounding spaces", async () => {
    const response = await login(
      loginRequest({ email: "  Cutting.Verifier@ApparelFlow.TEST ", password: TEST_PASSWORD }),
    );
    expect(response.status).toBe(200);
  });

  it("issues a cookie that the API then accepts", async () => {
    const response = await login(loginRequest({ email: TEST_USERS.sewing.email, password: TEST_PASSWORD }));
    const meResponse = await me(apiRequest("/api/auth/me", { cookie: cookieFrom(response) }));
    expect(await meResponse.json()).toMatchObject({ user: { role: "sewing_supervisor" } });
  });

  it("ignores a role smuggled into the body (D19)", async () => {
    const response = await login(
      loginRequest({ email: TEST_USERS.verifier.email, password: TEST_PASSWORD, role: "cutting_supervisor" }),
    );
    expect(await response.json()).toMatchObject({ user: { role: "cutting_verifier" } });
  });

  it.each([
    { label: "a wrong password", body: { email: TEST_USERS.verifier.email, password: "wrong-password" } },
    { label: "an unknown email", body: { email: "nobody@apparelflow.test", password: TEST_PASSWORD } },
  ])("answers $label with the same generic 401 and no cookie", async ({ body }) => {
    const response = await login(loginRequest(body));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([{}, { email: "not-an-email", password: TEST_PASSWORD }, { email: TEST_USERS.verifier.email, password: "" }])(
    "returns 400 for the invalid payload %j",
    async (body) => {
      const response = await login(loginRequest(body));
      expect(response.status).toBe(400);
    },
  );
});

describe("POST /api/auth/logout", () => {
  it("deletes the session cookie with 204, even without a session", async () => {
    const response = await logout(apiRequest("/api/auth/logout", { method: "POST" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("GET /api/auth/me", () => {
  it("returns the signed-in user", async () => {
    const cookie = await sessionCookieFor(testDb.db, TEST_USERS.supervisor.email);
    const response = await me(apiRequest("/api/auth/me", { cookie }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { role: "cutting_supervisor" } });
  });

  it("returns 401 without a cookie", async () => {
    const response = await me(apiRequest("/api/auth/me"));
    expect(response.status).toBe(401);
  });

  it("returns 401 for a token whose payload was edited", async () => {
    const cookie = await sessionCookieFor(testDb.db, TEST_USERS.sewing.email);
    const [header, , signature] = cookie.slice(SESSION_COOKIE_NAME.length + 1).split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "1", exp: 9_999_999_999 })).toString("base64url");
    const forged = `${SESSION_COOKIE_NAME}=${header}.${forgedPayload}.${signature}`;
    const response = await me(apiRequest("/api/auth/me", { cookie: forged }));
    expect(response.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setIssuedAt(nowSeconds - 60 * 60 * 9)
      .setExpirationTime(nowSeconds - 60 * 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    const response = await me(apiRequest("/api/auth/me", { cookie: `${SESSION_COOKIE_NAME}=${expired}` }));
    expect(response.status).toBe(401);
  });
});
