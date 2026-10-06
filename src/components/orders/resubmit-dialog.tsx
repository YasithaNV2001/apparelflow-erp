"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { checkFabricYds } from "@/domain/order-form";
import type { OrderDto } from "@/lib/api-types";
import { serverFieldErrors, useSubmitOrder } from "./order-queries";

export interface ResubmitTarget {
  id: number;
  orderNo: string;
  actualFabricYds: number;
  rejectionNote: string | null;
}

interface ResubmitDialogProps {
  target: ResubmitTarget | null;
  onClose: () => void;
  onResubmitted: (order: OrderDto) => void;
}

/**
 * "Resubmit after re-cut" (PLAN D9): optionally correct the fabric used, then send the batch
 * back to the verifier, who recounts every component from scratch.
 */
export function ResubmitDialog({ target, onClose, onResubmitted }: ResubmitDialogProps) {
  return (
    <Dialog open={target !== null} title={target ? `Resubmit ${target.orderNo}` : "Resubmit"} onClose={onClose}>
      {target ? (
        // A fresh form per order, so a previous order's edits never leak into this one.
        <ResubmitForm key={target.id} target={target} onCancel={onClose} onResubmitted={onResubmitted} />
      ) : null}
    </Dialog>
  );
}

function ResubmitForm({
  target,
  onCancel,
  onResubmitted,
}: {
  target: ResubmitTarget;
  onCancel: () => void;
  onResubmitted: (order: OrderDto) => void;
}) {
  const submit = useSubmitOrder();
  const [fabric, setFabric] = useState(String(target.actualFabricYds));
  const fabricCheck = checkFabricYds(fabric);
  const fabricError =
    ("error" in fabricCheck ? fabricCheck.error : undefined) ??
    serverFieldErrors(submit.error).actualFabricYds;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ("error" in fabricCheck) {
      return;
    }
    submit.mutate(
      { orderId: target.id, actualFabricYds: fabricCheck.value },
      { onSuccess: onResubmitted },
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {target.rejectionNote ? (
        <div className="rounded-md border border-error bg-status-red px-3 py-2 text-sm text-status-red-ink">
          <p className="font-semibold">Verifier&apos;s reason</p>
          <p>{target.rejectionNote}</p>
        </div>
      ) : null}
      <p className="text-ink-muted">
        The verifier will count every component again from scratch. Update the fabric used if the
        re-cut needed more.
      </p>
      <TextField
        label="Actual fabric used (yards)"
        inputMode="decimal"
        autoComplete="off"
        hint="Up to 2 decimals."
        value={fabric}
        onChange={(event) => setFabric(event.target.value)}
        error={fabricError}
      />
      {submit.error && !fabricError ? (
        <p role="alert" className="rounded-md border border-error bg-status-red px-3 py-2 text-sm font-medium text-status-red-ink">
          {submit.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={"error" in fabricCheck || submit.isPending}>
          {submit.isPending ? "Resubmitting…" : "Resubmit for verification"}
        </Button>
      </div>
    </form>
  );
}
