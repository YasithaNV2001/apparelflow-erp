import { config } from "dotenv";
import { closeDb, getDb } from "../src/server/db/client";
import { seedDatabase } from "../src/server/db/seed";

// Usage: npm run db:seed  (reads DATABASE_URL from .env.local)
config({ path: ".env.local", quiet: true });

async function main(): Promise<void> {
  await seedDatabase(getDb());
  console.log("Seed complete: 3 demo users and 2 recipes are in place.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
