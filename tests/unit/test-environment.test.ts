import { describe, expect, it } from "vitest";

describe("test environment", () => {
  it("stubs server-only so server modules can be imported in tests", async () => {
    await expect(import("server-only")).resolves.toBeDefined();
  });

  it("provides a JWT secret without any .env file", () => {
    expect(process.env.JWT_SECRET).toBeTruthy();
  });
});
