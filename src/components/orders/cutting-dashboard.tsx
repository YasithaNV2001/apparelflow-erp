"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ORDER_STATUSES, type OrderStatus } from "@/domain/constants";
import { ORDER_STATUS_LABELS } from "@/domain/order-status";
import type { OrderDto, OrderListItemDto } from "@/lib/api-types";
import { formatDateTime, formatYards } from "@/lib/format";
import { NewOrderDialog } from "./new-order-dialog";
import { OrderStatusBadge } from "./order-status-badge";
import { useOrders, useSubmitOrder } from "./order-queries";
import { ResubmitDialog, type ResubmitTarget } from "./resubmit-dialog";
import { WastageValue } from "./wastage-value";

type StatusFilter = OrderStatus | "ALL";

/** The cutting supervisor's home (PLAN §8.2): status chips, the orders table and the order actions. */
export function CuttingDashboard() {
  const orders = useOrders();
  const submit = useSubmitOrder();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [isCreating, setIsCreating] = useState(false);
  const [resubmitTarget, setResubmitTarget] = useState<ResubmitTarget | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const allOrders = orders.data ?? [];
  const visibleOrders = filter === "ALL" ? allOrders : allOrders.filter((order) => order.status === filter);

  function announce(order: OrderDto, action: string) {
    setAnnouncement(`${order.orderNo} ${action}.`);
  }

  function submitForVerification(order: OrderListItemDto) {
    submit.mutate(
      { orderId: order.id },
      { onSuccess: (updated) => announce(updated, "sent for verification") },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Cutting orders</h1>
          <p className="text-ink-muted">Create orders from recipes and follow them through verification.</p>
        </div>
        <Button onClick={() => setIsCreating(true)}>New Cutting Order</Button>
      </div>

      <p aria-live="polite" className={announcement ? "rounded-md border border-field-border bg-status-green px-3 py-2 text-sm font-medium text-status-green-ink" : "sr-only"}>
        {announcement}
      </p>
      {submit.error ? (
        <p role="alert" className="rounded-md border border-error bg-status-red px-3 py-2 text-sm font-medium text-status-red-ink">
          {submit.error.message}
        </p>
      ) : null}

      <StatusChips orders={allOrders} filter={filter} onChange={setFilter} />

      {orders.isPending ? (
        <p className="text-ink-muted" aria-busy="true">Loading orders…</p>
      ) : orders.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-error">
          <p className="font-medium">Orders could not be loaded: {orders.error.message}</p>
          <Button variant="secondary" onClick={() => orders.refetch()}>Try again</Button>
        </div>
      ) : visibleOrders.length === 0 ? (
        <p className="rounded-md border border-field-border bg-surface px-4 py-6 text-center text-ink-muted">
          {filter === "ALL" ? "No orders yet. Create the first one." : "No orders with this status."}
        </p>
      ) : (
        <OrdersTable
          orders={visibleOrders}
          pendingSubmitId={submit.isPending ? submit.variables?.orderId : undefined}
          onSubmit={submitForVerification}
          onResubmit={(order) =>
            setResubmitTarget({
              id: order.id,
              orderNo: order.orderNo,
              actualFabricYds: order.actualFabricYds,
              rejectionNote: order.latestLog?.rejectionNote ?? null,
            })
          }
        />
      )}

      <NewOrderDialog
        open={isCreating}
        onClose={() => setIsCreating(false)}
        onCreated={(order) =>
          announce(order, order.status === "PENDING_VERIFICATION" ? "created and sent for verification" : "saved as cutting in progress")
        }
      />
      <ResubmitDialog
        target={resubmitTarget}
        onClose={() => setResubmitTarget(null)}
        onResubmitted={(order) => {
          setResubmitTarget(null);
          announce(order, "resubmitted for a fresh count");
        }}
      />
    </div>
  );
}

