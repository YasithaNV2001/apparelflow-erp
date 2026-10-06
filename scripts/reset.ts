import { config } from "dotenv";
import { closeDb, getDb } from "../src/server/db/client";
import { resetDatabase } from "../src/server/db/seed";

// Usage: npm run db:reset -- --yes  (reads DATABASE_URL from .env.local)
// Deletes ALL data. Never run it against production without the human's explicit OK (CLAUDE.md #11).
config({ path: ".env.local", quiet: true });

const CONFIRM_FLAG = "--yes";

/** Only the host name is printed; the URL also contains the password. */
function targetHost(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return new URL(url).hostname;
}

async function main(): Promise<void> {
  const host = targetHost();
  if (!process.argv.includes(CONFIRM_FLAG)) {
    console.error(`This deletes ALL data on ${host}. Re-run with ${CONFIRM_FLAG} to confirm.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Resetting ${host} ...`);
  const { demoOrders } = await resetDatabase(getDb());
  console.log(`Reset complete: tables emptied, then 3 demo users, 2 recipes and ${demoOrders} demo orders seeded.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
