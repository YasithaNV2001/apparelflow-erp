import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";

// Every call must reach the database; never serve a result prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * Liveness check for monitoring and for the daily Vercel cron that keeps the free
 * Supabase project awake (PLAN §10.4). Public on purpose: it only reveals up or down.
 */
export async function GET(): Promise<Response> {
  try {
    await getDb().execute(sql`SELECT 1`);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[GET /api/health] database check failed", error);
    return Response.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "The service is temporarily unavailable.",
        },
      },
      { status: 500 },
    );
  }
}
