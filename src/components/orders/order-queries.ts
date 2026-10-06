"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { NewOrderPayload } from "@/domain/order-form";
import { apiFetch, type ApiClientError } from "@/lib/api-client";
import type { OrderDto, OrderListItemDto, RecipeDto } from "@/lib/api-types";

/** Cache keys: invalidating ["orders"] refreshes the list and every order detail at once. */
export const orderKeys = {
  all: ["orders"] as const,
  detail: (orderId: number) => ["orders", orderId] as const,
};

const recipeKeys = { all: ["recipes"] as const };

export function useOrders(): UseQueryResult<OrderListItemDto[], ApiClientError> {
  return useQuery<OrderListItemDto[], ApiClientError>({
    queryKey: orderKeys.all,
    queryFn: async () => (await apiFetch<{ orders: OrderListItemDto[] }>("/api/orders")).orders,
  });
}

export function useOrder(orderId: number): UseQueryResult<OrderDto, ApiClientError> {
  return useQuery<OrderDto, ApiClientError>({
    queryKey: orderKeys.detail(orderId),
    queryFn: async () => (await apiFetch<{ order: OrderDto }>(`/api/orders/${orderId}`)).order,
  });
}

export function useRecipes(): UseQueryResult<RecipeDto[], ApiClientError> {
  return useQuery<RecipeDto[], ApiClientError>({
    queryKey: recipeKeys.all,
    queryFn: async () => (await apiFetch<{ recipes: RecipeDto[] }>("/api/recipes")).recipes,
    // Recipes are seeded and read-only (D23), so one fetch per visit is enough.
    staleTime: Infinity,
  });
}

export interface CreateOrderVariables extends NewOrderPayload {
  submitForVerification: boolean;
}

export function useCreateOrder(): UseMutationResult<OrderDto, ApiClientError, CreateOrderVariables> {
  const queryClient = useQueryClient();
  return useMutation<OrderDto, ApiClientError, CreateOrderVariables>({
    mutationFn: async (variables) =>
      (await apiFetch<{ order: OrderDto }>("/api/orders", { method: "POST", body: variables })).order,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export interface SubmitOrderVariables {
  orderId: number;
  /** Only sent when the supervisor corrected the fabric used. */
  actualFabricYds?: number;
}

export function useSubmitOrder(): UseMutationResult<OrderDto, ApiClientError, SubmitOrderVariables> {
  const queryClient = useQueryClient();
  return useMutation<OrderDto, ApiClientError, SubmitOrderVariables>({
    mutationFn: async ({ orderId, actualFabricYds }) =>
      (
        await apiFetch<{ order: OrderDto }>(`/api/orders/${orderId}/submit`, {
          method: "POST",
          body: actualFabricYds === undefined ? {} : { actualFabricYds },
        })
      ).order,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

/** Field messages from a 400 VALIDATION_ERROR, so server-side rejections show under the right input. */
export function serverFieldErrors(error: ApiClientError | null): Record<string, string> {
  if (!error || error.code !== "VALIDATION_ERROR") {
    return {};
  }
  const fields = (error.details as { fields?: Record<string, string[] | undefined> } | undefined)?.fields;
  const messages: Record<string, string> = {};
  for (const [name, fieldMessages] of Object.entries(fields ?? {})) {
    if (fieldMessages?.[0]) {
      messages[name] = fieldMessages[0];
    }
  }
  return messages;
}
