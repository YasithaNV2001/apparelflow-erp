import { describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "@/domain/constants";
import {
  allowedActions,
  canTransition,
  initialStatus,
  nextStatus,
} from "@/domain/state-machine";

// The only legal status changes (PLAN §5.2). The DB trigger in PLAN §6.2 lists the same five.
const LEGAL_TRANSITIONS = [
  "CUTTING_IN_PROGRESS → PENDING_VERIFICATION",
  "REJECTED → PENDING_VERIFICATION",
  "PENDING_VERIFICATION → VERIFIED",
  "PENDING_VERIFICATION → REJECTED",
  "VERIFIED → SEWING_IN_PROGRESS",
];

describe("canTransition", () => {
  it("allows exactly the 5 legal transitions out of all 25 status pairs", () => {
    const legal = ORDER_STATUSES.flatMap((from) =>
      ORDER_STATUSES.filter((to) => canTransition(from, to)).map(
        (to) => `${from} → ${to}`,
      ),
    );
    expect(legal.sort()).toEqual([...LEGAL_TRANSITIONS].sort());
  });
});

describe("nextStatus", () => {
  it.each([
    { action: "submit", from: "CUTTING_IN_PROGRESS", to: "PENDING_VERIFICATION" },
    { action: "submit", from: "REJECTED", to: "PENDING_VERIFICATION" },
    { action: "approve", from: "PENDING_VERIFICATION", to: "VERIFIED" },
    { action: "reject", from: "PENDING_VERIFICATION", to: "REJECTED" },
    { action: "startSewing", from: "VERIFIED", to: "SEWING_IN_PROGRESS" },
  ] as const)("$action: $from → $to", ({ action, from, to }) => {
    expect(nextStatus(action, from)).toBe(to);
  });

  it.each([
    { action: "approve", from: "REJECTED", reason: "approving a rejected batch" },
    { action: "approve", from: "VERIFIED", reason: "approving twice" },
    { action: "submit", from: "PENDING_VERIFICATION", reason: "submitting twice" },
    { action: "submit", from: "VERIFIED", reason: "resubmitting a verified batch" },
    { action: "startSewing", from: "PENDING_VERIFICATION", reason: "sewing an unverified batch" },
    { action: "startSewing", from: "SEWING_IN_PROGRESS", reason: "starting sewing twice" },
  ] as const)("refuses $reason ($action from $from)", ({ action, from }) => {
    expect(nextStatus(action, from)).toBeNull();
  });
});

describe("allowedActions", () => {
  it.each([
    { role: "cutting_supervisor", status: "CUTTING_IN_PROGRESS", actions: ["submit"] },
    { role: "cutting_supervisor", status: "REJECTED", actions: ["submit"] },
    { role: "cutting_supervisor", status: "PENDING_VERIFICATION", actions: [] },
    { role: "cutting_verifier", status: "PENDING_VERIFICATION", actions: ["approve", "reject"] },
    { role: "cutting_verifier", status: "VERIFIED", actions: [] },
    { role: "sewing_supervisor", status: "VERIFIED", actions: ["startSewing"] },
    { role: "sewing_supervisor", status: "PENDING_VERIFICATION", actions: [] },
  ] as const)("$role on $status → $actions", ({ role, status, actions }) => {
    expect(allowedActions(status, role)).toEqual(actions);
  });
});

describe("initialStatus", () => {
  it("starts in PENDING_VERIFICATION when submitted on creation, otherwise CUTTING_IN_PROGRESS", () => {
    expect(initialStatus(true)).toBe("PENDING_VERIFICATION");
    expect(initialStatus(false)).toBe("CUTTING_IN_PROGRESS");
  });
});
