import { config } from "dotenv";
import { closeDb, getDb } from "../src/server/db/client";
import { seedDatabase } from "../src/server/db/seed";

// Usage: npm run db:seed  (reads DATABASE_URL from .env.local)
config({ path: ".env.local", quiet: true });

async function main(): Promise<void> {
  const { demoOrders } = await seedDatabase(getDb());
  console.log(
    demoOrders > 0
      ? `Seed complete: 3 demo users, 2 recipes and ${demoOrders} demo orders are in place.`
      : "Seed complete: 3 demo users and 2 recipes are in place; orders already existed, so no demo orders were added.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
