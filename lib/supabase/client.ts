"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Publishable Supabase configuration.
 *
 * These are public anon/publishable keys — safe to include in client bundles.
 * They are inlined at build time by Next.js from NEXT_PUBLIC_* env vars.
 *
 * SECURITY: we deliberately do NOT hardcode a fallback project. A hardcoded
 * fallback would silently target a fixed Supabase project whenever env vars are
 * missing, masking configuration errors and sending data to the wrong tenant.
 * Failing fast with a clear error is the correct behaviour.
 */
const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const SUPABASE_ANON_KEY = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Returns a shared browser Supabase client instance.
 *
 * Memoized at module scope (not per-call) because many client components
 * call `createClient()` directly in their render body and then put the
 * result in a `useEffect`/`useCallback` dependency array. A fresh client
 * object on every call would give that dependency a new reference on every
 * render, re-triggering the effect/callback in a loop.
 */
export function createClient() {
  if (browserClient) return browserClient;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "TrendsMart is not fully configured yet. Please try again shortly.",
    );
  }

  browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // Global fetch configuration for the Supabase browser client.
    // The `realtime` subsystem is not needed on the homepage and can
    // cause hanging WebSocket connections if the project is paused.
    realtime: {
      params: {
        eventsPerSecond: 1,
      },
    },
  });

  return browserClient;
}
