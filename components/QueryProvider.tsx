"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Global React Query Provider                                    */
/*                                                                             */
/*  Server state (shops, products, deals, stories, coupons) is cached here so  */
/*  refetches never blank the UI: stale data is shown while fresh data loads   */
/*  (stale-while-revalidate), eliminating the "data disappears then reappears" */
/*  flicker that came from manual `setLoading(true)` + skeleton swaps.         */
/* -------------------------------------------------------------------------- */

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
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
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
