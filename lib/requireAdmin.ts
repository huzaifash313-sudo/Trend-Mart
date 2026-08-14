import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type AdminGate =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403; error: string };

/** Any signed-in user (merchant/customer/admin). */
export async function requireSignedInUser(): Promise<
  { ok: true; user: User } | { ok: false; status: 401; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Sign in required." };
  }
  return { ok: true, user };
}

/**
 * Require a signed-in Super-Admin for server routes that send mail
 * or write with the service-role client.
 */
export async function requireAdminUser(): Promise<AdminGate> {
  const signedIn = await requireSignedInUser();
  if (!signedIn.ok) return signedIn;

  const user = signedIn.user;
  const supabase = await createClient();

  // 1) Authoritative check — SECURITY DEFINER get_my_role() reads the
  //    user_roles table, whose RLS blocks self-promotion to admin.
  const { data: rpcRole } = await supabase.rpc("get_my_role");
  if (rpcRole === "admin") {
    return { ok: true, user };
  }

  // 2) app_metadata.role — written ONLY by the service role, never by the
  //    user. SECURITY: user_metadata.role is user-editable via
  //    supabase.auth.updateUser({ data: { role: "admin" } }), so it must NEVER
  //    confer admin. It is deliberately ignored here.
  const appMetaRole =
    typeof user.app_metadata?.role === "string" ? user.app_metadata.role : "";
  if (appMetaRole === "admin") {
    return { ok: true, user };
  }

  return { ok: false, status: 403, error: "Admin only." };
}
