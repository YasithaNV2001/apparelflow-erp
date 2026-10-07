import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white enabled:hover:bg-primary-hover",
  secondary: "border border-field-border bg-surface text-ink enabled:hover:bg-page",
  danger: "bg-danger text-white enabled:hover:bg-danger-hover",
};

/** Button styling for anything that should look like one, such as a link that starts a task. */
export function buttonClasses(variant: ButtonVariant = "primary"): string {
  return `inline-flex min-h-11 items-center justify-center rounded-md px-4 text-base font-semibold disabled:border-transparent disabled:bg-disabled disabled:text-disabled-ink ${VARIANT_CLASSES[variant]}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** Shared button: 44 px touch target, contrast-checked colours, a visibly disabled state (PLAN §8.3). */
export function Button({ variant = "primary", type = "button", className = "", ...props }: ButtonProps) {
  return <button type={type} className={`${buttonClasses(variant)} ${className}`} {...props} />;
}
