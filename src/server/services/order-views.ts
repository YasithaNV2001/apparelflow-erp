import "server-only";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { classifyComponent, summarize } from "../../domain/traffic-light";
import { calculateWastage } from "../../domain/wastage";
import type {
  OrderDto,
  OrderItemDto,
  OrderListItemDto,
  OrderSummaryDto,
  UserRefDto,
  VerificationLogDto,
} from "../../lib/api-types";
import type { Db } from "../db/client";
import {
  cuttingOrders,
  recipeComponents,
  recipes,
  users,
  verificationItems,
  verificationLogs,
} from "../db/schema";

/** Who pressed "Start Sewing Assembly", and when (PLAN §5.2). */
export interface SewingStart {
  startedBy: UserRefDto;
  startedAt: string;
}

/** One order as every endpoint presents it: shared fields, its items and its decision log. */
export interface OrderView {
  base: OrderSummaryDto;
  items: OrderItemDto[];
  logs: VerificationLogDto[];
  /** Null until sewing starts. */
  sewing: SewingStart | null;
}

// The users table joined a second time, for whoever started sewing; the first join is the creator.
const sewingStarter = alias(users, "sewing_starter");

/**
 * Loads the orders matching `where` with items, summary and logs, newest first unless `orderBy`
 * says otherwise. `logFilter` narrows the logs in SQL, e.g. to the approval alone for sewing.
 * Three queries in total, however many orders match, so lists never do one query per row.
 */
export async function findOrderViews(
  db: Db,
  where?: SQL,
  orderBy: SQL[] = [desc(cuttingOrders.id)],
  logFilter?: SQL,
): Promise<OrderView[]> {
  const orderRows = await db
    .select({
      order: cuttingOrders,
      recipe: {
        id: recipes.id,
        code: recipes.recipeCode,
        name: recipes.name,
        category: recipes.category,
      },
      creator: { id: users.id, fullName: users.fullName },
      starter: { id: sewingStarter.id, fullName: sewingStarter.fullName },
    })
    .from(cuttingOrders)
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .innerJoin(users, eq(users.id, cuttingOrders.createdBy))
    .leftJoin(sewingStarter, eq(sewingStarter.id, cuttingOrders.sewingStartedBy))
    .where(where)
    .orderBy(...orderBy);
  if (orderRows.length === 0) {
    return [];
  }

  const orderIds = orderRows.map((row) => row.order.id);
  const [itemRows, logRows] = await Promise.all([
    loadItems(db, orderIds),
    loadLogs(db, orderIds, logFilter),
  ]);

  return orderRows.map(({ order, recipe, creator, starter }) => {
    const items = itemRows.filter((item) => item.orderId === order.id).map(toItemDto);
    const logs = logRows.filter((log) => log.orderId === order.id).map(toLogDto);
    const wastage = calculateWastage(
      order.expectedFabricYds,
      order.actualFabricYds,
      order.wastageCapSnapshot,
    );
    const base: OrderSummaryDto = {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      verificationRound: order.verificationRound,
      recipe,
      targetQty: order.targetQty,
      fabricRollId: order.fabricRollId,
      actualFabricYds: order.actualFabricYds,
      expectedFabricYds: order.expectedFabricYds,
      wastagePct: wastage.wastagePct,
      wastageCap: order.wastageCapSnapshot,
      wastageExceedsCap: wastage.exceedsCap,
      summary: summarize(items),
      createdBy: creator,
      createdAt: order.createdAt.toISOString(),
      submittedAt: order.submittedAt?.toISOString() ?? null,
    };
    const sewing =
      starter && order.sewingStartedAt
        ? { startedBy: starter, startedAt: order.sewingStartedAt.toISOString() }
        : null;
    return { base, items, logs, sewing };
  });
}

export async function findOrderView(db: Db, orderId: number): Promise<OrderView | null> {
  const [view] = await findOrderViews(db, eq(cuttingOrders.id, orderId));
  return view ?? null;
}

export function toOrderDto(view: OrderView): OrderDto {
  return { ...view.base, items: view.items, logs: view.logs };
}

export function toOrderListItemDto(view: OrderView): OrderListItemDto {
  return { ...view.base, latestLog: view.logs.at(-1) ?? null };
}

function loadItems(db: Db, orderIds: number[]) {
  return db
    .select({
      orderId: verificationItems.orderId,
      componentId: verificationItems.componentId,
      componentName: recipeComponents.componentName,
      piecesPerGarment: recipeComponents.piecesPerGarment,
      expectedQty: verificationItems.expectedQty,
      actualQty: verificationItems.actualQty,
    })
    .from(verificationItems)
    .innerJoin(recipeComponents, eq(recipeComponents.id, verificationItems.componentId))
    .where(inArray(verificationItems.orderId, orderIds))
    .orderBy(asc(verificationItems.orderId), asc(recipeComponents.sortOrder));
}

function loadLogs(db: Db, orderIds: number[], logFilter?: SQL) {
  return db
    .select({
      log: verificationLogs,
      verifier: { id: users.id, fullName: users.fullName },
    })
    .from(verificationLogs)
    .innerJoin(users, eq(users.id, verificationLogs.verifierId))
    .where(and(inArray(verificationLogs.orderId, orderIds), logFilter))
    .orderBy(asc(verificationLogs.createdAt), asc(verificationLogs.id))
    .then((rows) => rows.map(({ log, verifier }) => ({ ...log, verifier })));
}

type ItemRow = Awaited<ReturnType<typeof loadItems>>[number];
type LogRow = Awaited<ReturnType<typeof loadLogs>>[number];

function toItemDto(item: ItemRow): OrderItemDto {
  return {
    componentId: item.componentId,
    componentName: item.componentName,
    piecesPerGarment: item.piecesPerGarment,
    expectedQty: item.expectedQty,
    actualQty: item.actualQty,
    variance: item.actualQty === null ? null : item.actualQty - item.expectedQty,
    status: classifyComponent(item.expectedQty, item.actualQty),
  };
}

function toLogDto(log: LogRow): VerificationLogDto {
  return {
    id: log.id,
    decision: log.decision,
    verifier: log.verifier,
    rejectionNote: log.rejectionNote,
    approvalNote: log.approvalNote,
    verificationRound: log.verificationRound,
    wastagePct: log.wastagePct,
    wastageExceedsCap: log.wastageExceedsCap,
    variances: log.variances,
    createdAt: log.createdAt.toISOString(),
  };
}
