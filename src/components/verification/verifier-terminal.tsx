"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ComponentStatusPill } from "@/components/orders/component-status-pill";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { useOrder } from "@/components/orders/order-queries";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import {
  checkCount,
  completeSheet,
  describeShortages,
  partialSheet,
  previewSheet,
  type SheetRow,
} from "@/domain/count-sheet";
import type { ComponentStatus } from "@/domain/constants";
import type { CountSummary } from "@/domain/traffic-light";
import type { OrderDto } from "@/lib/api-types";
import { formatDateTime, formatSigned, formatYards } from "@/lib/format";
import { ApproveDialog } from "./approve-dialog";
import { RejectDialog } from "./reject-dialog";
import { RoundBadge } from "./round-badge";
import { useCountAutosave, type AutosaveState } from "./use-count-autosave";
import { useApproveOrder, useRejectOrder } from "./verification-queries";

const NOT_FOUND_STATUS = 404;
const QUEUE_PATH = "/verification";

/** The verifier terminal (PLAN §8.2): count every component, then approve or reject the batch. */
export function VerifierTerminal({ orderId, verifierName }: { orderId: number; verifierName: string }) {
  const order = useOrder(orderId);

  if (order.isPending) {
    return <p className="text-ink-muted" aria-busy="true">Loading the count sheet…</p>;
  }
  if (order.error) {
    return (
      <div role="alert" className="flex flex-col gap-3">
        <p className="font-medium text-error">
          {order.error.status === NOT_FOUND_STATUS ? "This batch is not in your queue." : order.error.message}
        </p>
        <BackLink />
      </div>
    );
  }
  if (order.data.status !== "PENDING_VERIFICATION") {
    return <DecidedNotice order={order.data} />;
  }
  // A new round starts a fresh sheet; within a round, typed values survive every refetch.
  return (
    <CountSheet
      key={`${order.data.id}:${order.data.verificationRound}`}
      order={order.data}
      verifierName={verifierName}
    />
  );
}

type OpenDialog = "approve" | "reject" | null;

function CountSheet({ order, verifierName }: { order: OrderDto; verifierName: string }) {
  const router = useRouter();
  const showToast = useToast();
  const autosave = useCountAutosave(order.id);
  const approve = useApproveOrder();
  const reject = useRejectOrder();
  // Exactly what was typed, per component. Empty means not counted, never 0 (D17).
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(order.items.map((item) => [item.componentId, item.actualQty?.toString() ?? ""])),
  );
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);

  const { rows, summary } = previewSheet(order.items, drafts);
  const isDeciding = approve.isPending || reject.isPending;

  function changeCount(componentId: number, raw: string) {
    setDrafts((current) => ({ ...current, [componentId]: raw }));
    const check = checkCount(raw);
    // Invalid text is never sent; the box shows its error and blocks approval instead.
    if (check.kind !== "invalid") {
      autosave.queue(componentId, check.kind === "count" ? check.value : null);
    }
  }

  function showDialog(dialog: OpenDialog) {
    approve.reset();
    reject.reset();
    setOpenDialog(dialog);
  }

  // mutateAsync, so the toast and the redirect run even after the decided order replaces this sheet.
  async function decide(request: () => Promise<OrderDto>, outcome: string) {
    autosave.hold();
    try {
      const decided = await request();
      autosave.discard();
      showToast(`${decided.orderNo} ${outcome}.`);
      router.push(QUEUE_PATH);
    } catch {
      // The dialog shows the server's reason; anything typed meanwhile still needs saving.
      autosave.retry();
    }
  }

  function confirmApprove(approvalNote: string) {
    const items = completeSheet(rows);
    if (!items) {
      return;
    }
    void decide(
      () => approve.mutateAsync({ orderId: order.id, items, approvalNote }),
      "approved and sent to the sewing queue",
    );
  }

  function confirmReject(rejectionNote: string) {
    const items = partialSheet(rows);
    void decide(
      () => reject.mutateAsync({ orderId: order.id, rejectionNote, ...(items.length > 0 ? { items } : {}) }),
      "rejected and returned to the cutting supervisor",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <SheetHeader order={order} />
      <SummaryBar summary={summary} autosave={autosave.state} onRetry={autosave.retry} />

      <fieldset disabled={isDeciding} className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold text-ink">Component counts</legend>
        <p className="text-ink-muted">
          Type the number of pieces you counted. Leave a box empty until you have counted it: 0 means you
          counted none.
        </p>
        <ol className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <CountRow
              key={row.componentId}
              row={row}
              piecesPerGarment={order.items[index].piecesPerGarment}
              draft={drafts[row.componentId] ?? ""}
              isLast={index === rows.length - 1}
              onChange={changeCount}
            />
          ))}
        </ol>
      </fieldset>

      <DecisionPanel
        summary={summary}
        disabled={isDeciding}
        onApprove={() => showDialog("approve")}
        onReject={() => showDialog("reject")}
      />

      <ApproveDialog
        open={openDialog === "approve"}
        orderNo={order.orderNo}
        verifierName={verifierName}
        isPending={approve.isPending}
        error={approve.error}
        onConfirm={confirmApprove}
        onClose={() => setOpenDialog(null)}
      />
      <RejectDialog
        open={openDialog === "reject"}
        orderNo={order.orderNo}
        suggestedNote={describeShortages(rows)}
        isPending={reject.isPending}
        error={reject.error}
        onConfirm={confirmReject}
        onClose={() => setOpenDialog(null)}
      />
    </div>
  );
}

