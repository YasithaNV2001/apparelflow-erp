import "server-only";
import { asc, eq, type SQL } from "drizzle-orm";
import type { SewingOrderDto } from "../../lib/api-types";
import { getDb, type Db } from "../db/client";
import { cuttingOrders, verificationLogs } from "../db/schema";
import { findOrderViews, type OrderView } from "./order-views";

// Only the approval travels with a batch into sewing, never earlier rejections (PLAN §7.2).
const APPROVAL_LOG_ONLY = eq(verificationLogs.decision, "APPROVED");

/**
 * The sewing queue (PLAN §7.2, PDF §9): approved batches nobody has started yet. The status
 * condition is in the SQL WHERE clause, nothing is filtered after fetching and the route ignores
 * every query param, so an unverified order can never be read from here. First approved, first
 * sewn: a verified order's last write was its approval, which the guard trigger stamps on updated_at.
 */
export async function listSewingQueue(): Promise<SewingOrderDto[]> {
  return findSewingOrders(getDb(), eq(cuttingOrders.status, "VERIFIED"), [
    asc(cuttingOrders.updatedAt),
    asc(cuttingOrders.id),
  ]);
}

async function findSewingOrders(
  db: Db,
  where: SQL | undefined,
  orderBy: SQL[],
): Promise<SewingOrderDto[]> {
  const views = await findOrderViews(db, where, orderBy, APPROVAL_LOG_ONLY);
  return views.map(toSewingOrderDto);
}

function toSewingOrderDto(view: OrderView): SewingOrderDto {
  const approval = view.logs.at(-1);
  if (!approval) {
    // Approval and its log are written in one transaction (PLAN §5.5), so only tampering gets here.
    throw new Error(`${view.base.orderNo} is ${view.base.status} but has no approval record`);
  }
  return {
    ...view.base,
    items: view.items,
    approval,
    sewingStartedBy: view.sewing?.startedBy ?? null,
    sewingStartedAt: view.sewing?.startedAt ?? null,
  };
}
