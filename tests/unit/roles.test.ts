import { describe, expect, it } from "vitest";
import { ROLES } from "@/domain/constants";
import { DEMO_ACCOUNTS } from "@/domain/demo-accounts";
import { ROLE_PROFILES } from "@/domain/roles";

describe("role profiles", () => {
  it("give every role its own home page", () => {
    const homes = ROLES.map((role) => ROLE_PROFILES[role].home);
    expect(homes).toEqual(["/cutting", "/verification", "/sewing"]);
  });
});

describe("demo accounts", () => {
  it("provide exactly one account per role", () => {
    expect(DEMO_ACCOUNTS.map((account) => account.role).sort()).toEqual([...ROLES].sort());
  });

  it("use lower-case emails, as the users table requires", () => {
    for (const { email } of DEMO_ACCOUNTS) {
      expect(email).toBe(email.toLowerCase());
    }
  });
});
