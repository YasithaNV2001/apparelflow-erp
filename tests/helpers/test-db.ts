import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { inject } from "vitest";
import { __setDbForTests, type Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { insertFixtures } from "./fixtures";

export interface TestDb {
  db: Db;
  close: () => Promise<void>;
}

/**
 * A real Postgres running in memory (PGlite) with every migration applied, including
 * the integrity triggers, installed as the app's database (PLAN §9.1, D25).
 * It boots from the snapshot that global-setup.ts migrated once for the whole run.
 */
export async function createTestDb(): Promise<TestDb> {
  const snapshot = await readFile(inject("migratedDbSnapshot"));
  const client = new PGlite({ loadDataDir: new Blob([snapshot]) });
  const db = drizzle(client, { schema });
  __setDbForTests(db);
  return { db, close: () => client.close() };
}

/** Empties every table and reloads the fixtures. TRUNCATE skips row triggers, so the guards allow it. */
export async function resetDb(db: Db): Promise<void> {
  await db.execute(sql`
    TRUNCATE users, recipes, recipe_components, cutting_orders, verification_items, verification_logs
    RESTART IDENTITY CASCADE
  `);
  await insertFixtures(db);
}
