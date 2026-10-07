import "server-only";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { OrderStatus } from "../../domain/constants";
import { nextStatus } from "../../domain/state-machine";
import type { SewingOrderDto } from "../../lib/api-types";
import type { SessionUser } from "../auth/session";
import { getDb, type Db } from "../db/client";
import { cuttingOrders, verificationLogs } from "../db/schema";
import { ConcurrentUpdateError, InvalidStateError, NotFoundError } from "../http/errors";
import { findOrderViews, type OrderView } from "./order-views";

// Only the approval travels with a batch into sewing, never earlier rejections (PLAN §7.2).
const APPROVAL_LOG_ONLY = eq(verificationLogs.decision, "APPROVED");

// The only statuses the sewing role can ever see (PLAN D21); any other order is "not found".
const SEWING_STATUSES: readonly OrderStatus[] = ["VERIFIED", "SEWING_IN_PROGRESS"];

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

/**
 * Batches on the assembly line (PLAN D7), most recently started first, each with who started it
 * and when. Filtered in SQL, exactly like the queue.
 */
export async function listSewingInProgress(): Promise<SewingOrderDto[]> {
  return findSewingOrders(getDb(), eq(cuttingOrders.status, "SEWING_IN_PROGRESS"), [
    desc(cuttingOrders.sewingStartedAt),
    desc(cuttingOrders.id),
  ]);
}

/**
 * "Start Sewing Assembly" (PLAN §5.2): VERIFIED → SEWING_IN_PROGRESS, signed with the session user
 * and the database clock. An order sewing cannot see is a 404 (D21), so the endpoint never reveals
 * that an unverified batch exists; a batch already on the assembly line is a 409.
 */
export async function startSewing(user: SessionUser, orderId: number): Promise<SewingOrderDto> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: cuttingOrders.status })
      .from(cuttingOrders)
      .where(eq(cuttingOrders.id, orderId))
      .for("update");
    if (!order || !SEWING_STATUSES.includes(order.status)) {
      throw new NotFoundError();
    }
    if (nextStatus("startSewing", order.status) === null) {
      throw new InvalidStateError("Sewing has already started on this batch.");
    }
    // The status condition turns a lost race into a 409 instead of a second start.
    const started = await tx
      .update(cuttingOrders)
      .set({ status: "SEWING_IN_PROGRESS", sewingStartedBy: user.id, sewingStartedAt: sql`now()` })
      .where(and(eq(cuttingOrders.id, orderId), eq(cuttingOrders.status, "VERIFIED")))
      .returning({ id: cuttingOrders.id });
    if (started.length === 0) {
      throw new ConcurrentUpdateError();
    }
  });
  // Read back with a status condition, like every other sewing read.
  const [started] = await findSewingOrders(
    db,
    and(eq(cuttingOrders.id, orderId), eq(cuttingOrders.status, "SEWING_IN_PROGRESS")),
    [asc(cuttingOrders.id)],
  );
  return started;
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
