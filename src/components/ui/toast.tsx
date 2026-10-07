"use client";

import { createContext, use, useCallback, useRef, useState, type ReactNode } from "react";

type ShowToast = (message: string) => void;

const ToastContext = createContext<ShowToast | null>(null);

const TOAST_DURATION_MS = 8_000;

/**
 * One polite live region for the signed-in area (PLAN §8.2). It lives in the layout, so a message
 * shown just before a navigation is still on screen, and still announced, on the next page.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setMessage("");
  }, []);

  const show = useCallback<ShowToast>(
    (text) => {
      dismiss();
      setMessage(text);
      timer.current = setTimeout(dismiss, TOAST_DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext value={show}>
      {children}
      {/* Always rendered, so screen readers are already watching it when a message arrives. */}
      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center">
        {message ? (
          <div className="pointer-events-auto flex max-w-xl items-center gap-4 rounded-lg border border-status-green-ink bg-status-green px-4 py-3 text-base font-medium text-status-green-ink shadow-lg">
            <p>
              <span aria-hidden="true">✓ </span>
              {message}
            </p>
            <button
              type="button"
              onClick={dismiss}
              className="min-h-11 shrink-0 rounded-md px-3 font-semibold underline underline-offset-4"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>
    </ToastContext>
  );
}

export function useToast(): ShowToast {
  const show = use(ToastContext);
  if (!show) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return show;
}
