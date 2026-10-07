"use client";

import { useState, type ReactNode } from "react";
import { ComponentStatusPill } from "@/components/orders/component-status-pill";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { WastageValue } from "@/components/orders/wastage-value";
import { Button } from "@/components/ui/button";
import type { ApiClientError } from "@/lib/api-client";
import type { SewingOrderDto } from "@/lib/api-types";
import { formatDateTime, formatPercent, formatSigned, formatYards } from "@/lib/format";
import { useAssemblyLine, useSewingQueue } from "./sewing-queries";
import { StartSewingDialog } from "./start-sewing-dialog";

/**
 * The sewing supervisor's home (PLAN §8.2): approved batches ready to start, and the ones already
 * on the assembly line. The API only ever sends verified batches, so nothing is filtered here.
 */
export function SewingBoard() {
  const [startTarget, setStartTarget] = useState<SewingOrderDto | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Sewing queue</h1>
        <p className="text-ink-muted">
          Only batches a cutting verifier has approved reach this page. Both lists refresh every 15 seconds.
        </p>
      </div>
      <ReadyForAssembly onStart={setStartTarget} />
      <AssemblyLine />
      <StartSewingDialog target={startTarget} onClose={() => setStartTarget(null)} />
    </div>
  );
}

function ReadyForAssembly({ onStart }: { onStart: (order: SewingOrderDto) => void }) {
  const queue = useSewingQueue();
  return (
    <section aria-labelledby="ready-heading" className="flex flex-col gap-4">
      <h2 id="ready-heading" className="text-xl font-semibold text-ink">
        Ready for Assembly
      </h2>
      <ListState
        data={queue.data}
        error={queue.error}
        onRetry={() => queue.refetch()}
        loadingText="Loading verified batches…"
        emptyText="No verified batches are waiting. A batch appears here as soon as a verifier approves it."
      >
        {(orders) => (
          // minmax(0, 1fr) columns, so a card's wide table scrolls inside the card instead of the page.
          <ol className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {orders.map((order) => (
              <ReadyCard key={order.id} order={order} onStart={onStart} />
            ))}
          </ol>
        )}
      </ListState>
    </section>
  );
}

function ReadyCard({ order, onStart }: { order: SewingOrderDto; onStart: (order: SewingOrderDto) => void }) {
  const { approval } = order;
  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-lg border border-field-border bg-surface p-4 text-ink">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-lg font-semibold">{order.orderNo}</h3>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="text-lg">
        {order.recipe.name} <span className="text-ink-muted">×</span> {order.targetQty}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="col-span-2">
          <dt className="font-medium text-ink-muted">Verified by</dt>
          <dd>
            {approval.verifier.fullName} · {formatDateTime(approval.createdAt)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">Fabric roll</dt>
          <dd className="font-mono">{order.fabricRollId}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">Fabric used</dt>
          <dd className="tabular-nums">{formatYards(order.actualFabricYds)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-medium text-ink-muted">Wastage (cap {formatPercent(order.wastageCap)})</dt>
          <dd>
            <WastageValue
              wastagePct={approval.wastagePct}
              wastageCap={order.wastageCap}
              exceedsCap={approval.wastageExceedsCap}
            />
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="font-medium text-ink-muted">Count check</dt>
          <dd>
            <span aria-hidden="true">✓ </span>
            {order.summary.green} match · <span aria-hidden="true">▲ </span>
            {order.summary.yellow} excess
          </dd>
        </div>
      </dl>
      {approval.approvalNote ? (
        <div className="rounded-md border border-field-border bg-page px-3 py-2 text-sm">
          <p className="font-semibold">Verifier&apos;s note</p>
          <p>{approval.approvalNote}</p>
        </div>
      ) : null}
      <ComponentCounts order={order} />
      <Button className="mt-auto" onClick={() => onStart(order)}>
        Start Sewing Assembly<span className="sr-only"> for {order.orderNo}</span>
      </Button>
    </li>
  );
}

/** Expected and counted pieces per component, folded away until asked for. */
function ComponentCounts({ order }: { order: SewingOrderDto }) {
  return (
    <details className="group rounded-md border border-field-border">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 font-medium text-primary">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ▸
        </span>
        Component counts ({order.items.length})
      </summary>
      <div className="overflow-x-auto border-t border-field-border">
        <table className="w-full min-w-120 text-left text-sm text-ink">
          <thead className="bg-page">
            <tr>
              {["Component", "Expected", "Counted", "Variance", "Status"].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-2 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.componentId} className="border-t border-field-border">
                <td className="px-3 py-2">{item.componentName}</td>
                <td className="px-3 py-2 tabular-nums">{item.expectedQty}</td>
                <td className="px-3 py-2 tabular-nums">{item.actualQty ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {item.variance === null ? "—" : formatSigned(item.variance)}
                </td>
                <td className="px-3 py-2">
                  <ComponentStatusPill status={item.status} variance={item.variance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function AssemblyLine() {
  const line = useAssemblyLine();
  return (
    <section aria-labelledby="line-heading" className="flex flex-col gap-4">
      <h2 id="line-heading" className="text-xl font-semibold text-ink">
        On the Assembly Line
      </h2>
      <ListState
        data={line.data}
        error={line.error}
        onRetry={() => line.refetch()}
        loadingText="Loading the assembly line…"
        emptyText="No batch is being sewn yet."
      >
        {(orders) => (
          <ol className="flex flex-col gap-3">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-col items-start gap-2 rounded-lg border border-field-border bg-surface p-4 text-ink sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h3 className="font-mono font-semibold">{order.orderNo}</h3>
                  <p>
                    {order.recipe.name} <span className="text-ink-muted">×</span> {order.targetQty}
                  </p>
                </div>
                <p className="text-sm">
                  Started by {order.sewingStartedBy?.fullName ?? "—"}
                  {order.sewingStartedAt ? ` · ${formatDateTime(order.sewingStartedAt)}` : ""}
                </p>
                <OrderStatusBadge status={order.status} />
              </li>
            ))}
          </ol>
        )}
      </ListState>
    </section>
  );
}

/**
 * Loading, the list (or its empty state), and a retry when loading failed. A failed background
 * refresh keeps the last list on screen, with the error above it.
 */
function ListState({
  data,
  error,
  onRetry,
  loadingText,
  emptyText,
  children,
}: {
  data: SewingOrderDto[] | undefined;
  error: ApiClientError | null;
  onRetry: () => void;
  loadingText: string;
  emptyText: string;
  children: (orders: SewingOrderDto[]) => ReactNode;
}) {
  const failure = error ? (
    <div role="alert" className="flex flex-wrap items-center gap-3 text-error">
      <p className="font-medium">The latest list could not be loaded: {error.message}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  ) : null;

  if (data === undefined) {
    return (
      failure ?? (
        <p className="text-ink-muted" aria-busy="true">
          {loadingText}
        </p>
      )
    );
  }
  return (
    <>
      {failure}
      {data.length === 0 ? (
        <p className="rounded-md border border-field-border bg-surface px-4 py-6 text-center text-ink-muted">
          {emptyText}
        </p>
      ) : (
        children(data)
      )}
    </>
  );
}
