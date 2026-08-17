import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Validate that a required environment variable is present in the
 * server runtime.  Throws with a clear diagnostic message so a
 * missing variable is caught early rather than causing a hanging
 * Supabase connection.
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[TrendMart Server] Missing required configuration (${key}). ` +
      `Please complete the platform setup.`,
    );
  }
  return value;
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    },
  );
}
