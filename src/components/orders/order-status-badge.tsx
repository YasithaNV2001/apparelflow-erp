import type { OrderStatus } from "@/domain/constants";
import { ORDER_STATUS_LABELS } from "@/domain/order-status";

const STATUS_STYLES: Record<OrderStatus, { icon: string; className: string }> = {
  CUTTING_IN_PROGRESS: { icon: "◐", className: "bg-status-uncounted text-status-uncounted-ink" },
  PENDING_VERIFICATION: { icon: "◷", className: "bg-status-yellow text-status-yellow-ink" },
  VERIFIED: { icon: "✓", className: "bg-status-green text-status-green-ink" },
  REJECTED: { icon: "✕", className: "bg-status-red text-status-red-ink" },
  SEWING_IN_PROGRESS: { icon: "►", className: "bg-status-uncounted text-status-uncounted-ink" },
};

/** An order's status as icon + text, never colour alone (PLAN §8.3, D24). */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold ${style.className}`}
    >
      <span aria-hidden="true">{style.icon}</span>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
