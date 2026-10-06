import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_COOKIE_NAME,
  expiredSessionCookie,
  readCookie,
  sessionCookie,
} from "@/server/auth/cookies";

describe("session cookie", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is HttpOnly, SameSite=Lax, site-wide and lasts 8 hours", () => {
    expect(sessionCookie("token-value")).toBe(
      "af_session=token-value; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800",
    );
  });

  it("adds Secure in production, so it only travels over HTTPS", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookie("token-value")).toMatch(/; Secure$/);
  });

  it("expires immediately on logout", () => {
    expect(expiredSessionCookie()).toBe(
      "af_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );
  });
});

describe("readCookie", () => {
  it("finds the session cookie among others", () => {
    expect(readCookie("theme=light; af_session=abc.def.ghi; lang=en", SESSION_COOKIE_NAME)).toBe(
      "abc.def.ghi",
    );
  });

  it.each([null, "", "theme=light", "af_sessionX=abc", "garbage"])(
    "returns undefined when the header is %j",
    (header) => {
      expect(readCookie(header, SESSION_COOKIE_NAME)).toBeUndefined();
    },
  );

  it("keeps an = inside the value", () => {
    expect(readCookie("af_session=a=b", SESSION_COOKIE_NAME)).toBe("a=b");
  });
});
