"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { registerQueryClient, invalidateStorefrontData } from "@/lib/cacheBus";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Global React Query Provider                                    */
/*                                                                             */
/*  Server state (shops, products, deals, stories, coupons) is cached here so  */
/*  refetches never blank the UI: stale data is shown while fresh data loads   */
/*  (stale-while-revalidate), eliminating the "data disappears then reappears" */
/*  flicker that came from manual `setLoading(true)` + skeleton swaps.         */
/* -------------------------------------------------------------------------- */

/**
 * Listens for the app's mutation-complete events and invalidates the whole
 * storefront cache. This centralizes cache freshness — any code that finishes
 * a write just dispatches the matching `trendsmart:*` event, and every page's
 * React Query data (shops, products, deals, stories, coupons, shop detail)
 * refetches in the background.
 */
const STOREFRONT_EVENTS = [
  "trendsmart:shops-updated",
  "trendsmart:products-updated",
  "trendsmart:stories-updated",
  "trendsmart:deals-updated",
  "trendsmart:coupons-updated",
] as const;

function StorefrontCacheListener() {
  useEffect(() => {
    const onChange = () => invalidateStorefrontData();
    for (const event of STOREFRONT_EVENTS) {
      window.addEventListener(event, onChange);
    }
    return () => {
      for (const event of STOREFRONT_EVENTS) {
        window.removeEventListener(event, onChange);
      }
    };
  }, []);
  return null;
}

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          // Data is considered fresh for 60s — no refetch on re-mount/nav.
          staleTime: 60_000,
          // Keep unused query data cached for 5 minutes (dedupe + instant back-nav).
          gcTime: 5 * 60_000,
          // Supabase RLS queries are cheap to retry once on transient errors.
          retry: 1,
          // Avoid refetch storms when the user switches tabs/apps.
          refetchOnWindowFocus: false,
        },
        mutations: {
          retry: 0,
        },
      },
    });
    registerQueryClient(qc);
    return qc;
  });

  return (
    <QueryClientProvider client={client}>
      <StorefrontCacheListener />
      {children}
    </QueryClientProvider>
  );
}
