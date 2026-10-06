import type { ComponentStatus } from "@/domain/constants";
import { formatSigned } from "@/lib/format";

const PILL_STYLES: Record<ComponentStatus, { icon: string; className: string }> = {
  GREEN: { icon: "✓", className: "bg-status-green text-status-green-ink" },
  YELLOW: { icon: "▲", className: "bg-status-yellow text-status-yellow-ink" },
  RED: { icon: "▼", className: "bg-status-red text-status-red-ink" },
  UNCOUNTED: { icon: "○", className: "bg-status-uncounted text-status-uncounted-ink" },
};

function pillText(status: ComponentStatus, variance: number | null): string {
  switch (status) {
    case "GREEN":
      return "MATCH";
    case "YELLOW":
      return `EXCESS ${formatSigned(variance ?? 0)}`;
    case "RED":
      return `SHORT ${formatSigned(variance ?? 0)}`;
    case "UNCOUNTED":
      return "NOT COUNTED";
  }
}

/** One component's traffic light (PLAN §5.4): ✓ MATCH, ▲ EXCESS +n, ▼ SHORT −n, ○ NOT COUNTED. */
export function ComponentStatusPill({
  status,
  variance,
}: {
  status: ComponentStatus;
  variance: number | null;
}) {
  const style = PILL_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold ${style.className}`}
    >
      <span aria-hidden="true">{style.icon}</span>
      {pillText(status, variance)}
    </span>
  );
}
