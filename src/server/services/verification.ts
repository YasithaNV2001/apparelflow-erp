import "server-only";
import { asc, eq } from "drizzle-orm";
import type { OrderListItemDto } from "../../lib/api-types";
import { getDb } from "../db/client";
import { cuttingOrders } from "../db/schema";
import { findOrderViews, toOrderListItemDto } from "./order-views";

/**
 * The verifier's queue: only orders waiting for a count, filtered in SQL (PLAN §7.2).
 * First in, first out by submission time, so a recount waits its turn like any other batch.
 */
export async function listVerificationQueue(): Promise<OrderListItemDto[]> {
  const views = await findOrderViews(
    getDb(),
    eq(cuttingOrders.status, "PENDING_VERIFICATION"),
    [asc(cuttingOrders.submittedAt), asc(cuttingOrders.id)],
  );
  return views.map(toOrderListItemDto);
}
