import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { __setDbForTests, getDb, type Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";

describe("getDb", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails fast with a clear message when DATABASE_URL is not set", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getDb()).toThrow("DATABASE_URL is not set");
  });

  it("returns the database the test harness installed", async () => {
    const client = new PGlite();
    const testDb: Db = drizzle(client, { schema });
    __setDbForTests(testDb);
    expect(getDb()).toBe(testDb);
    await client.close();
  });
});
