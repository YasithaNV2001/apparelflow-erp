import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DemoCredentialPanel } from "@/components/auth/demo-credential-panel";
import { LoginForm } from "@/components/auth/login-form";
import { ROLE_PROFILES } from "@/domain/roles";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "Sign in · ApparelFlow ERP",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(ROLE_PROFILES[user.role].home);
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-ink">ApparelFlow ERP · Cutting Gatekeeper</h1>
        <p className="text-lg text-ink-muted">Sign in to continue.</p>
      </header>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section
          aria-labelledby="sign-in-heading"
          className="flex flex-col gap-4 rounded-lg border border-field-border bg-surface p-6"
        >
          <h2 id="sign-in-heading" className="text-xl font-semibold text-ink">
            Sign in
          </h2>
          <LoginForm />
        </section>
        <DemoCredentialPanel />
      </div>
    </main>
  );
}
