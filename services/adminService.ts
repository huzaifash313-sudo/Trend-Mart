/* -------------------------------------------------------------------------- */
/*  TrendMart — Super-Admin Moderation Service                                 */
/*  Customer list + ban management, per-shop drill-down data, and ad pricing   */
/*  plan CRUD. All reads/writes are gated by admin RLS policies on the         */
/*  affected tables (user_profiles, products, orders, ad_plans).               */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import type {
  AdminUserRecord,
  AdPlan,
  AdPlanFormData,
  Product,
  Order,
  PromoAdPlacement,
} from "@/types";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/* ─── User Moderation ─────────────────────────────────────────────────────── */

export async function fetchAdminUsers(opts?: {
  search?: string;
  role?: string;
  bannedOnly?: boolean;
  limit?: number;
}): Promise<ServiceResult<AdminUserRecord[]>> {
  const supabase = createClient();
  const limit = opts?.limit ?? 300;
  try {
    // Profiles (admins can read all via user_profiles_admin_read).
    let profileQuery = supabase
      .from("user_profiles")
      .select("user_id, full_name, phone, is_banned, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts?.bannedOnly) profileQuery = profileQuery.eq("is_banned", true);

    const { data: profiles, error: profilesErr } = await profileQuery;
    if (profilesErr) throw profilesErr;

    // Roles (admins can read all via user_roles_admin_all).
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw rolesErr;
    const roleByUser = new Map<string, string>();
    for (const r of (roles as Array<{ user_id: string; role: string }>) ?? []) {
      roleByUser.set(r.user_id, r.role);
    }

    // Order counts per authenticated customer.
    const { data: orderRows, error: ordersErr } = await supabase
      .from("orders")
      .select("customer_user_id");
    if (ordersErr) throw ordersErr;
    const orderCountByUser = new Map<string, number>();
    for (const o of (orderRows as Array<{ customer_user_id: string | null }>) ?? []) {
      if (o.customer_user_id) {
        orderCountByUser.set(
          o.customer_user_id,
          (orderCountByUser.get(o.customer_user_id) ?? 0) + 1,
        );
      }
    }

    let users: AdminUserRecord[] = ((profiles as Array<Record<string, unknown>>) ?? []).map(
      (p) => ({
        user_id: p.user_id as string,
        full_name: (p.full_name as string) ?? null,
        phone: (p.phone as string) ?? null,
        email: null,
        role: roleByUser.get(p.user_id as string) ?? "customer",
        is_banned: (p.is_banned as boolean) ?? false,
        created_at: (p.created_at as string) ?? null,
        orders_count: orderCountByUser.get(p.user_id as string) ?? 0,
      }),
    );

    if (opts?.search) {
      const q = opts.search.toLowerCase();
      users = users.filter(
        (u) =>
          (u.full_name ?? "").toLowerCase().includes(q) ||
          (u.phone ?? "").toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q) ||
          u.user_id.toLowerCase().includes(q),
      );
    }
    if (opts?.role && opts.role !== "all") {
      users = users.filter((u) => u.role === opts.role);
    }

    return { success: true, data: users };
  } catch (err) {
    logError(err, { module: "adminService.fetchAdminUsers" });
    return { success: false, error: toError(err) };
  }
}

export async function setAdminUserBan(
  userId: string,
  banned: boolean,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("user_profiles")
      .update({ is_banned: banned })
      .eq("user_id", userId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "adminService.setAdminUserBan", meta: { userId, banned } });
    return { success: false, error: toError(err) };
  }
}

/* ─── Per-shop drill-down ─────────────────────────────────────────────────── */

export async function fetchShopProductsForAdmin(
  shopId: string,
): Promise<ServiceResult<Product[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id, shop_id, name, price, original_price, image_url, is_available, stock_status, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return { success: true, data: (data as Product[]) ?? [] };
  } catch (err) {
    logError(err, { module: "adminService.fetchShopProductsForAdmin", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

export async function fetchShopOrdersForAdmin(
  shopId: string,
): Promise<ServiceResult<Order[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { success: true, data: (data as Order[]) ?? [] };
  } catch (err) {
    logError(err, { module: "adminService.fetchShopOrdersForAdmin", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/* ─── Ad pricing plans (admin) ────────────────────────────────────────────── */

export async function fetchAllAdPlansForAdmin(): Promise<ServiceResult<AdPlan[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("ad_plans")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { success: true, data: (data as AdPlan[]) ?? [] };
  } catch (err) {
    logError(err, { module: "adminService.fetchAllAdPlansForAdmin" });
    return { success: false, error: toError(err) };
  }
}

export async function createAdPlan(
  form: AdPlanFormData,
): Promise<ServiceResult<AdPlan>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("ad_plans")
      .insert({
        name: form.name.trim(),
        placement: form.placement,
        duration_days: Math.max(1, parseInt(form.duration_days, 10) || 7),
        price: Math.max(0, Number(form.price) || 0),
        description: form.description.trim() || null,
        is_active: form.is_active,
      })
      .select()
      .single();
    if (error) throw error;
    return { success: true, data: data as AdPlan };
  } catch (err) {
    logError(err, { module: "adminService.createAdPlan" });
    return { success: false, error: toError(err) };
  }
}

export async function updateAdPlan(
  planId: string,
  patch: Partial<AdPlanFormData>,
): Promise<ServiceResult<AdPlan>> {
  const supabase = createClient();
  try {
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name.trim();
    if (patch.placement !== undefined) payload.placement = patch.placement as PromoAdPlacement;
    if (patch.duration_days !== undefined) {
      payload.duration_days = Math.max(1, parseInt(patch.duration_days, 10) || 7);
    }
    if (patch.price !== undefined) payload.price = Math.max(0, Number(patch.price) || 0);
    if (patch.description !== undefined) payload.description = patch.description.trim() || null;
    if (patch.is_active !== undefined) payload.is_active = patch.is_active;

    const { data, error } = await supabase
      .from("ad_plans")
      .update(payload)
      .eq("id", planId)
      .select()
      .single();
    if (error) throw error;
    return { success: true, data: data as AdPlan };
  } catch (err) {
    logError(err, { module: "adminService.updateAdPlan", meta: { planId } });
    return { success: false, error: toError(err) };
  }
}

export async function setAdPlanActive(
  planId: string,
  isActive: boolean,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("ad_plans")
      .update({ is_active: isActive })
      .eq("id", planId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "adminService.setAdPlanActive", meta: { planId, isActive } });
    return { success: false, error: toError(err) };
  }
}

export async function deleteAdPlan(planId: string): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase.from("ad_plans").delete().eq("id", planId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "adminService.deleteAdPlan", meta: { planId } });
    return { success: false, error: toError(err) };
  }
}
