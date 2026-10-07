"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { SewingOrderDto } from "@/lib/api-types";
import { formatDateTime } from "@/lib/format";
import { useStartSewing } from "./sewing-queries";

interface StartSewingDialogProps {
  target: SewingOrderDto | null;
  onClose: () => void;
}

/** The confirmation before a verified batch goes onto the assembly line (PLAN §8.2). */
export function StartSewingDialog({ target, onClose }: StartSewingDialogProps) {
  return (
    <Dialog open={target !== null} title={target ? `Start sewing ${target.orderNo}?` : "Start sewing"} onClose={onClose}>
      {/* A fresh form per batch, so an earlier batch's error never shows on this one. */}
      {target ? <StartSewingForm key={target.id} order={target} onDone={onClose} /> : null}
    </Dialog>
  );
}

function StartSewingForm({ order, onDone }: { order: SewingOrderDto; onDone: () => void }) {
  const start = useStartSewing();
  const showToast = useToast();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start.mutate(order.id, {
      onSuccess: (started) => {
        showToast(`${started.orderNo} is on the assembly line.`);
        onDone();
      },
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-ink">
        {order.recipe.name} × {order.targetQty}, verified by {order.approval.verifier.fullName} on{" "}
        {formatDateTime(order.approval.createdAt)}.
      </p>
      <p className="text-ink-muted">
        The batch moves from the queue to the assembly line. The start is recorded with your name and
        the time, and cannot be undone.
      </p>
      {start.error ? (
        <p role="alert" className="rounded-md border border-error bg-status-red px-3 py-2 text-sm font-medium text-status-red-ink">
          {start.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={start.isPending}>
          {start.isPending ? "Starting…" : "Start Sewing Assembly"}
        </Button>
      </div>
    </form>
  );
}