function SheetHeader({ order }: { order: OrderDto }) {
  const sentBack = order.verificationRound > 1 ? order.logs.findLast((log) => log.decision === "REJECTED") : undefined;

  return (
    <header className="flex flex-col gap-2">
      <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold text-ink">
        <span className="font-mono">{order.orderNo}</span>
        <OrderStatusBadge status={order.status} />
        <RoundBadge round={order.verificationRound} />
      </h1>
      <p className="text-lg text-ink">
        {order.recipe.name} ({order.recipe.code}) <span className="text-ink-muted">×</span> {order.targetQty}
      </p>
      <p className="text-ink-muted">
        Roll <span className="font-mono">{order.fabricRollId}</span> · {formatYards(order.actualFabricYds)} used
        {order.submittedAt ? ` · submitted ${formatDateTime(order.submittedAt)}` : ""}
      </p>
      {sentBack?.rejectionNote ? (
        <p className="rounded-md border border-error bg-status-red px-3 py-2 text-sm text-status-red-ink">
          <span className="font-semibold">Sent back last round: </span>
          {sentBack.rejectionNote}
        </p>
      ) : null}
    </header>
  );
}

const SUMMARY_CHIPS = [
  { key: "green", icon: "✓", label: "match", className: "bg-status-green text-status-green-ink" },
  { key: "yellow", icon: "▲", label: "excess", className: "bg-status-yellow text-status-yellow-ink" },
  { key: "red", icon: "▼", label: "short", className: "bg-status-red text-status-red-ink" },
  { key: "uncounted", icon: "○", label: "not counted", className: "bg-status-uncounted text-status-uncounted-ink" },
] as const;

/** "3 match · 1 excess · 1 short · 0 not counted", plus the autosave indicator. */
function SummaryBar({
  summary,
  autosave,
  onRetry,
}: {
  summary: CountSummary;
  autosave: AutosaveState;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-field-border bg-surface shadow-sm p-4 sm:flex-row sm:items-center sm:justify-between">
      <ul aria-label="Count summary" className="flex flex-wrap gap-2">
        {SUMMARY_CHIPS.map((chip) => (
          <li key={chip.key} className={`rounded-full px-3 py-1 text-sm font-semibold ${chip.className}`}>
            <span aria-hidden="true">{chip.icon} </span>
            <span className="tabular-nums">{summary[chip.key]}</span> {chip.label}
          </li>
        ))}
      </ul>
      <AutosaveIndicator state={autosave} onRetry={onRetry} />
    </div>
  );
}

