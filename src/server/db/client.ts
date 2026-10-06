import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

/** Works for both drivers: postgres.js in the app and PGlite in tests (PLAN §4.5). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// Small pool per server instance; Supabase's transaction pooler does the real pooling.
const MAX_CONNECTIONS = 5;

// Next's dev server re-runs modules on every edit; reuse one pool instead of leaking a new one each time.
const globalForDb = globalThis as typeof globalThis & { apparelflowSql?: Sql };

let db: Db | undefined;
let sqlClient: Sql | undefined;

export function getDb(): Db {
  if (db === undefined) {
    db = createDb();
  }
  return db;
}

/** Lets the test harness swap in an in-memory PGlite database. Never call this from app code. */
export function __setDbForTests(testDb: Db): void {
  db = testDb;
}

/** Closes the connection pool so command-line scripts can exit. Request handlers never call this. */
export async function closeDb(): Promise<void> {
  await sqlClient?.end();
  sqlClient = undefined;
  globalForDb.apparelflowSql = undefined;
  db = undefined;
}

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  sqlClient =
    globalForDb.apparelflowSql ??
    postgres(url, {
      // Supabase's transaction pooler (port 6543) does not support prepared statements.
      prepare: false,
      max: MAX_CONNECTIONS,
      ssl: "require",
    });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.apparelflowSql = sqlClient;
  }
  return drizzle(sqlClient, { schema });
}
