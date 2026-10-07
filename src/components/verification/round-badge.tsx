/** Marks a recount after a rejection (PLAN §8.2); round 1 needs no badge. */
export function RoundBadge({ round }: { round: number }) {
  if (round <= 1) {
    return null;
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-status-yellow px-2.5 py-0.5 text-sm font-semibold text-status-yellow-ink">
      <span aria-hidden="true">↻ </span>
      Round {round} recount
    </span>
  );
}
