import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { createTestDb, type TestDb } from "../helpers/test-db";

describe("getDb", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Runs first, while no database is installed yet.
  it("fails fast with a clear message when DATABASE_URL is not set", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getDb()).toThrow("DATABASE_URL is not set");
  });

  describe("with the test harness's database", () => {
    let testDb: TestDb;

    // PGlite boots in hooks, which have a longer timeout than tests (vitest.config.ts).
    beforeEach(async () => {
      testDb = await createTestDb();
    });

    afterEach(async () => {
      await testDb.close();
    });

    it("returns the database the test harness installed", () => {
      expect(getDb()).toBe(testDb.db);
    });

    it("forgets the database after closeDb, so scripts can exit cleanly", async () => {
      await closeDb();
      vi.stubEnv("DATABASE_URL", "");
      expect(() => getDb()).toThrow("DATABASE_URL is not set");
    });
  });
});
