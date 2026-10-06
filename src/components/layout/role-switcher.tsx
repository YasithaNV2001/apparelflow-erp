"use client";

import { useId, type ChangeEvent } from "react";
import { useSignIn } from "@/components/auth/use-sign-in";
import type { Role } from "@/domain/constants";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/domain/demo-accounts";
import { ROLE_PROFILES } from "@/domain/roles";

/** Switches persona by really signing in as that demo account; no passwordless backdoor (D22). */
export function RoleSwitcher({ currentRole }: { currentRole: Role }) {
  const signIn = useSignIn();
  const selectId = useId();
  const errorId = `${selectId}-error`;

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const account = DEMO_ACCOUNTS.find((candidate) => candidate.role === event.target.value);
    if (account) {
      signIn.mutate({ email: account.email, password: DEMO_PASSWORD });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={selectId} className="text-sm font-medium text-ink">
        Switch role
      </label>
      <select
        id={selectId}
        value={currentRole}
        onChange={handleChange}
        disabled={signIn.isPending}
        aria-describedby={signIn.error ? errorId : undefined}
        className="min-h-11 rounded-md px-2 text-base"
      >
        {DEMO_ACCOUNTS.map((account) => (
          <option key={account.role} value={account.role}>
            {ROLE_PROFILES[account.role].label}
          </option>
        ))}
      </select>
      {signIn.error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-error">
          {signIn.error.message}
        </p>
      ) : null}
    </div>
  );
}
