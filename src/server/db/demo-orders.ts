import "server-only";
import { eq } from "drizzle-orm";
import { DEMO_ACCOUNTS } from "../../domain/demo-accounts";
import type { Role } from "../../domain/constants";
import type { OrderDto } from "../../lib/api-types";
import type { SessionUser } from "../auth/session";
import { createOrder } from "../services/orders";
import { approveOrder, rejectOrder } from "../services/verification";
import type { Db } from "./client";
import { cuttingOrders, recipes, users } from "./schema";

/**
 * One order in every state, so an evaluator sees the whole workflow at once (PLAN §6.3, D27).
 * They go through the real services, so every number, snapshot and log is exactly what the app
 * itself would have produced. The services use getDb(), which must be the `db` passed here.
 * Returns how many orders were added: none when any order already exists.
 */
export async function seedDemoOrders(db: Db): Promise<number> {
  if ((await db.$count(cuttingOrders)) > 0) {
    return 0;
  }
  const supervisor = await demoUser(db, "cutting_supervisor");
  const verifier = await demoUser(db, "cutting_verifier");
  const blouse = await recipeId(db, "REC-BL01");
  const cropTop = await recipeId(db, "REC-CT02");

  function order(recipe: number, targetQty: number, fabricRollId: string, actualFabricYds: number, submit = true) {
    return createOrder(supervisor, {
      recipeId: recipe,
      targetQty,
      fabricRollId,
      actualFabricYds,
      submitForVerification: submit,
    });
  }

  // CUT-00001: the PDF's worked example, waiting for its count (4.44% wastage).
  await order(blouse, 50, "FAB-ROLL-882", 94);
  // CUT-00002: waiting, with wastage over the 8% cap (9.09%): a warning, not a block.
  await order(cropTop, 40, "FAB-ROLL-915", 48);
  // CUT-00003: rejected for 4 missing cuffs, ready for "Resubmit after re-cut".
  const rejected = await order(blouse, 30, "FAB-ROLL-871", 55);
  await rejectOrder(verifier, rejected.id, {
    rejectionNote: "Shortage: Sleeve Cuffs 56/60 (−4). Re-cut 4 cuffs from the same roll.",
    items: sheet(rejected, { "Sleeve Cuffs": 56 }),
  });
  // CUT-00004: verified with 2 spare side straps, already in the sewing queue (6.06%).
  const verified = await order(cropTop, 60, "FAB-ROLL-902", 70);
  await approveOrder(verifier, verified.id, {
    items: sheet(verified, { "Side Strap Accents": 122 }),
    approvalNote: "2 spare side straps bundled with the batch.",
  });
  // CUT-00005: still being cut, to show the submit flow.
  await order(blouse, 20, "FAB-ROLL-930", 36, false);
  return 5;
}

/** Every component counted exactly as expected, except the overrides (by component name). */
function sheet(order: OrderDto, overrides: Readonly<Record<string, number>>) {
  return order.items.map((item) => ({
    componentId: item.componentId,
    actualQty: overrides[item.componentName] ?? item.expectedQty,
  }));
}

async function demoUser(db: Db, role: Role): Promise<SessionUser> {
  const account = DEMO_ACCOUNTS.find((candidate) => candidate.role === role);
  const [user] = account
    ? await db
        .select({ id: users.id, email: users.email, fullName: users.fullName, role: users.role })
        .from(users)
        .where(eq(users.email, account.email))
    : [];
  if (!user) {
    throw new Error(`The demo ${role} account is missing; seed the users first.`);
  }
  return user;
}

async function recipeId(db: Db, recipeCode: string): Promise<number> {
  const [recipe] = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.recipeCode, recipeCode));
  if (!recipe) {
    throw new Error(`Recipe ${recipeCode} is missing; seed the recipes first.`);
  }
  return recipe.id;
}
