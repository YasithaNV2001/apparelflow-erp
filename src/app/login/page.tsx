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
    <>
      {/* The same navy band as the signed-in app bar, so the first screen already looks like the app. */}
      <header className="bg-brand text-on-brand">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-10 sm:px-6">
          <h1 className="text-3xl font-semibold">ApparelFlow ERP · Cutting Gatekeeper</h1>
          <p className="text-lg text-on-brand-muted">Sign in to continue.</p>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <section
            aria-labelledby="sign-in-heading"
            className="flex flex-col gap-4 rounded-lg border border-field-border bg-surface shadow-sm p-6"
          >
            <h2 id="sign-in-heading" className="text-xl font-semibold text-ink">
              Sign in
            </h2>
            <LoginForm />
          </section>
          <DemoCredentialPanel />
        </div>
      </main>
    </>
  );
}
