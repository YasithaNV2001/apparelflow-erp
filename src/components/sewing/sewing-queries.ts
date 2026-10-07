"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetch, type ApiClientError } from "@/lib/api-client";
import type { SewingOrderDto } from "@/lib/api-types";

/** Invalidating `all` reloads both lists, so a started batch moves from the queue to the line. */
export const sewingKeys = {
  all: ["sewing"] as const,
  queue: ["sewing", "queue"] as const,
  inProgress: ["sewing", "in-progress"] as const,
};

/** Verifiers approve batches while the sewing supervisor watches, so both lists poll as well (PLAN §8.2). */
const SEWING_REFRESH_MS = 15_000;

export function useSewingQueue(): UseQueryResult<SewingOrderDto[], ApiClientError> {
  return useQuery<SewingOrderDto[], ApiClientError>({
    queryKey: sewingKeys.queue,
    queryFn: async () => (await apiFetch<{ orders: SewingOrderDto[] }>("/api/sewing/queue")).orders,
    refetchInterval: SEWING_REFRESH_MS,
  });
}

export function useAssemblyLine(): UseQueryResult<SewingOrderDto[], ApiClientError> {
  return useQuery<SewingOrderDto[], ApiClientError>({
    queryKey: sewingKeys.inProgress,
    queryFn: async () => (await apiFetch<{ orders: SewingOrderDto[] }>("/api/sewing/in-progress")).orders,
    refetchInterval: SEWING_REFRESH_MS,
  });
}

/**
 * "Start Sewing Assembly". Both lists reload afterwards, also after a refusal: a 409 means someone
 * else already started the batch, and the lists should show that.
 */
export function useStartSewing(): UseMutationResult<SewingOrderDto, ApiClientError, number> {
  const queryClient = useQueryClient();
  return useMutation<SewingOrderDto, ApiClientError, number>({
    mutationFn: async (orderId) =>
      (await apiFetch<{ order: SewingOrderDto }>(`/api/orders/${orderId}/start-sewing`, { method: "POST" }))
        .order,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sewingKeys.all }),
  });
}
