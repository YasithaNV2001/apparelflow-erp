import { useId, type InputHTMLAttributes, type ReactNode } from "react";

type TextFieldSize = "default" | "large";

const SIZE_CLASSES: Record<TextFieldSize, string> = {
  default: "min-h-11 text-base",
  // Count boxes at the QC station: big digits and a large touch target (PLAN §8.4).
  large: "min-h-14 text-2xl font-semibold tabular-nums",
};

interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "size" | "aria-invalid" | "aria-describedby"> {
  /** Visible label; extra words for screen readers can go in an sr-only span. */
  label: ReactNode;
  hint?: string;
  error?: string;
  size?: TextFieldSize;
}

/**
 * A labelled text input with an optional hint and an inline error that screen readers announce
 * with the field (PLAN §8.3: visible labels, aria-invalid, aria-describedby).
 */
export function TextField({ label, hint, error, size = "default", className = "", ...inputProps }: TextFieldProps) {
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
        className={`rounded-md px-3 aria-invalid:border-2 aria-invalid:border-error ${SIZE_CLASSES[size]} ${className}`}
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
