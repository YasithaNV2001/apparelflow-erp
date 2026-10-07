import Link from "next/link";
import type { Role } from "@/domain/constants";
import { ROLE_PROFILES } from "@/domain/roles";

/**
 * Shown when a signed-in user opens another role's page (PLAN §8.1). The page renders this
 * instead of its content; the API refuses the data with 403 regardless (invariant 1).
 */
export function ForbiddenPanel({ role }: { role: Role }) {
  const profile = ROLE_PROFILES[role];

  return (
    <section
      aria-labelledby="forbidden-heading"
      className="mx-auto flex max-w-xl flex-col gap-3 rounded-lg border border-field-border bg-surface p-6"
    >
      <h1 id="forbidden-heading" className="text-2xl font-semibold text-ink">
        403 — not available for your role
      </h1>
      <p className="text-ink-muted">
        You are signed in as a {profile.label}. This page belongs to a different role.
      </p>
      <Link
        href={profile.home}
        className="inline-flex min-h-11 w-fit items-center font-medium text-primary underline underline-offset-4"
      >
        Go to {profile.areaName}
      </Link>
    </section>
  );
}
