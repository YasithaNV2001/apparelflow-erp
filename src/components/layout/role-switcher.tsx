"use client";

import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import { useSignIn } from "@/components/auth/use-sign-in";
import { Button } from "@/components/ui/button";
import type { Role } from "@/domain/constants";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/domain/demo-accounts";
import { ROLE_PROFILES } from "@/domain/roles";

/**
 * Switches persona by really signing in as that demo account; no passwordless backdoor (D22).
 * Choosing a role only selects it and the Switch button signs in: a select that signed in on
 * change would switch keyboard users to the next role on their first arrow key (WCAG 3.2.2).
 */
export function RoleSwitcher({ currentRole }: { currentRole: Role }) {
  const signIn = useSignIn();
  const [selectedRole, setSelectedRole] = useState<Role>(currentRole);
  const selectId = useId();
  const errorId = `${selectId}-error`;

  function handleSelect(event: ChangeEvent<HTMLSelectElement>) {
    const account = DEMO_ACCOUNTS.find((candidate) => candidate.role === event.target.value);
    if (account) {
      setSelectedRole(account.role);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const account = DEMO_ACCOUNTS.find((candidate) => candidate.role === selectedRole);
    if (account) {
      signIn.mutate({ email: account.email, password: DEMO_PASSWORD });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      {/* Sits in the navy app bar, so its own text uses the light on-brand colours. */}
      <label htmlFor={selectId} className="text-sm font-medium text-on-brand">
        Switch role
      </label>
      <select
        id={selectId}
        value={selectedRole}
        onChange={handleSelect}
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
      <Button type="submit" variant="secondary" disabled={signIn.isPending || selectedRole === currentRole}>
        {signIn.isPending ? "Switching…" : "Switch"}
      </Button>
      {signIn.error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-on-brand-error">
          {signIn.error.message}
        </p>
      ) : null}
    </form>
  );
}
