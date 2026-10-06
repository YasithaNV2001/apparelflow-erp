"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { orderKeys } from "@/components/orders/order-queries";
import type { ApproveOrderInput, RejectOrderInput, SaveCountsInput } from "@/domain/validation";
import { apiFetch, type ApiClientError } from "@/lib/api-client";
import type { OrderDto, OrderListItemDto } from "@/lib/api-types";

export const verificationKeys = {
  queue: ["verification-queue"] as const,
};

/** New batches arrive while the verifier works, so the queue polls as well as refetching on focus (PLAN §8.2). */
const QUEUE_REFRESH_MS = 15_000;

export function useVerificationQueue(): UseQueryResult<OrderListItemDto[], ApiClientError> {
  return useQuery<OrderListItemDto[], ApiClientError>({
    queryKey: verificationKeys.queue,
    queryFn: async () =>
      (await apiFetch<{ orders: OrderListItemDto[] }>("/api/verification/queue")).orders,
    refetchInterval: QUEUE_REFRESH_MS,
  });
}

export interface SaveCountsVariables extends SaveCountsInput {
  orderId: number;
}

/** Autosave. The server's answer replaces the cached order: its statuses are the authoritative ones. */
export function useSaveCounts(): UseMutationResult<OrderDto, ApiClientError, SaveCountsVariables> {
  const queryClient = useQueryClient();
  return useMutation<OrderDto, ApiClientError, SaveCountsVariables>({
    mutationFn: async ({ orderId, items }) =>
      (await apiFetch<{ order: OrderDto }>(`/api/orders/${orderId}/counts`, { method: "PUT", body: { items } }))
        .order,
    onSuccess: (order) => queryClient.setQueryData(orderKeys.detail(order.id), order),
  });
}

export interface ApproveVariables extends ApproveOrderInput {
  orderId: number;
}

export function useApproveOrder(): UseMutationResult<OrderDto, ApiClientError, ApproveVariables> {
  return useDecision<ApproveVariables>("approve");
}

export interface RejectVariables extends RejectOrderInput {
  orderId: number;
}

export function useRejectOrder(): UseMutationResult<OrderDto, ApiClientError, RejectVariables> {
  return useDecision<RejectVariables>("reject");
}

function useDecision<V extends { orderId: number }>(
  action: "approve" | "reject",
): UseMutationResult<OrderDto, ApiClientError, V> {
  const queryClient = useQueryClient();
  return useMutation<OrderDto, ApiClientError, V>({
    mutationFn: async ({ orderId, ...body }) =>
      (await apiFetch<{ order: OrderDto }>(`/api/orders/${orderId}/${action}`, { method: "POST", body })).order,
    onSuccess: (order) => {
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      return queryClient.invalidateQueries({ queryKey: verificationKeys.queue });
    },
  });
}
