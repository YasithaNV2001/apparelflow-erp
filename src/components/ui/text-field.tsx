import { useId, type InputHTMLAttributes } from "react";

interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "aria-invalid" | "aria-describedby"> {
  label: string;
  hint?: string;
  error?: string;
}

/**
 * A labelled text input with an optional hint and an inline error that screen readers announce
 * with the field (PLAN §8.3: visible labels, aria-invalid, aria-describedby).
 */
export function TextField({ label, hint, error, className = "", ...inputProps }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`min-h-11 rounded-md px-3 text-base aria-invalid:border-2 aria-invalid:border-error ${className}`}
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
