"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { Role } from "@/domain/constants";
import { ROLE_PROFILES } from "@/domain/roles";
import { apiFetch, type ApiClientError } from "@/lib/api-client";

export interface Credentials {
  email: string;
  password: string;
}

interface SignInResponse {
  user: { id: number; email: string; fullName: string; role: Role };
}

/**
 * A real login through POST /api/auth/login (D22), then a move to the role's home page.
 * Used by the login form, the demo panel and the role switcher alike.
 */
export function useSignIn(): UseMutationResult<SignInResponse, ApiClientError, Credentials> {
  const router = useRouter();
  return useMutation<SignInResponse, ApiClientError, Credentials>({
    mutationFn: (credentials) =>
      apiFetch<SignInResponse>("/api/auth/login", { method: "POST", body: credentials }),
    onSuccess: ({ user }) => {
      router.replace(ROLE_PROFILES[user.role].home);
      // Server components (header, guards) re-render with the new session cookie.
      router.refresh();
    },
  });
}
