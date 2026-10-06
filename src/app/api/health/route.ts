import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { withApi } from "@/server/http/with-api";

// Every call must reach the database; never serve a result prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * Liveness check for monitoring and for the daily Vercel cron that keeps the free
 * Supabase project awake (PLAN §10.4). Public on purpose: it only reveals up or down.
 */
export const GET = withApi({ access: "public" }, async () => {
  await getDb().execute(sql`SELECT 1`);
  return Response.json({ ok: true });
});