function StatusChips({
  orders,
  filter,
  onChange,
}: {
  orders: OrderListItemDto[];
  filter: StatusFilter;
  onChange: (filter: StatusFilter) => void;
}) {
  const chips: { value: StatusFilter; label: string; count: number }[] = [
    { value: "ALL", label: "All", count: orders.length },
    ...ORDER_STATUSES.map((status) => ({
      value: status,
      label: ORDER_STATUS_LABELS[status],
      count: orders.filter((order) => order.status === status).length,
    })),
  ];

  return (
    <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.value}
          type="button"
          aria-pressed={filter === chip.value}
          onClick={() => onChange(chip.value)}
          className="min-h-11 rounded-full border border-field-border bg-surface px-4 text-sm font-medium text-ink aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-white"
        >
          {chip.label} <span className="tabular-nums">({chip.count})</span>
        </button>
      ))}
    </div>
  );
}

function OrdersTable({
  orders,
  pendingSubmitId,
  onSubmit,
  onResubmit,
}: {
  orders: OrderListItemDto[];
  pendingSubmitId: number | undefined;
  onSubmit: (order: OrderListItemDto) => void;
  onResubmit: (order: OrderListItemDto) => void;
}) {
  return (
    // The table scrolls inside its own box on narrow screens, so the page itself never does (§8.4).
    <div className="overflow-x-auto rounded-lg border border-field-border bg-surface">
      <table className="w-full min-w-[60rem] text-left text-sm text-ink">
        <thead className="bg-page">
          <tr>
            {["Order", "Recipe", "Qty", "Fabric roll", "Fabric used", "Wastage", "Status", "Last decision", "Actions"].map(
              (heading) => (
                <th key={heading} scope="col" className="px-3 py-2.5 font-semibold">
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t border-field-border align-top">
              <td className="px-3 py-3">
                <Link href={`/cutting/orders/${order.id}`} className="font-mono font-semibold text-primary underline underline-offset-4">
                  {order.orderNo}
                </Link>
              </td>
              <td className="px-3 py-3">{order.recipe.name}</td>
              <td className="px-3 py-3 tabular-nums">{order.targetQty}</td>
              <td className="px-3 py-3 font-mono">{order.fabricRollId}</td>
              <td className="px-3 py-3 tabular-nums">{formatYards(order.actualFabricYds)}</td>
              <td className="px-3 py-3">
                <WastageValue wastagePct={order.wastagePct} wastageCap={order.wastageCap} exceedsCap={order.wastageExceedsCap} />
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-col items-start gap-1">
                  <OrderStatusBadge status={order.status} />
                  {order.verificationRound > 1 ? (
                    <span className="text-xs text-ink-muted">Round {order.verificationRound}</span>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-3">
                <LatestDecision order={order} />
              </td>
              <td className="px-3 py-3">
                <OrderActions order={order} isSubmitting={pendingSubmitId === order.id} onSubmit={onSubmit} onResubmit={onResubmit} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LatestDecision({ order }: { order: OrderListItemDto }) {
  const log = order.latestLog;
  if (!log) {
    return <span className="text-ink-muted">—</span>;
  }
  return (
    <div className="flex max-w-xs flex-col gap-1">
      <span>
        {log.decision === "APPROVED" ? "Approved" : "Rejected"} by {log.verifier.fullName}
      </span>
      <span className="text-xs text-ink-muted">{formatDateTime(log.createdAt)}</span>
      {order.status === "REJECTED" && log.rejectionNote ? (
        <p className="rounded-md border border-error bg-status-red px-2 py-1 text-status-red-ink">
          <span className="font-semibold">Reason: </span>
          {log.rejectionNote}
        </p>
      ) : null}
    </div>
  );
}

function OrderActions({
  order,
  isSubmitting,
  onSubmit,
  onResubmit,
}: {
  order: OrderListItemDto;
  isSubmitting: boolean;
  onSubmit: (order: OrderListItemDto) => void;
  onResubmit: (order: OrderListItemDto) => void;
}) {
  if (order.status === "CUTTING_IN_PROGRESS") {
    return (
      <Button variant="secondary" disabled={isSubmitting} onClick={() => onSubmit(order)}>
        {isSubmitting ? "Submitting…" : "Submit for Verification"}
      </Button>
    );
  }
  if (order.status === "REJECTED") {
    return (
      <Button variant="secondary" onClick={() => onResubmit(order)}>
        Resubmit after re-cut
      </Button>
    );
  }
  return <span className="text-ink-muted">—</span>;
}
