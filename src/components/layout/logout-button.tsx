"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiFetch, type ApiClientError } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useMutation<void, ApiClientError>({
    mutationFn: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      // Drop every cached response so the next user never sees the previous one's data.
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
  });

  return (
    <Button variant="secondary" disabled={logout.isPending} onClick={() => logout.mutate()}>
      {logout.isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
