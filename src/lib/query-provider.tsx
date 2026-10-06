"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/** One TanStack Query client per browser tab, shared by every client component (PLAN §4.1). */
export function QueryProvider({ children }: { children: ReactNode }) {
  // useState keeps the same client across re-renders instead of creating a new cache each time.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: true },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
