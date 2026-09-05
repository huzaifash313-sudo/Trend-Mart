"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Client-side admin role check used by the /admin/* page gates
 * (dashboard, support, audit-logs).
 *
 * WHY A FALLBACK:
 *   The /admin pages gate on a direct SELECT of the caller's public.user_roles
 *   row. That table's RLS policies have historically contained a recursive
 *   policy (a policy reading user_roles without the SECURITY DEFINER helper),
 *   which made the direct query fail with:
 *     "infinite recursion detected in policy for relation 'user_roles'"
 *   When the query errors, the old inline gate treated the caller as a
 *   non-admin and bounced them off /admin/* to /dashboard.
 *
 *   get_my_role() is SECURITY DEFINER (runs as the table owner, bypasses RLS),
 *   so it is immune to that recursion and is the authoritative role source.
 *   It is only consulted when the fast direct read disagrees or errors, so a
 *   real non-admin (customer/merchant) is still redirected exactly as before.
 */
export type ClientAdminStatus = "anon" | "admin" | "non-admin";

export async function resolveClientAdminStatus(): Promise<ClientAdminStatus> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "anon";

  // Fast path — direct read of the caller's own role row.
  const { data: roleRow, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!error && roleRow?.role === "admin") return "admin";
  if (!error && roleRow && roleRow.role !== "admin") return "non-admin";

  // Direct read failed (RLS recursion, transient error) or returned nothing —
  // fall back to the authoritative SECURITY DEFINER RPC.
  const { data: rpcRole } = await supabase.rpc("get_my_role");
  return rpcRole === "admin" ? "admin" : "non-admin";
}
