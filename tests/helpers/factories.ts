import { asc, eq } from "drizzle-orm";
import { calculateExpectedQty } from "@/domain/multiplier";
import { calculateExpectedFabricYds } from "@/domain/wastage";
import type { Db } from "@/server/db/client";
import {
  cuttingOrders,
  recipeComponents,
  recipes,
  users,
  verificationItems,
  verificationLogs,
} from "@/server/db/schema";
import { TEST_USERS } from "./fixtures";

export interface TestOrderItem {
  id: number;
  componentId: number;
  componentName: string;
  expectedQty: number;
}

export interface TestOrder {
  id: number;
  orderNo: string;
  items: TestOrderItem[];
}

interface OrderOptions {
  recipeCode?: string;
  targetQty?: number;
  actualFabricYds?: number;
  status?: "CUTTING_IN_PROGRESS" | "PENDING_VERIFICATION";
  withItems?: boolean;
}

/** Inserts an order the way the app will: uncounted items, snapshots from the recipe. */
export async function createOrder(db: Db, options: OrderOptions = {}): Promise<TestOrder> {
  const {
    recipeCode = "REC-BL01",
    targetQty = 50,
    actualFabricYds = 94,
    status = "PENDING_VERIFICATION",
    withItems = true,
  } = options;

  const [recipe] = await db.select().from(recipes).where(eq(recipes.recipeCode, recipeCode));
  if (!recipe) {
    throw new Error(`Unknown recipe ${recipeCode}; did resetDb() run?`);
  }
  const supervisorId = await findUserId(db, TEST_USERS.supervisor.email);

  const [order] = await db
    .insert(cuttingOrders)
    .values({
      recipeId: recipe.id,
      targetQty,
      fabricRollId: "FAB-ROLL-TEST",
      actualFabricYds,
      status,
      createdBy: supervisorId,
      expectedFabricYds: calculateExpectedFabricYds(targetQty, recipe.stdFabricYards),
      wastageCapSnapshot: recipe.wastageCap,
      // Mirror createOrder(): a submitted order starts at round 1 with a submission time.
      verificationRound: status === "PENDING_VERIFICATION" ? 1 : 0,
      submittedAt: status === "PENDING_VERIFICATION" ? new Date() : null,
    })
    .returning();

  if (!withItems) {
    return { id: order.id, orderNo: order.orderNo, items: [] };
  }

  const components = await db
    .select()
    .from(recipeComponents)
    .where(eq(recipeComponents.recipeId, recipe.id))
    .orderBy(asc(recipeComponents.sortOrder));
  const items: TestOrderItem[] = [];
  for (const component of components) {
    const [item] = await db
      .insert(verificationItems)
      .values({
        orderId: order.id,
        componentId: component.id,
        expectedQty: calculateExpectedQty(targetQty, component.piecesPerGarment),
      })
      .returning();
    items.push({
      id: item.id,
      componentId: component.id,
      componentName: component.componentName,
      expectedQty: item.expectedQty,
    });
  }
  return { id: order.id, orderNo: order.orderNo, items };
}

/** Writes one count per item, in sheet order; null means "not counted". */
export async function setCounts(
  db: Db,
  order: TestOrder,
  counts: readonly (number | null)[],
): Promise<void> {
  if (counts.length !== order.items.length) {
    throw new Error(`Expected ${order.items.length} counts, got ${counts.length}`);
  }
  for (const [index, item] of order.items.entries()) {
    await db
      .update(verificationItems)
      .set({ actualQty: counts[index] })
      .where(eq(verificationItems.id, item.id));
  }
}

/** A count sheet as the verifier terminal sends it: one entry per item, in sheet order. */
export function countSheet(
  order: TestOrder,
  counts: readonly (number | null)[],
): { componentId: number; actualQty: number | null }[] {
  if (counts.length !== order.items.length) {
    throw new Error(`Expected ${order.items.length} counts, got ${counts.length}`);
  }
  return order.items.map((item, index) => ({ componentId: item.componentId, actualQty: counts[index] }));
}

export async function findUserId(db: Db, email: string): Promise<number> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) {
    throw new Error(`Unknown user ${email}; did resetDb() run?`);
  }
  return user.id;
}

/**
 * Records a verifier decision directly, the way the P4 approve/reject services will:
 * status change first (the triggers check it), then the append-only log row.
 * The order must be PENDING_VERIFICATION; APPROVED also needs every count in place.
 */
export async function recordDecision(
  db: Db,
  order: TestOrder,
  decision: "APPROVED" | "REJECTED",
  rejectionNote: string | null = null,
): Promise<void> {
  await db
    .update(cuttingOrders)
    .set({ status: decision === "APPROVED" ? "VERIFIED" : "REJECTED" })
    .where(eq(cuttingOrders.id, order.id));
  await db.insert(verificationLogs).values({
    orderId: order.id,
    verifierId: await findUserId(db, TEST_USERS.verifier.email),
    decision,
    rejectionNote,
    wastagePct: 4.44,
    verificationRound: 1,
    expectedFabricYds: 90,
    actualFabricYds: 94,
    wastageExceedsCap: false,
    variances: [],
  });
}
