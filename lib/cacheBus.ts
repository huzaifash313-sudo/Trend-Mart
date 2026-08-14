"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Storefront cache invalidation bus                              */
/*                                                                             */
/*  Mutations live in `services/*` and are called directly from components,     */
/*  NOT through React Query mutations — so nothing invalidates the cached       */
/*  storefront queries after a write. This module gives those call sites a      */
/*  single fire-and-forget entry point that invalidates every public query.     */
/* -------------------------------------------------------------------------- */

import type { QueryClient } from "@tanstack/react-query";

let queryClient: QueryClient | null = null;

/** Register the app-wide QueryClient (called once from QueryProvider). */
export function registerQueryClient(client: QueryClient): void {
  queryClient = client;
}

/**
 * Invalidate every storefront query that depends on mutable marketplace data.
 * Prefix matching covers the parameterized keys (deals, marketplace products,
 * shop detail, coupons, delivery meta) automatically.
 */
export function invalidateStorefrontData(): void {
  if (!queryClient) return;
  queryClient.invalidateQueries({ queryKey: ["shops"] });
  queryClient.invalidateQueries({ queryKey: ["stories"] });
  queryClient.invalidateQueries({ queryKey: ["deals"] });
  queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
  queryClient.invalidateQueries({ queryKey: ["shop-detail"] });
  queryClient.invalidateQueries({ queryKey: ["coupons"] });
  queryClient.invalidateQueries({ queryKey: ["delivery-meta"] });
  queryClient.invalidateQueries({ queryKey: ["my-shop"] });
}

/**
 * Invalidate a single query by its full/prefix key. Use for narrow refetches
 * (e.g. just the current shop's detail after saving settings).
 */
export function invalidateQuery(queryKey: readonly unknown[]): void {
  if (!queryClient) return;
  queryClient.invalidateQueries({ queryKey });
}
