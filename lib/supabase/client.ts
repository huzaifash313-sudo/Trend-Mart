"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Publishable Supabase configuration.
 *
 * These are public anon/publishable keys — safe to include in client bundles.
 * We hardcode them here because Turbopack (Next.js 16 dev bundler) may not
 * always inline NEXT_PUBLIC_* variables from .env.local into the client bundle.
 *
 * For production, override via NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * in .env.local or your hosting platform's environment variables.
 */
const SUPABASE_URL =
  process.env["NEXT_PUBLIC_SUPABASE_URL"] ||
  "https://olbxprailtqjbxmkrbhe.supabase.co";

const SUPABASE_ANON_KEY =
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ||
  "sb_publishable_oqHUrSoDggpaZUBpsGQ9hg_daavN2NK";

export function createClient() {
  const client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // Global fetch configuration for the Supabase browser client.
    // The `realtime` subsystem is not needed on the homepage and can
    // cause hanging WebSocket connections if the project is paused.
    realtime: {
      params: {
        eventsPerSecond: 1,
      },
    },
  });

  return client;
}
