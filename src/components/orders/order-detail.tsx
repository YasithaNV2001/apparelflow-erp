"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OrderDto, OrderItemDto, VerificationLogDto } from "@/lib/api-types";
import { formatDateTime, formatPercent, formatSigned, formatYards } from "@/lib/format";
import { ComponentStatusPill } from "./component-status-pill";
import { OrderStatusBadge } from "./order-status-badge";
import { useOrder, useSubmitOrder } from "./order-queries";
import { ResubmitDialog, type ResubmitTarget } from "./resubmit-dialog";
import { WastageValue } from "./wastage-value";

const NOT_FOUND_STATUS = 404;

/** One order for the supervisor (PLAN §8.2): header, counted items and the decision timeline. */
export function OrderDetail({ orderId }: { orderId: number }) {
  const order = useOrder(orderId);

  if (order.isPending) {
    return <p className="text-ink-muted" aria-busy="true">Loading order…</p>;
  }
  if (order.error) {
    return (
      <div role="alert" className="flex flex-col gap-3">
        <p className="font-medium text-error">
          {order.error.status === NOT_FOUND_STATUS ? "This order does not exist." : order.error.message}
        </p>
        <BackLink />
      </div>
    );
  }
  return <OrderView order={order.data} />;
}

function OrderView({ order }: { order: OrderDto }) {
  const submit = useSubmitOrder();
  const [resubmitTarget, setResubmitTarget] = useState<ResubmitTarget | null>(null);
  const latestRejection = order.logs.findLast((log) => log.decision === "REJECTED");

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold text-ink">
            <span className="font-mono">{order.orderNo}</span>
            <OrderStatusBadge status={order.status} />
          </h1>
          <p className="text-ink-muted">
            {order.recipe.name} ({order.recipe.code}) × {order.targetQty} · roll{" "}
            <span className="font-mono">{order.fabricRollId}</span> · round {order.verificationRound}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {order.status === "CUTTING_IN_PROGRESS" ? (
            <Button disabled={submit.isPending} onClick={() => submit.mutate({ orderId: order.id })}>
              {submit.isPending ? "Submitting…" : "Submit for Verification"}
            </Button>
          ) : null}
          {order.status === "REJECTED" ? (
            <Button
              onClick={() =>
                setResubmitTarget({
                  id: order.id,
                  orderNo: order.orderNo,
                  actualFabricYds: order.actualFabricYds,
                  rejectionNote: latestRejection?.rejectionNote ?? null,
                })
              }
            >
              Resubmit after re-cut
            </Button>
          ) : null}
        </div>
      </header>

      {submit.error ? (
        <p role="alert" className="rounded-md border border-error bg-status-red px-3 py-2 text-sm font-medium text-status-red-ink">
          {submit.error.message}
        </p>
      ) : null}

      <dl className="grid gap-4 rounded-lg border border-field-border bg-surface p-4 text-ink sm:grid-cols-3">
        <div>
          <dt className="text-sm font-medium text-ink-muted">Fabric used</dt>
          <dd className="tabular-nums">{formatYards(order.actualFabricYds)}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-ink-muted">Expected fabric</dt>
          <dd className="tabular-nums">{formatYards(order.expectedFabricYds)}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-ink-muted">Wastage (cap {formatPercent(order.wastageCap)})</dt>
          <dd>
            <WastageValue wastagePct={order.wastagePct} wastageCap={order.wastageCap} exceedsCap={order.wastageExceedsCap} />
          </dd>
        </div>
      </dl>

      <ItemsTable items={order.items} summary={order.summary} />
      <DecisionTimeline logs={order.logs} />

      <ResubmitDialog
        target={resubmitTarget}
        onClose={() => setResubmitTarget(null)}
        onResubmitted={() => setResubmitTarget(null)}
      />
    </div>
  );
}

function ItemsTable({ items, summary }: { items: OrderItemDto[]; summary: OrderDto["summary"] }) {
  return (
    <section aria-labelledby="components-heading" className="flex flex-col gap-3">
      <h2 id="components-heading" className="text-xl font-semibold text-ink">Components</h2>
      <p className="text-sm text-ink-muted">
        {summary.green} match · {summary.yellow} excess · {summary.red} short · {summary.uncounted} not counted
      </p>
      <div className="overflow-x-auto rounded-lg border border-field-border bg-surface">
        <table className="w-full min-w-[40rem] text-left text-sm text-ink">
          <thead className="bg-page">
            <tr>
              {["Component", "Pieces per garment", "Expected", "Counted", "Variance", "Status"].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-2.5 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.componentId} className="border-t border-field-border">
                <td className="px-3 py-2.5">{item.componentName}</td>
                <td className="px-3 py-2.5 tabular-nums">{item.piecesPerGarment}</td>
                <td className="px-3 py-2.5 tabular-nums">{item.expectedQty}</td>
                <td className="px-3 py-2.5 tabular-nums">{item.actualQty ?? "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">{item.variance === null ? "—" : formatSigned(item.variance)}</td>
                <td className="px-3 py-2.5">
                  <ComponentStatusPill status={item.status} variance={item.variance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DecisionTimeline({ logs }: { logs: VerificationLogDto[] }) {
  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
      <h2 id="timeline-heading" className="text-xl font-semibold text-ink">Verification history</h2>
      {logs.length === 0 ? (
        <p className="text-ink-muted">No verification decisions yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-col gap-1 rounded-lg border border-field-border bg-surface p-4 text-ink">
              <p className="font-semibold">
                <span aria-hidden="true">{log.decision === "APPROVED" ? "✓ " : "✕ "}</span>
                {log.decision === "APPROVED" ? "Approved" : "Rejected"} by {log.verifier.fullName}
              </p>
              <p className="text-sm text-ink-muted">
                {formatDateTime(log.createdAt)} · round {log.verificationRound} · wastage {formatPercent(log.wastagePct)}
                {log.wastageExceedsCap ? " (over cap)" : ""}
              </p>
              {log.rejectionNote ? (
                <p className="rounded-md border border-error bg-status-red px-3 py-2 text-sm text-status-red-ink">
                  <span className="font-semibold">Reason: </span>
                  {log.rejectionNote}
                </p>
              ) : null}
              {log.approvalNote ? (
                <p className="text-sm">
                  <span className="font-semibold">Note: </span>
                  {log.approvalNote}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/cutting" className="w-fit font-medium text-primary underline underline-offset-4">
      ← All cutting orders
    </Link>
  );
}
