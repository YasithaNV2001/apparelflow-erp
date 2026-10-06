import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { ORDER_STATUS_LABELS } from "../../domain/order-status";
import type { SaveCountsInput } from "../../domain/validation";
import type { OrderDto, OrderListItemDto } from "../../lib/api-types";
import type { SessionUser } from "../auth/session";
import { getDb, type Db } from "../db/client";
import { cuttingOrders, recipeComponents, verificationItems, verificationLogs } from "../db/schema";
import { InvalidStateError, NotFoundError, ValidationError } from "../http/errors";
import { findOrderView, findOrderViews, toOrderDto, toOrderListItemDto } from "./order-views";

/** One component count as it arrives from the verifier; null clears it back to "not counted". */
interface CountEntry {
  componentId: number;
  actualQty: number | null;
}

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

/**
 * Autosaves some or all counts of an order being verified (PLAN §7.2). The response carries the
 * server's traffic lights and summary, which the terminal treats as the truth.
 */
export async function saveCounts(
  user: SessionUser,
  orderId: number,
  input: SaveCountsInput,
): Promise<OrderDto> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await lockOrderForVerification(tx, user, orderId, "its counts can no longer change");
    const sheet = await loadCountSheet(tx, orderId);
    assertKnownComponents(sheet, input.items);
    await writeCounts(tx, user, orderId, input.items);
  });
  return loadOrderDto(db, orderId);
}

/**
 * Locks the order row for the rest of the transaction, so a concurrent approve, reject or save
 * waits instead of interleaving. Visibility follows getOrderForUser (PLAN §5.1): an order the
 * verifier decided is a 409 once it has left the queue; any other order outside it is a 404.
 */
async function lockOrderForVerification(
  tx: Db,
  user: SessionUser,
  orderId: number,
  refusal: string,
) {
  const [order] = await tx
    .select()
    .from(cuttingOrders)
    .where(eq(cuttingOrders.id, orderId))
    .for("update");
  if (!order) {
    throw new NotFoundError();
  }
  if (order.status !== "PENDING_VERIFICATION") {
    const [ownDecision] = await tx
      .select({ id: verificationLogs.id })
      .from(verificationLogs)
      .where(and(eq(verificationLogs.orderId, orderId), eq(verificationLogs.verifierId, user.id)))
      .limit(1);
    if (!ownDecision) {
      throw new NotFoundError();
    }
    throw new InvalidStateError(
      `This order is ${ORDER_STATUS_LABELS[order.status].toLowerCase()}, so ${refusal}.`,
    );
  }
  return order;
}

/** The order's items in sheet order, read inside the transaction so they reflect any writes. */
function loadCountSheet(tx: Db, orderId: number) {
  return tx
    .select({
      componentId: verificationItems.componentId,
      componentName: recipeComponents.componentName,
      expectedQty: verificationItems.expectedQty,
      actualQty: verificationItems.actualQty,
    })
    .from(verificationItems)
    .innerJoin(recipeComponents, eq(recipeComponents.id, verificationItems.componentId))
    .where(eq(verificationItems.orderId, orderId))
    .orderBy(asc(recipeComponents.sortOrder));
}

type CountSheet = Awaited<ReturnType<typeof loadCountSheet>>;

/** A component id from another order or recipe is a malformed request: 400 (PLAN §5.5 step 3). */
function assertKnownComponents(sheet: CountSheet, entries: readonly CountEntry[]): void {
  const known = new Set(sheet.map((item) => item.componentId));
  const unknown = entries.filter((entry) => !known.has(entry.componentId));
  if (unknown.length > 0) {
    throw new ValidationError("Some fields are invalid.", {
      fields: {
        items: unknown.map((entry) => `Component ${entry.componentId} is not part of this order.`),
      },
      form: [],
    });
  }
}

/** Writes each count with who counted it and when; the counter is always the session user. */
async function writeCounts(
  tx: Db,
  user: SessionUser,
  orderId: number,
  entries: readonly CountEntry[],
): Promise<void> {
  for (const { componentId, actualQty } of entries) {
    const isCleared = actualQty === null;
    await tx
      .update(verificationItems)
      .set({
        actualQty,
        countedBy: isCleared ? null : user.id,
        countedAt: isCleared ? null : sql`now()`,
      })
      .where(
        and(
          eq(verificationItems.orderId, orderId),
          eq(verificationItems.componentId, componentId),
        ),
      );
  }
}

async function loadOrderDto(db: Db, orderId: number): Promise<OrderDto> {
  const view = await findOrderView(db, orderId);
  if (!view) {
    throw new NotFoundError();
  }
  return toOrderDto(view);
}
