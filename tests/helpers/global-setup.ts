import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** Path of a data-directory snapshot of a fully migrated database. */
    migratedDbSnapshot: string;
  }
}

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * Runs once before all test files: migrates one in-memory Postgres and saves a snapshot of it.
 * Each test file then boots from the snapshot (~0.3 s) instead of from scratch (~2.5 s + migrations).
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const client = new PGlite();
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  const snapshot = await client.dumpDataDir("none");
  await client.close();

  const folder = await mkdtemp(join(tmpdir(), "apparelflow-test-db-"));
  const file = join(folder, "migrated.tar");
  await writeFile(file, Buffer.from(await snapshot.arrayBuffer()));
  project.provide("migratedDbSnapshot", file);

  return async () => {
    await rm(folder, { recursive: true, force: true });
  };
}