function AutosaveIndicator({ state, onRetry }: { state: AutosaveState; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p role="status" className={`text-sm font-medium ${state.kind === "failed" ? "text-error" : "text-ink-muted"}`}>
        {state.kind === "idle" ? "Counts save automatically." : null}
        {state.kind === "saving" ? "Saving…" : null}
        {state.kind === "saved" ? (
          <>
            <span aria-hidden="true">✓ </span>All counts saved
          </>
        ) : null}
        {state.kind === "failed" ? (
          <>
            <span aria-hidden="true">✕ </span>Not saved: {state.error.message}
          </>
        ) : null}
      </p>
      {state.kind === "failed" ? (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/** A row's left edge repeats its traffic light, so a shortage stands out at a glance; the pill still says it in words. */
const ROW_EDGES: Record<ComponentStatus, string> = {
  GREEN: "border-l-status-green-edge",
  YELLOW: "border-l-status-yellow-edge",
  RED: "border-l-status-red-edge",
  UNCOUNTED: "border-l-status-uncounted-edge",
};

/**
 * One component. Below 768 px it is a card (name and status, then expected and variance, then a
 * full-width count box); from 768 px the same cells line up as one row (PLAN §8.4).
 */
function CountRow({
  row,
  piecesPerGarment,
  draft,
  isLast,
  onChange,
}: {
  row: SheetRow;
  piecesPerGarment: number;
  draft: string;
  isLast: boolean;
  onChange: (componentId: number, raw: string) => void;
}) {
  return (
    <li
      className={`grid grid-cols-2 items-start gap-x-4 gap-y-3 rounded-lg border border-l-4 border-field-border ${ROW_EDGES[row.status]} ${row.status === "RED" ? "bg-status-red-tint" : "bg-surface"} p-4 text-ink shadow-sm md:grid-cols-[minmax(0,1.4fr)_5.5rem_10rem_5.5rem_minmax(0,1.3fr)] md:items-center`}
    >
      <div className="md:order-1">
        <p className="text-lg font-semibold">{row.componentName}</p>
        <p className="text-sm text-ink-muted">{piecesPerGarment} per garment</p>
      </div>
      <div className="flex justify-end md:order-5">
        <ComponentStatusPill status={row.status} variance={row.variance} />
      </div>
      <Figure label="Expected" value={String(row.expectedQty)} className="md:order-2" />
      <Figure
        label="Variance"
        value={row.variance === null ? "—" : formatSigned(row.variance)}
        className="md:order-4"
      />
      <div className="col-span-2 md:order-3 md:col-span-1">
        <TextField
          label={
            <>
              Counted<span className="sr-only"> {row.componentName}</span>
            </>
          }
          size="large"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint={isLast ? "done" : "next"}
          value={draft}
          onChange={(event) => onChange(row.componentId, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              focusNextCount(event.currentTarget);
            }
          }}
          error={row.check.kind === "invalid" ? row.check.error : undefined}
          className="w-full"
        />
      </div>
    </li>
  );
}

/** The keyboard's "next" key (Enter) moves on to the next component's count box. */
function focusNextCount(box: HTMLInputElement): void {
  const boxes = Array.from(box.closest("ol")?.querySelectorAll("input") ?? []);
  boxes[boxes.indexOf(box) + 1]?.focus();
}

function Figure({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={className}>
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

type DecisionState = "ready" | "short" | "counting";

/** A shortage blocks for real; uncounted components only mean the count isn't finished yet. */
function decisionState(summary: CountSummary): DecisionState {
  if (summary.canApprove) {
    return "ready";
  }
  return summary.red > 0 ? "short" : "counting";
}

const DECISION_CALLOUTS: Record<DecisionState, { icon: string; title: string; className: string }> = {
  ready: {
    icon: "✓",
    title: "Every component is counted and none is short. This batch can be approved.",
    className: "border-l-status-green-edge bg-status-green-tint text-status-green-ink",
  },
  short: {
    icon: "✕",
    title: "Approve is blocked: at least one component is short.",
    className: "border-l-status-red-edge bg-status-red-tint text-status-red-ink",
  },
  counting: {
    icon: "○",
    title: "Approve unlocks once every component is counted and none is short.",
    className: "border-l-status-uncounted-edge bg-page text-ink",
  },
};

/** Approve stays disabled while anything blocks it, and the reasons are listed beside it (PLAN §8.2). */
function DecisionPanel({
  summary,
  disabled,
  onApprove,
  onReject,
}: {
  summary: CountSummary;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const headingId = useId();
  const blockersId = useId();
  const callout = DECISION_CALLOUTS[decisionState(summary)];

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border border-field-border bg-surface shadow-sm p-4 text-ink"
    >
      <h2 id={headingId} className="text-xl font-semibold">
        Decision
      </h2>
      <div id={blockersId} className={`rounded-md border-l-4 px-4 py-3 ${callout.className}`}>
        <p className="font-semibold">
          <span aria-hidden="true">{callout.icon} </span>
          {callout.title}
        </p>
        {summary.canApprove ? null : (
          <ul className="mt-1 list-disc pl-5">
            {summary.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="danger" disabled={disabled} onClick={onReject}>
          Reject Batch
        </Button>
        <Button disabled={disabled || !summary.canApprove} aria-describedby={blockersId} onClick={onApprove}>
          Approve Batch
        </Button>
      </div>
    </section>
  );
}

function DecidedNotice({ order }: { order: OrderDto }) {
  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold text-ink">
        <span className="font-mono">{order.orderNo}</span>
        <OrderStatusBadge status={order.status} />
      </h1>
      <p className="text-ink-muted">
        This batch is no longer waiting for verification, so its counts can no longer change.
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href={QUEUE_PATH}
      className="inline-flex min-h-11 w-fit items-center font-medium text-primary underline underline-offset-4"
    >
      ← Verification queue
    </Link>
  );
}
