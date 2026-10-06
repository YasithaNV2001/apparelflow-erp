// Display formatting for the UI. Values stay numbers everywhere else; only the screen sees text.

const MINUS_SIGN = "−";
const DECIMALS = 2;

const DATE_TIME = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** A real minus sign reads better than a hyphen in tables of numbers. */
function withMinusSign(text: string): string {
  return text.replace("-", MINUS_SIGN);
}

export function formatYards(value: number): string {
  return `${value.toFixed(DECIMALS)} yd`;
}

export function formatPercent(value: number): string {
  return withMinusSign(`${value.toFixed(DECIMALS)}%`);
}

/** Variance with an explicit sign: +4 excess, −4 short, 0 exact. */
export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : withMinusSign(String(value));
}

/** Rendered in the browser only, so it shows the viewer's local time. */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
