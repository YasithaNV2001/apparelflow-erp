import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { createTestDb } from "../helpers/test-db";

describe("getDb", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails fast with a clear message when DATABASE_URL is not set", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getDb()).toThrow("DATABASE_URL is not set");
  });

  it("returns the database the test harness installed", async () => {
    const testDb = await createTestDb();
    expect(getDb()).toBe(testDb.db);
    await testDb.close();
  });

  it("forgets the database after closeDb, so scripts can exit cleanly", async () => {
    const testDb = await createTestDb();
    await closeDb();
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getDb()).toThrow("DATABASE_URL is not set");
    await testDb.close();
  });
});
