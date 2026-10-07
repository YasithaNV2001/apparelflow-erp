"use client";

import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/button";
import type { OrderListItemDto } from "@/lib/api-types";
import { formatDateTime } from "@/lib/format";
import { RoundBadge } from "./round-badge";
import { useVerificationQueue } from "./verification-queries";

/** The verifier's home (PLAN §8.2): every batch waiting for a physical count, oldest first. */
export function VerificationQueue() {
  const queue = useVerificationQueue();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Verification queue</h1>
        <p className="text-ink-muted">
          Batches waiting for a physical count, oldest first. The list refreshes every 15 seconds.
        </p>
      </div>

      {queue.isPending ? (
        <p className="text-ink-muted" aria-busy="true">Loading the queue…</p>
      ) : queue.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-error">
          <p className="font-medium">The queue could not be loaded: {queue.error.message}</p>
          <Button variant="secondary" onClick={() => queue.refetch()}>Try again</Button>
        </div>
      ) : queue.data.length === 0 ? (
        <p className="rounded-md border border-field-border bg-surface px-4 py-6 text-center text-ink-muted">
          No batches are waiting for verification.
        </p>
      ) : (
        <ol className="grid gap-4 md:grid-cols-2">
          {queue.data.map((order) => (
            <QueueCard key={order.id} order={order} />
          ))}
        </ol>
      )}
    </div>
  );
}

function QueueCard({ order }: { order: OrderListItemDto }) {
  const { green, yellow, red, uncounted } = order.summary;
  const total = green + yellow + red + uncounted;
  const counted = total - uncounted;
  const isRecount = order.verificationRound > 1;
  const sentBackFor = isRecount ? order.latestLog?.rejectionNote : null;

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-field-border bg-surface p-4 text-ink">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-lg font-semibold">{order.orderNo}</h2>
        <RoundBadge round={order.verificationRound} />
      </div>
      <p className="text-lg">
        {order.recipe.name} <span className="text-ink-muted">×</span> {order.targetQty}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="font-medium text-ink-muted">Fabric roll</dt>
          <dd className="font-mono">{order.fabricRollId}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">Submitted</dt>
          <dd>{order.submittedAt ? formatDateTime(order.submittedAt) : "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-medium text-ink-muted">Progress</dt>
          <dd>
            {counted} of {total} components counted
          </dd>
        </div>
      </dl>
      {sentBackFor ? (
        <p className="rounded-md border border-error bg-status-red px-3 py-2 text-sm text-status-red-ink">
          <span className="font-semibold">Sent back last round: </span>
          {sentBackFor}
        </p>
      ) : null}
      <Link href={`/verification/${order.id}`} className={`${buttonClasses("primary")} mt-auto`}>
        {counted > 0 ? "Continue counting" : "Start counting"}
        <span className="sr-only"> {order.orderNo}</span>
      </Link>
    </li>
  );
}
