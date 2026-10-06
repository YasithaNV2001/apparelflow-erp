import { assertNonNegativeInteger, assertPositiveInteger } from "./assert";
import type { ComponentStatus } from "./constants";

export interface CountedComponent {
  componentName: string;
  expectedQty: number;
  /** null means not counted yet; 0 is a real count (PLAN D17). */
  actualQty: number | null;
}

export interface CountSummary {
  green: number;
  yellow: number;
  red: number;
  uncounted: number;
  canApprove: boolean;
  blockers: string[];
}

type StatusCountKey = "green" | "yellow" | "red" | "uncounted";

const STATUS_COUNT_KEY: Record<ComponentStatus, StatusCountKey> = {
  GREEN: "green",
  YELLOW: "yellow",
  RED: "red",
  UNCOUNTED: "uncounted",
};

const NO_COMPONENTS_BLOCKER = "Order has no components";

/** Traffic light for one component (PLAN §5.4, PDF §7.3): = GREEN, > YELLOW, < RED. */
export function classifyComponent(
  expectedQty: number,
  actualQty: number | null,
): ComponentStatus {
  assertPositiveInteger("expectedQty", expectedQty);
  if (actualQty === null) {
    return "UNCOUNTED";
  }
  assertNonNegativeInteger("actualQty", actualQty);
  if (actualQty === expectedQty) {
    return "GREEN";
  }
  return actualQty > expectedQty ? "YELLOW" : "RED";
}

/**
 * Status totals plus the approval decision. A batch is approvable only when it has
 * components, every one is counted and none is short (PLAN §5.5, D10, D12).
 */
export function summarize(items: readonly CountedComponent[]): CountSummary {
  const summary: CountSummary = {
    green: 0,
    yellow: 0,
    red: 0,
    uncounted: 0,
    canApprove: false,
    blockers: [],
  };
  if (items.length === 0) {
    summary.blockers.push(NO_COMPONENTS_BLOCKER);
    return summary;
  }
  for (const item of items) {
    const status = classifyComponent(item.expectedQty, item.actualQty);
    summary[STATUS_COUNT_KEY[status]] += 1;
    const blocker = describeBlocker(item, status);
    if (blocker !== null) {
      summary.blockers.push(blocker);
    }
  }
  summary.canApprove = summary.blockers.length === 0;
  return summary;
}

function describeBlocker(
  item: CountedComponent,
  status: ComponentStatus,
): string | null {
  if (status === "UNCOUNTED") {
    return `${item.componentName} not counted`;
  }
  // The null check never fails for RED; it lets TypeScript treat actualQty as a number.
  if (status === "RED" && item.actualQty !== null) {
    const shortBy = item.expectedQty - item.actualQty;
    return `${item.componentName} short by ${shortBy} (${item.actualQty}/${item.expectedQty})`;
  }
  return null;
}
