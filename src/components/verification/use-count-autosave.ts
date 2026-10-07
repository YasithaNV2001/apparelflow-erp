"use client";

import { useRef, useState } from "react";
import type { ApiClientError } from "@/lib/api-client";
import { useSaveCounts } from "./verification-queries";

/** Quiet time after the last keystroke before the counts are sent. */
const AUTOSAVE_DELAY_MS = 600;

export type AutosaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "failed"; error: ApiClientError };

export interface CountAutosave {
  state: AutosaveState;
  /** Queues one component's count (null clears it); it is sent after a short pause in typing. */
  queue: (componentId: number, actualQty: number | null) => void;
  /** Sends everything waiting now: the retry button, or after a decision failed. */
  retry: () => void;
  /** Stops sending while a decision request carries the whole sheet. */
  hold: () => void;
  /** Forgets anything waiting, once a decision has been recorded. */
  discard: () => void;
}

/**
 * Debounced autosave for the verifier's count sheet (PLAN §8.2, §4.5). The debounce lives in the
 * change handler rather than in effects, and saves run one at a time, so responses can never
 * arrive out of order. A failed batch is kept for the retry unless a newer value replaced it.
 */
export function useCountAutosave(orderId: number): CountAutosave {
  const save = useSaveCounts();
  const [state, setState] = useState<AutosaveState>({ kind: "idle" });
  const waiting = useRef(new Map<number, number | null>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const held = useRef(false);

  function clearTimer(): void {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function send(): void {
    clearTimer();
    if (held.current || inFlight.current || waiting.current.size === 0) {
      return;
    }
    const batch = new Map(waiting.current);
    waiting.current.clear();
    inFlight.current = true;
    setState({ kind: "saving" });

    const items = [...batch].map(([componentId, actualQty]) => ({ componentId, actualQty }));
    save.mutate(
      { orderId, items },
      {
        onSuccess: () => {
          inFlight.current = false;
          if (waiting.current.size > 0) {
            send();
          } else {
            setState({ kind: "saved" });
          }
        },
        onError: (error) => {
          inFlight.current = false;
          for (const [componentId, actualQty] of batch) {
            if (!waiting.current.has(componentId)) {
              waiting.current.set(componentId, actualQty);
            }
          }
          setState({ kind: "failed", error });
        },
      },
    );
  }

  function queue(componentId: number, actualQty: number | null): void {
    waiting.current.set(componentId, actualQty);
    setState({ kind: "saving" });
    clearTimer();
    timer.current = setTimeout(send, AUTOSAVE_DELAY_MS);
  }

  function retry(): void {
    held.current = false;
    send();
  }

  function hold(): void {
    held.current = true;
    clearTimer();
  }

  function discard(): void {
    clearTimer();
    waiting.current.clear();
  }

  return { state, queue, retry, hold, discard };
}
