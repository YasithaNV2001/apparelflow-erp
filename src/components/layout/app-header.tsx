import Link from "next/link";
import { ROLE_PROFILES } from "@/domain/roles";
import type { SessionUser } from "@/server/auth/session";
import { LogoutButton } from "./logout-button";
import { RoleSwitcher } from "./role-switcher";

/**
 * Header for every signed-in page: a navy app bar that frames the light content area. The nav
 * shows only the current role's area (PLAN §8.1). Focus rings inside the bar switch to light blue,
 * because the usual blue ring would be too faint against navy.
 */
export function AppHeader({ user }: { user: SessionUser }) {
  const profile = ROLE_PROFILES[user.role];

  return (
    <header className="bg-brand text-on-brand [--color-focus:var(--color-on-brand-link)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href={profile.home} className="inline-flex min-h-11 items-center gap-1 text-lg font-semibold text-on-brand">
          ApparelFlow ERP <span className="font-normal text-on-brand-muted">· Cutting Gatekeeper</span>
        </Link>
        <nav aria-label="Main">
          <Link
            href={profile.home}
            className="inline-flex min-h-11 items-center font-medium text-on-brand-link underline underline-offset-4"
          >
            {profile.areaName}
          </Link>
        </nav>
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <p className="text-sm text-on-brand">
            <span className="font-medium">{user.fullName}</span>{" "}
            <span className="ml-1 rounded-full bg-page px-2 py-0.5 text-xs font-semibold text-ink">
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
