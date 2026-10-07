"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextAreaField } from "@/components/ui/text-area-field";
import { APPROVAL_NOTE_MAX_LENGTH } from "@/domain/constants";
import type { ApiClientError } from "@/lib/api-client";
import { DecisionError } from "./decision-error";

interface ApproveDialogProps {
  open: boolean;
  orderNo: string;
  verifierName: string;
  isPending: boolean;
  error: ApiClientError | null;
  onConfirm: (approvalNote: string) => void;
  onClose: () => void;
}

/**
 * The sign-off before a batch goes to sewing (PLAN §8.2): the verifier confirms the physical count
 * and may leave an audit note for the sewing supervisor (D28).
 */
export function ApproveDialog({ open, orderNo, onClose, ...formProps }: ApproveDialogProps) {
  return (
    <Dialog open={open} title={`Approve ${orderNo}`} onClose={onClose}>
      {/* Mounted only while open, so every opening starts with an empty note. */}
      {open ? <ApproveForm orderNo={orderNo} onCancel={onClose} {...formProps} /> : null}
    </Dialog>
  );
}

function ApproveForm({
  orderNo,
  verifierName,
  isPending,
  error,
  onConfirm,
  onCancel,
}: Omit<ApproveDialogProps, "open" | "onClose"> & { onCancel: () => void }) {
  const [note, setNote] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm(note);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="rounded-md border border-field-border bg-page px-3 py-3 text-ink">
        I, <strong>{verifierName}</strong>, confirm I have physically counted every component of{" "}
        <span className="font-mono font-semibold">{orderNo}</span>.
      </p>
      <p className="text-ink-muted">
        Approving sends this batch to the sewing queue. The decision is recorded permanently with your
        name and the time.
      </p>
      <TextAreaField
        label="Audit note for the sewing supervisor (optional)"
        hint={`${note.length} / ${APPROVAL_NOTE_MAX_LENGTH} characters`}
        maxLength={APPROVAL_NOTE_MAX_LENGTH}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {error ? <DecisionError error={error} /> : null}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Approving…" : "Confirm approval"}
        </Button>
      </div>
    </form>
  );
}
