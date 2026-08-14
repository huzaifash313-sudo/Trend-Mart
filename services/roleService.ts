/* -------------------------------------------------------------------------- */
/*  TrendMart — Role Service                                                   */
/*  Provides role lookup utilities for middleware, server components,          */
/*  and client-side RBAC checks.                                              */
/* -------------------------------------------------------------------------- */

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

// ─── Role Types ─────────────────────────────────────────────────────────────

export type AppRole = "customer" | "merchant" | "admin";

export const ROLE_HIERARCHY: Record<AppRole, number> = {
  customer: 0,
  merchant: 1,
  admin: 2,
};

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  updated_at: string;
}

// ─── Server-side Role Fetch ─────────────────────────────────────────────────

/**
 * Fetch the role for the currently authenticated user from the server.
 * Returns null if user is not authenticated or role not found.
 */
export async function getUserRole(): Promise<AppRole | null> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return null;

    const { data: rpcRole, error: rpcError } = await supabase.rpc("get_my_role");
    if (
      !rpcError &&
      typeof rpcRole === "string" &&
      ["customer", "merchant", "admin"].includes(rpcRole)
    ) {
      return rpcRole as AppRole;
    }

    // SECURITY: app_metadata.role is service-role-only. user_metadata.role is
    // user-editable and must NEVER confer admin/merchant — deliberately ignored.
    const appMeta =
      typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;
    if (appMeta === "customer" || appMeta === "merchant" || appMeta === "admin") {
      return appMeta;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if the current user has at least the required role level.
 * Uses role hierarchy: customer < merchant < admin
 */
export async function hasMinRole(minimumRole: AppRole): Promise<boolean> {
  const role = await getUserRole();
  if (!role) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Fetch the user's role and associated shop IDs (if merchant).
 * Returns both the role and the list of shop IDs they own.
 */
export async function getUserRoleAndShopIds(): Promise<{
  role: AppRole | null;
  shopIds: string[];
  userId: string | null;
}> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { role: null, shopIds: [], userId: null };
    }

    // Fetch role via RPC first (avoids recursive RLS 500 on user_roles)
    const { data: rpcRole } = await supabase.rpc("get_my_role");
    let role: AppRole = "customer";
    if (typeof rpcRole === "string" && ["customer", "merchant", "admin"].includes(rpcRole)) {
      role = rpcRole as AppRole;
    } else {
      // SECURITY: only app_metadata (service-role) may confer a role here.
      const appMeta =
        typeof user.app_metadata?.role === "string" ? user.app_metadata.role : "";
      if (appMeta === "customer" || appMeta === "merchant" || appMeta === "admin") {
        role = appMeta;
      } else {
        // Fallback: shop ownership implies merchant.
        const { data: owned } = await supabase
          .from("shops")
          .select("id")
          .eq("owner_id", user.id)
          .limit(1)
          .maybeSingle();
        role = owned?.id ? "merchant" : "customer";
      }
    }

    // Fetch owned shop IDs: admin sees all shops, merchant only their own.
    let shopIds: string[] = [];
    if (role === "admin") {
      const { data: allShops } = await supabase.from("shops").select("id");
      shopIds = (allShops ?? []).map((s: { id: string }) => s.id);
    } else if (role === "merchant") {
      const { data: shops } = await supabase
        .from("shops")
        .select("id")
        .eq("owner_id", user.id);
      shopIds = (shops ?? []).map((s: { id: string }) => s.id);
    }

    return { role, shopIds, userId: user.id };
  } catch {
    return { role: null, shopIds: [], userId: null };
  }
}

// ─── Client-side Role Hook (to be used in components) ───────────────────────

/**
 * Fetch the current user's role from the browser client.
 * Suitable for use in "use client" components and hooks.
 */
export async function getClientUserRole(): Promise<AppRole | null> {
  try {
    const supabase = createBrowserClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return null;

    const { data: rpcRole, error: rpcError } = await supabase.rpc("get_my_role");
    if (
      !rpcError &&
      typeof rpcRole === "string" &&
      ["customer", "merchant", "admin"].includes(rpcRole)
    ) {
      return rpcRole as AppRole;
    }

    // SECURITY: app_metadata.role only — never user-editable user_metadata.
    const appMeta =
      typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;
    if (appMeta === "customer" || appMeta === "merchant" || appMeta === "admin") {
      return appMeta;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Route Access Definitions ──────────────────────────────────────────────

/**
 * Route segments grouped by minimum required role.
 * - public:     Anyone can access (no auth required)
 * - customer:   Must be authenticated (any role)
 * - merchant:   Must be a merchant or admin
 * - admin:      Must be an admin
 */
export const ROLE_ROUTE_MAP = {
  public: [
    "/",
    "/search",
    "/shop/",
    "/login",
    "/signup",
    "/auth",
    "/auth/callback",
    "/api/health",
  ],
  customer: [
    "/orders",
    "/wishlist",
    "/auth/settings",
  ],
  merchant: [
    "/dashboard",
    "/dashboard/products",
    "/shop/manage",
  ],
  admin: [
    "/admin",
    "/admin/users",
    "/admin/shops",
  ],
} as const;

/**
 * Determine the minimum required role for a given pathname.
 */
export function getRequiredRole(pathname: string): AppRole | "public" {
  if (ROLE_ROUTE_MAP.admin.some((route) => pathname.startsWith(route))) return "admin";
  if (ROLE_ROUTE_MAP.merchant.some((route) => pathname.startsWith(route))) return "merchant";
  if (ROLE_ROUTE_MAP.customer.some((route) => pathname.startsWith(route))) return "customer";
  return "public";
}

/**
 * Verify a route is accessible by the given role.
 */
export function canAccessRoute(role: AppRole | null, pathname: string): boolean {
  const required = getRequiredRole(pathname);
  if (required === "public") return true;
  if (!role) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[required];
}