import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { OrderStatus } from "../../domain/constants";
import { calculateExpectedQty } from "../../domain/multiplier";
import { ORDER_STATUS_LABELS } from "../../domain/order-status";
import { initialStatus, nextStatus } from "../../domain/state-machine";
import type { CreateOrderInput, SubmitOrderInput } from "../../domain/validation";
import { calculateExpectedFabricYds } from "../../domain/wastage";
import type { OrderDto, OrderListItemDto } from "../../lib/api-types";
import type { SessionUser } from "../auth/session";
import { getDb, type Db } from "../db/client";
import { cuttingOrders, recipeComponents, recipes, verificationItems } from "../db/schema";
import {
  ConcurrentUpdateError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "../http/errors";
import {
  findOrderView,
  findOrderViews,
  toOrderDto,
  toOrderListItemDto,
  type OrderView,
} from "./order-views";

/**
 * Creates an order with one uncounted item per recipe component (PLAN §5.2, R16).
 * Every derived number is computed here, never taken from the client (D19): expected counts,
 * expected fabric and the wastage-cap snapshot (D15). With submitForVerification the order is
 * created directly as PENDING_VERIFICATION in the same transaction (D8).
 */
export async function createOrder(user: SessionUser, input: CreateOrderInput): Promise<OrderDto> {
  const db = getDb();
  const recipe = await findRecipeWithComponents(db, input.recipeId);
  const status = initialStatus(input.submitForVerification);
  const isSubmitted = status === "PENDING_VERIFICATION";

  const orderId = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(cuttingOrders)
      .values({
        recipeId: recipe.id,
        targetQty: input.targetQty,
        fabricRollId: input.fabricRollId,
        actualFabricYds: input.actualFabricYds,
        status,
        createdBy: user.id,
        expectedFabricYds: calculateExpectedFabricYds(input.targetQty, recipe.stdFabricYards),
        wastageCapSnapshot: recipe.wastageCap,
        verificationRound: isSubmitted ? 1 : 0,
        submittedAt: isSubmitted ? sql`now()` : null,
      })
      .returning({ id: cuttingOrders.id });
    await tx.insert(verificationItems).values(
      recipe.components.map((component) => ({
        orderId: order.id,
        componentId: component.id,
        expectedQty: calculateExpectedQty(input.targetQty, component.piecesPerGarment),
      })),
    );
    return order.id;
  });

  return toOrderDto(await loadExistingView(db, orderId));
}

/** Every order for the supervisor's dashboard, optionally filtered by status (PLAN §7.1). */
export async function listOrders(status?: OrderStatus): Promise<OrderListItemDto[]> {
  const views = await findOrderViews(
    getDb(),
    status === undefined ? undefined : eq(cuttingOrders.status, status),
  );
  return views.map(toOrderListItemDto);
}

/**
 * One order, scoped to the caller (PLAN §5.1): supervisors see any order; verifiers see orders
 * waiting for verification and ones they decided. Anything else is a 404, so existence never leaks.
 */
export async function getOrderForUser(user: SessionUser, orderId: number): Promise<OrderDto> {
  const view = await findOrderView(getDb(), orderId);
  if (!view || !isVisibleTo(user, view)) {
    throw new NotFoundError();
  }
  return toOrderDto(view);
}

/**
 * Submits a cutting order, or resubmits a rejected one after re-cutting (PLAN §5.2, D9).
 * The row lock serialises concurrent clicks; a resubmit clears every count for a fresh recount.
 */
export async function submitOrder(orderId: number, input: SubmitOrderInput): Promise<OrderDto> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: cuttingOrders.status, verificationRound: cuttingOrders.verificationRound })
      .from(cuttingOrders)
      .where(eq(cuttingOrders.id, orderId))
      .for("update");
    if (!order) {
      throw new NotFoundError();
    }
    const next = nextStatus("submit", order.status);
    if (next === null) {
      throw new InvalidStateError(
        `This order is ${ORDER_STATUS_LABELS[order.status].toLowerCase()} and cannot be submitted.`,
      );
    }

    const updated = await tx
      .update(cuttingOrders)
      .set({
        status: next,
        submittedAt: sql`now()`,
        verificationRound: order.verificationRound + 1,
        ...(input.actualFabricYds === undefined ? {} : { actualFabricYds: input.actualFabricYds }),
      })
      .where(and(eq(cuttingOrders.id, orderId), eq(cuttingOrders.status, order.status)))
      .returning({ id: cuttingOrders.id });
    if (updated.length === 0) {
      throw new ConcurrentUpdateError();
    }

    if (order.status === "REJECTED") {
      // After the status change on purpose: the item trigger only allows edits while PENDING (§6.2).
      await tx
        .update(verificationItems)
        .set({ actualQty: null, countedBy: null, countedAt: null })
        .where(eq(verificationItems.orderId, orderId));
    }
  });

  return toOrderDto(await loadExistingView(db, orderId));
}

function isVisibleTo(user: SessionUser, view: OrderView): boolean {
  if (user.role === "cutting_supervisor") {
    return true;
  }
  if (user.role === "cutting_verifier") {
    return (
      view.base.status === "PENDING_VERIFICATION" ||
      view.logs.some((log) => log.verifier.id === user.id)
    );
  }
  return false;
}

async function findRecipeWithComponents(db: Db, recipeId: number) {
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
  if (!recipe) {
    throw new ValidationError("Some fields are invalid.", {
      fields: { recipeId: ["Choose a recipe from the list."] },
      form: [],
    });
  }
  const components = await db
    .select()
    .from(recipeComponents)
    .where(eq(recipeComponents.recipeId, recipeId))
    .orderBy(asc(recipeComponents.sortOrder));
  return { ...recipe, components };
}

async function loadExistingView(db: Db, orderId: number): Promise<OrderView> {
  const view = await findOrderView(db, orderId);
  if (!view) {
    throw new NotFoundError();
  }
  return view;
}
