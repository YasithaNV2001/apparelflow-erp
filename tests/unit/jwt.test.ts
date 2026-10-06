import { SignJWT, decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "@/server/auth/jwt";

const testSecret = (): Uint8Array => new TextEncoder().encode(process.env.JWT_SECRET);

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("session tokens", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips the user id and expires after 8 hours", async () => {
    const token = await signSessionToken(42);
    expect(await verifySessionToken(token)).toEqual({ userId: 42 });
    const { iat, exp } = decodeJwt(token);
    expect(Number(exp) - Number(iat)).toBe(SESSION_TTL_SECONDS);
  });

  it("rejects a token whose payload was edited (forged user id)", async () => {
    const [header, , signature] = (await signSessionToken(1)).split(".");
    const forgedPayload = base64UrlJson({ sub: "2", iat: 0, exp: 9_999_999_999 });
    expect(await verifySessionToken(`${header}.${forgedPayload}.${signature}`)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 10 * SESSION_TTL_SECONDS)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(testSecret());
    expect(await verifySessionToken(expired)).toBeNull();
  });

  it("rejects an unsigned token (alg: none)", async () => {
    const unsigned = `${base64UrlJson({ alg: "none" })}.${base64UrlJson({ sub: "1" })}.`;
    expect(await verifySessionToken(unsigned)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-completely-different-secret-of-32+chars"));
    expect(await verifySessionToken(foreign)).toBeNull();
  });

  it.each(["", "not-a-jwt", "a.b.c"])("rejects the malformed token %j", async (token) => {
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("refuses to work with a missing or short secret", async () => {
    vi.stubEnv("JWT_SECRET", "too-short");
    await expect(signSessionToken(1)).rejects.toThrow("JWT_SECRET");
    await expect(verifySessionToken("a.b.c")).rejects.toThrow("JWT_SECRET");
  });
});
