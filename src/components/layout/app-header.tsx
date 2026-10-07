import Link from "next/link";
import { ROLE_PROFILES } from "@/domain/roles";
import type { SessionUser } from "@/server/auth/session";
import { LogoutButton } from "./logout-button";
import { RoleSwitcher } from "./role-switcher";

/** Header for every signed-in page. The nav shows only the current role's area (PLAN §8.1). */
export function AppHeader({ user }: { user: SessionUser }) {
  const profile = ROLE_PROFILES[user.role];

  return (
    <header className="border-b border-field-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href={profile.home} className="inline-flex min-h-11 items-center gap-1 text-lg font-semibold text-ink">
          ApparelFlow ERP <span className="font-normal text-ink-muted">· Cutting Gatekeeper</span>
        </Link>
        <nav aria-label="Main">
          <Link
            href={profile.home}
            className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
          >
            {profile.areaName}
          </Link>
        </nav>
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <p className="text-sm text-ink">
            <span className="font-medium">{user.fullName}</span>{" "}
            <span className="ml-1 rounded-full border border-field-border bg-page px-2 py-0.5 text-xs font-semibold text-ink">
              {profile.label}
            </span>
          </p>
          <RoleSwitcher currentRole={user.role} />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
