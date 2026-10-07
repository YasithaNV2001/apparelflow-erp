"use client";

import { Button } from "@/components/ui/button";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/domain/demo-accounts";
import { ROLE_PROFILES } from "@/domain/roles";
import { useSignIn } from "./use-sign-in";

/** One card per role with its public demo credentials and a one-click real login (PLAN §8.1, D22). */
export function DemoCredentialPanel() {
  const signIn = useSignIn();
  const pendingEmail = signIn.isPending ? signIn.variables?.email : undefined;

  return (
    <section aria-labelledby="demo-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="demo-heading" className="text-xl font-semibold text-ink">
          Demo accounts
        </h2>
        <p className="text-ink-muted">
          Each card signs in with real credentials. All three share the password shown.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-3">
        {DEMO_ACCOUNTS.map((account) => {
          const profile = ROLE_PROFILES[account.role];
          return (
            <li key={account.role} className="flex flex-col gap-3 rounded-lg border border-field-border bg-surface shadow-sm p-4">
              <h3 className="font-semibold text-ink">{profile.label}</h3>
              <p className="text-sm text-ink-muted">{profile.duty}</p>
              <dl className="text-sm text-ink">
                <dt className="font-medium">Email</dt>
                <dd className="break-all font-mono">{account.email}</dd>
                <dt className="mt-1 font-medium">Password</dt>
                <dd className="font-mono">{DEMO_PASSWORD}</dd>
              </dl>
              <Button
                className="mt-auto"
                disabled={signIn.isPending}
                onClick={() => signIn.mutate({ email: account.email, password: DEMO_PASSWORD })}
              >
                {pendingEmail === account.email ? "Signing in…" : `Sign in as ${profile.label}`}
              </Button>
            </li>
          );
        })}
      </ul>
      {signIn.error ? (
        <p role="alert" className="rounded-md border border-error bg-status-red px-3 py-2 text-sm font-medium text-status-red-ink">
          {signIn.error.message}
        </p>
      ) : null}
    </section>
  );
}
