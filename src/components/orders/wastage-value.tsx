import { formatPercent } from "@/lib/format";

/**
 * Wastage %, plus a warning badge when it exceeds the recipe's cap. The badge only warns;
 * it never blocks approval (D13).
 */
export function WastageValue({
  wastagePct,
  wastageCap,
  exceedsCap,
}: {
  wastagePct: number;
  wastageCap: number;
  exceedsCap: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="tabular-nums">{formatPercent(wastagePct)}</span>
      {exceedsCap ? (
        <span className="whitespace-nowrap rounded-full bg-status-yellow px-2 py-0.5 text-xs font-semibold text-status-yellow-ink">
          <span aria-hidden="true">⚠︎ </span>
          Over {formatPercent(wastageCap)} cap
        </span>
      ) : null}
    </span>
  );
}
