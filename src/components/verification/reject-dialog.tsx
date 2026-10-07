"use client";

import { useState, type FormEvent } from "react";
import { serverFieldErrors } from "@/components/orders/order-queries";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextAreaField } from "@/components/ui/text-area-field";
import { REJECTION_NOTE_MAX_LENGTH, REJECTION_NOTE_MIN_LENGTH } from "@/domain/constants";
import { rejectionNoteSchema } from "@/domain/validation";
import type { ApiClientError } from "@/lib/api-client";
import { DecisionError } from "./decision-error";

interface RejectDialogProps {
  open: boolean;
  orderNo: string;
  /** Pre-filled reason built from the shortages, e.g. "Shortage: Sleeve Cuffs 96/100 (−4)." */
  suggestedNote: string;
  isPending: boolean;
  error: ApiClientError | null;
  onConfirm: (rejectionNote: string) => void;
  onClose: () => void;
}

/**
 * Sends a batch back for re-cutting (PLAN §8.2). The reason is mandatory and checked with the
 * API's own schema, so the button only enables for a note the server will accept.
 */
export function RejectDialog({ open, orderNo, onClose, ...formProps }: RejectDialogProps) {
  return (
    <Dialog open={open} title={`Reject ${orderNo}`} onClose={onClose}>
      {/* Mounted only while open, so the note is pre-filled from the counts at that moment. */}
      {open ? <RejectForm onCancel={onClose} {...formProps} /> : null}
    </Dialog>
  );
}

function RejectForm({
  suggestedNote,
  isPending,
  error,
  onConfirm,
  onCancel,
}: Omit<RejectDialogProps, "open" | "orderNo" | "onClose"> & { onCancel: () => void }) {
  const [note, setNote] = useState(suggestedNote);
  const [isEdited, setIsEdited] = useState(false);
  const check = rejectionNoteSchema.safeParse(note);
  const localError = check.success ? undefined : check.error.issues[0].message;
  const noteError = (isEdited ? localError : undefined) ?? serverFieldErrors(error).rejectionNote;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!check.success) {
      setIsEdited(true);
      return;
    }
    onConfirm(check.data);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-ink-muted">
        The batch goes back to the cutting supervisor for re-cutting, and they will see this reason. When
        it comes back, every component is counted again.
      </p>
      <TextAreaField
        label="Reason for rejection (required)"
        hint={`${note.trim().length} / ${REJECTION_NOTE_MAX_LENGTH} characters, at least ${REJECTION_NOTE_MIN_LENGTH}.`}
        maxLength={REJECTION_NOTE_MAX_LENGTH}
        required
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          setIsEdited(true);
        }}
        error={noteError}
      />
      {error && !serverFieldErrors(error).rejectionNote ? <DecisionError error={error} /> : null}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" disabled={!check.success || isPending}>
          {isPending ? "Rejecting…" : "Confirm rejection"}
        </Button>
      </div>
    </form>
  );
}
