import { createClient } from "@supabase/supabase-js";

/**
 * Safely retrieve a required environment variable.
 * Gracefully returns an empty string if the variable is missing,
 * which prevents Supabase from hanging — the client will throw
 * a clear error on first query instead of creating a silently-broken
 * connection pool.
 */
function getEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    if (typeof window === "undefined") {
      // Server-side: warn so logs capture the missing var
      console.warn(
        `[TrendsMart] Environment variable ${key} is missing or empty. ` +
        `Supabase queries will fail with a clear error until it is set.`,
      );
    }
    return "";
  }
  return value;
}

const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

/**
 * Module-level Supabase client instance.
 *
 * ⚠️  Prefer using `createClient()` from `@/lib/supabase/client` (browser)
 * or `@/lib/supabase/server` (server) which provide proper cookie
 * handling and session management.
 *
 * This export exists primarily for backward compatibility with scripts
 * and utilities that need a simple one-off client.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // Avoid creating local storage entries in non-browser contexts
  },
});
