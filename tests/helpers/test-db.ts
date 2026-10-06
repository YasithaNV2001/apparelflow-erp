import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { __setDbForTests, type Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { insertFixtures } from "./fixtures";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

export interface TestDb {
  db: Db;
  close: () => Promise<void>;
}

/**
 * A real Postgres running in memory (PGlite) with every migration applied, including
 * the integrity triggers, installed as the app's database (PLAN §9.1, D25).
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
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
