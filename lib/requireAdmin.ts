import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type AdminGate =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Require a signed-in Super-Admin for server routes that send mail
 * or write with the service-role client.
 */
export async function requireAdminUser(): Promise<AdminGate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Sign in required." };
  }

  const VALID = new Set(["admin"]);
  const { data: rpcRole } = await supabase.rpc("get_my_role");
  if (typeof rpcRole === "string" && VALID.has(rpcRole)) {
    return { ok: true, user };
  }

  const meta =
    (typeof user.app_metadata?.role === "string" && user.app_metadata.role) ||
    (typeof user.user_metadata?.role === "string" && user.user_metadata.role) ||
    "";
  if (meta === "admin") {
    return { ok: true, user };
  }

  return { ok: false, status: 403, error: "Admin only." };
}
