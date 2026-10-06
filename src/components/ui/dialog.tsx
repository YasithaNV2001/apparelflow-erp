"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A native <dialog> opened with showModal(): the browser moves focus inside, makes the page
 * behind inert and closes it on Esc (PLAN §8.3). `onClose` keeps React's state in step.
 */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Syncs React state with the browser's imperative dialog API; no data is fetched here.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-lg border border-field-border bg-surface p-0 text-ink backdrop:bg-ink/60"
    >
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
        <h2 id={titleId} className="text-xl font-semibold text-ink">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
