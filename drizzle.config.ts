import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js loads .env.local by itself; drizzle-kit does not.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Migrations use the session pooler (PLAN §4.5). Only db:migrate needs a URL; db:generate works offline.
    url: process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
