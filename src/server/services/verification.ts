import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { ORDER_STATUS_LABELS } from "../../domain/order-status";
import { classifyComponent } from "../../domain/traffic-light";
import type { ApproveOrderInput, SaveCountsInput } from "../../domain/validation";
import { calculateWastage } from "../../domain/wastage";
import type { OrderDto, OrderListItemDto } from "../../lib/api-types";
import type { SessionUser } from "../auth/session";
import { getDb, type Db } from "../db/client";
import {
  cuttingOrders,
  recipeComponents,
  verificationItems,
  verificationLogs,
  type VarianceSnapshot,
} from "../db/schema";
import {
  ConcurrentUpdateError,
  HardStopError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "../http/errors";
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
 * Approves a batch for sewing: the server-side hard stop (PLAN §5.5, PDF §9), step by step.
 * Everything runs in one transaction, so a refusal at any step undoes every write before it,
 * including the counts sent with the request. The DB trigger repeats the check as a backstop.
 */
export async function approveOrder(
  user: SessionUser,
  orderId: number,
  input: ApproveOrderInput,
): Promise<OrderDto> {
  const db = getDb();
  await db.transaction(async (tx) => {
    // Steps 1–2: lock the row; 404 when the verifier cannot see it, 409 unless it is waiting.
    const order = await lockOrderForVerification(tx, user, orderId, "it cannot be approved");

    // Step 3: a sheet sent with Approve must name every component of this order exactly once.
    if (input.items) {
      const sheet = await loadCountSheet(tx, orderId);
      assertKnownComponents(sheet, input.items);
      assertCompleteSheet(sheet, input.items);
      await writeCounts(tx, user, orderId, input.items);
    }

    // Step 4: decide on the counts stored now, never on what the client says it counted.
    const variances = toVarianceSnapshot(await loadCountSheet(tx, orderId));
    assertApprovable(variances);

    // Step 5: the status condition makes a lost race a 409 instead of a double approval.
    const approved = await tx
      .update(cuttingOrders)
      .set({ status: "VERIFIED" })
      .where(and(eq(cuttingOrders.id, orderId), eq(cuttingOrders.status, "PENDING_VERIFICATION")))
      .returning({ id: cuttingOrders.id });
    if (approved.length === 0) {
      throw new ConcurrentUpdateError();
    }

    // Step 6: the append-only audit record, signed by the session user at the database's clock.
    await insertDecisionLog(tx, order, user, variances, {
      decision: "APPROVED",
      // A note that was only spaces is trimmed to "" by the schema: store it as no note.
      approvalNote: input.approvalNote || null,
      rejectionNote: null,
    });
  });
  // Step 7: committed. The verifier decided it, so it stays visible to them.
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

/** Approve needs the whole sheet: a component left out is a hard stop, not a silent skip. */
function assertCompleteSheet(sheet: CountSheet, entries: readonly CountEntry[]): void {
  const sent = new Set(entries.map((entry) => entry.componentId));
  const missing = sheet.filter((item) => !sent.has(item.componentId));
  if (missing.length > 0) {
    throw new HardStopError(
      "HARD_STOP_MISSING_COMPONENTS",
      `Cannot approve: ${countOf(missing.length)} missing from the count sheet.`,
      missing.map((item) => ({
        componentId: item.componentId,
        component: item.componentName,
        expected: item.expectedQty,
      })),
    );
  }
}

/** Every component counted and none short (PLAN §5.4, D10, D12); excess is allowed. */
function assertApprovable(variances: readonly VarianceSnapshot[]): void {
  if (variances.length === 0) {
    throw new HardStopError("HARD_STOP_MISSING_COMPONENTS", "Cannot approve: this order has no components.");
  }
  const uncounted = variances.filter((item) => item.status === "UNCOUNTED");
  if (uncounted.length > 0) {
    throw new HardStopError(
      "HARD_STOP_UNCOUNTED",
      `Cannot approve: ${countOf(uncounted.length)} not counted.`,
      uncounted.map((item) => ({
        componentId: item.componentId,
        component: item.componentName,
        expected: item.expected,
      })),
    );
  }
  const shortages = variances.flatMap((item) =>
    item.status === "RED" && item.actual !== null
      ? [
          {
            componentId: item.componentId,
            component: item.componentName,
            expected: item.expected,
            actual: item.actual,
            shortBy: item.expected - item.actual,
          },
        ]
      : [],
  );
  if (shortages.length > 0) {
    throw new HardStopError(
      "HARD_STOP_SHORTAGE",
      `Cannot approve: ${countOf(shortages.length)} short.`,
      shortages,
    );
  }
}

/** "1 component is" / "2 components are", for hard-stop messages. */
function countOf(n: number): string {
  return n === 1 ? "1 component is" : `${n} components are`;
}

/** Per-component record kept with each decision (D29), classified by the shared domain rule. */
function toVarianceSnapshot(sheet: CountSheet): VarianceSnapshot[] {
  return sheet.map((item) => ({
    componentId: item.componentId,
    componentName: item.componentName,
    expected: item.expectedQty,
    actual: item.actualQty,
    variance: item.actualQty === null ? null : item.actualQty - item.expectedQty,
    status: classifyComponent(item.expectedQty, item.actualQty),
  }));
}

/**
 * Appends one decision to the audit log with full snapshots (D28, D29). The verifier is the
 * session user, the time is the database's now() and wastage is computed here (D14, D19).
 */
async function insertDecisionLog(
  tx: Db,
  order: typeof cuttingOrders.$inferSelect,
  user: SessionUser,
  variances: VarianceSnapshot[],
  decision:
    | { decision: "APPROVED"; approvalNote: string | null; rejectionNote: null }
    | { decision: "REJECTED"; approvalNote: null; rejectionNote: string },
): Promise<void> {
  const wastage = calculateWastage(
    order.expectedFabricYds,
    order.actualFabricYds,
    order.wastageCapSnapshot,
  );
  await tx.insert(verificationLogs).values({
    orderId: order.id,
    verifierId: user.id,
    ...decision,
    verificationRound: order.verificationRound,
    expectedFabricYds: order.expectedFabricYds,
    actualFabricYds: order.actualFabricYds,
    wastagePct: wastage.wastagePct,
    wastageExceedsCap: wastage.exceedsCap,
    variances,
  });
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
