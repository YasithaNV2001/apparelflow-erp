import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("password hashing", () => {
  it("stores a salted bcrypt hash at cost 10, never the password itself", async () => {
    const first = await hashPassword("ApparelFlow#2026");
    const second = await hashPassword("ApparelFlow#2026");
    expect(first).toMatch(/^\$2b\$10\$/);
    expect(first).not.toContain("ApparelFlow#2026");
    expect(first).not.toBe(second);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const passwordHash = await hashPassword("ApparelFlow#2026");
    expect(await verifyPassword("ApparelFlow#2026", passwordHash)).toBe(true);
    expect(await verifyPassword("apparelflow#2026", passwordHash)).toBe(false);
  });
});
