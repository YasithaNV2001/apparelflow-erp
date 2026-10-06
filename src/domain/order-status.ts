import type { OrderStatus } from "./constants";

/** Human-readable status names for badges, filters and error messages (PLAN §5.2). */
export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  CUTTING_IN_PROGRESS: "Cutting in progress",
  PENDING_VERIFICATION: "Pending verification",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  SEWING_IN_PROGRESS: "Sewing in progress",
};
