"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { loginSchema } from "@/domain/validation";
import { useSignIn } from "./use-sign-in";

type FieldErrors = { email?: string; password?: string };

function fieldErrorsOf(email: string, password: string): FieldErrors {
  const result = loginSchema.safeParse({ email, password });
  if (result.success) {
    return {};
  }
  const { fieldErrors } = z.flattenError(result.error);
  return { email: fieldErrors.email?.[0], password: fieldErrors.password?.[0] };
}

export function LoginForm() {
  const signIn = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Errors appear after the first submit, then update live as the user corrects them.
  const [showErrors, setShowErrors] = useState(false);
  const errors = showErrors ? fieldErrorsOf(email, password) : {};

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowErrors(true);
    const parsed = loginSchema.safeParse({ email, password });
    if (parsed.success) {
      signIn.mutate(parsed.data);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TextField
        label="Email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={errors.email}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={errors.password}
      />
      {signIn.error ? (
        <p role="alert" className="rounded-md border border-error bg-status-red px-3 py-2 text-sm font-medium text-status-red-ink">
          {signIn.error.message}
        </p>
      ) : null}
      <Button type="submit" disabled={signIn.isPending}>
        {signIn.isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
