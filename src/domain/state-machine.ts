import type { OrderStatus, Role } from "./constants";

export const ORDER_ACTIONS = ["submit", "approve", "reject", "startSewing"] as const;
export type OrderAction = (typeof ORDER_ACTIONS)[number];

interface TransitionRule {
  from: readonly OrderStatus[];
  to: OrderStatus;
  role: Role;
}

/**
 * Every legal status change (PLAN §5.2, PDF §6). The DB trigger af_guard_orders
 * mirrors this table, so any change here needs a matching migration.
 */
export const TRANSITIONS: Readonly<Record<OrderAction, TransitionRule>> = {
  submit: {
    from: ["CUTTING_IN_PROGRESS", "REJECTED"],
    to: "PENDING_VERIFICATION",
    role: "cutting_supervisor",
  },
  approve: {
    from: ["PENDING_VERIFICATION"],
    to: "VERIFIED",
    role: "cutting_verifier",
  },
  reject: {
    from: ["PENDING_VERIFICATION"],
    to: "REJECTED",
    role: "cutting_verifier",
  },
  startSewing: {
    from: ["VERIFIED"],
    to: "SEWING_IN_PROGRESS",
    role: "sewing_supervisor",
  },
};

/** Status of a new order (PLAN D8): straight to verification, or saved as cutting in progress. */
export function initialStatus(submitForVerification: boolean): OrderStatus {
  return submitForVerification ? "PENDING_VERIFICATION" : "CUTTING_IN_PROGRESS";
}

/** Where `action` leads from `current`, or null when it is not allowed in that state (the API answers 409). */
export function nextStatus(
  action: OrderAction,
  current: OrderStatus,
): OrderStatus | null {
  const rule = TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : null;
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_ACTIONS.some((action) => nextStatus(action, from) === to);
}

/** Actions `role` may take on an order in `status`; the UI uses this to decide which buttons to render. */
export function allowedActions(status: OrderStatus, role: Role): OrderAction[] {
  return ORDER_ACTIONS.filter(
    (action) =>
      TRANSITIONS[action].role === role && nextStatus(action, status) !== null,
  );
}
