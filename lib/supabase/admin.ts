import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Service-Role Admin Client                                     */
/*                                                                             */
/*  SERVER-ONLY, NEVER import from a "use client" file or expose to the       */
/*  browser bundle. Bypasses Row Level Security — use only for narrowly       */
/*  scoped, trusted server operations (e.g. looking up a user's email for a   */
/*  transactional notification triggered by a verified admin action).        */
/* -------------------------------------------------------------------------- */

let cachedAdminClient: ReturnType<typeof createSupabaseClient> | null = null;

/**
 * Returns a service-role Supabase client, or `null` if SUPABASE_SERVICE_ROLE_KEY
 * isn't configured. Callers must treat a `null` return as "feature unavailable"
 * rather than throwing, so the app degrades gracefully without this secret.
 */
export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  if (!cachedAdminClient) {
    cachedAdminClient = createSupabaseClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cachedAdminClient;
}

/**
 * Look up a user's email address by their auth user ID using the admin API.
 * Returns `null` if the admin client isn't configured or the user isn't found.
 */
export async function getUserEmailById(userId: string): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) return null;
    return data.user.email ?? null;
  } catch {
    return null;
  }
}
