import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import type { DealScheduleType, ShopDeal } from "@/lib/dealSchedule";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

const DEAL_SELECT =
  "*, shops:shop_id ( name, logo_url, slug )";

export interface CreateShopDealInput {
  title: string;
  description?: string;
  schedule_type: DealScheduleType;
  weekdays?: number[];
  starts_on?: string;
  ends_on?: string;
  day_of_month?: number;
  image_url?: string | null;
  badge_text?: string | null;
  is_featured?: boolean;
}

export interface UpdateShopDealInput {
  title?: string;
  description?: string | null;
  image_url?: string | null;
  badge_text?: string | null;
  is_featured?: boolean;
  is_active?: boolean;
}

function parseDeal(row: Record<string, unknown>): ShopDeal {
  const shops = row.shops as Record<string, unknown> | null | undefined;
  return {
    id: String(row.id),
    shop_id: String(row.shop_id),
    title: String(row.title ?? ""),
    description: (row.description as string | null) ?? null,
    schedule_type: row.schedule_type as DealScheduleType,
    weekdays: Array.isArray(row.weekdays)
      ? (row.weekdays as number[]).map((n) => Number(n))
      : null,
    starts_on: (row.starts_on as string | null) ?? null,
    ends_on: (row.ends_on as string | null) ?? null,
    day_of_month: row.day_of_month == null ? null : Number(row.day_of_month),
    is_active: row.is_active !== false,
    image_url: (row.image_url as string | null) ?? null,
    badge_text: (row.badge_text as string | null) ?? null,
    is_featured: row.is_featured === true,
    created_at: String(row.created_at ?? ""),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    shop_name: shops ? String(shops.name ?? "") || null : null,
    shop_logo_url: shops ? ((shops.logo_url as string | null) ?? null) : null,
    shop_slug: shops ? ((shops.slug as string | null) ?? null) : null,
  };
}

function buildSchedulePayload(
  input: CreateShopDealInput,
): ServiceResult<Record<string, unknown>> {
  const title = input.title.trim();
  if (!title) return { success: false, error: "Deal title is required." };

  const payload: Record<string, unknown> = {
    title,
    description: input.description?.trim() || null,
    schedule_type: input.schedule_type,
    weekdays: null,
    starts_on: null,
    ends_on: null,
    day_of_month: null,
    image_url: input.image_url?.trim() || null,
    badge_text: input.badge_text?.trim() || null,
    is_featured: input.is_featured === true,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  if (input.schedule_type === "weekly") {
    const days = [...new Set((input.weekdays ?? []).filter((d) => d >= 0 && d <= 6))];
    if (!days.length) return { success: false, error: "Pick at least one weekday." };
    payload.weekdays = days;
  } else if (input.schedule_type === "date_range") {
    if (!input.starts_on || !input.ends_on) {
      return { success: false, error: "Start and end dates are required." };
    }
    if (input.starts_on > input.ends_on) {
      return { success: false, error: "End date must be after start date." };
    }
    payload.starts_on = input.starts_on.slice(0, 10);
    payload.ends_on = input.ends_on.slice(0, 10);
  } else if (input.schedule_type === "monthly") {
    const dom = Number(input.day_of_month);
    if (!Number.isFinite(dom) || dom < 1 || dom > 31) {
      return { success: false, error: "Pick a day of the month (1–31)." };
    }
    payload.day_of_month = dom;
  }

  return { success: true, data: payload };
}

export async function createShopDeal(
  shopId: string,
  input: CreateShopDealInput,
): Promise<ServiceResult<ShopDeal>> {
  const supabase = createClient();
  try {
    const built = buildSchedulePayload(input);
    if (!built.success) return built;

    const payload = { ...built.data, shop_id: shopId };

    let { data, error } = await supabase
      .from("shop_deals")
      .insert(payload)
      .select(DEAL_SELECT)
      .single();

    // Older DBs without visual columns — retry stripped.
    if (error && /image_url|badge_text|is_featured/i.test(error.message)) {
      const stripped: Record<string, unknown> = { ...payload };
      delete stripped.image_url;
      delete stripped.badge_text;
      delete stripped.is_featured;
      const retry = await supabase.from("shop_deals").insert(stripped).select("*").single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    return { success: true, data: parseDeal(data as Record<string, unknown>) };
  } catch (err) {
    logError(err, { module: "dealService.createShopDeal", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

export async function fetchDealsByShopId(shopId: string): Promise<ServiceResult<ShopDeal[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("shop_deals")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return {
      success: true,
      data: ((data as Record<string, unknown>[]) ?? []).map(parseDeal),
    };
  } catch (err) {
    logError(err, { module: "dealService.fetchDealsByShopId", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

export async function fetchActiveDeals(): Promise<ServiceResult<ShopDeal[]>> {
  const supabase = createClient();
  try {
    let { data, error } = await supabase
      .from("shop_deals")
      .select(DEAL_SELECT)
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (error && /is_featured|image_url|badge_text|shops/i.test(error.message)) {
      const fallback = await supabase
        .from("shop_deals")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(500);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;
    return {
      success: true,
      data: ((data as Record<string, unknown>[]) ?? []).map(parseDeal),
    };
  } catch (err) {
    logError(err, { module: "dealService.fetchActiveDeals" });
    return { success: false, error: toError(err) };
  }
}

/** Featured active deals for For You / homepage strip (still schedule-filtered by caller). */
export async function fetchFeaturedDeals(limit = 24): Promise<ServiceResult<ShopDeal[]>> {
  const supabase = createClient();
  try {
    let { data, error } = await supabase
      .from("shop_deals")
      .select(DEAL_SELECT)
      .eq("is_active", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error && /is_featured|shops/i.test(error.message)) {
      const all = await fetchActiveDeals();
      if (!all.success) return all;
      return {
        success: true,
        data: all.data.filter((d) => d.is_featured).slice(0, limit),
      };
    }

    if (error) throw error;
    return {
      success: true,
      data: ((data as Record<string, unknown>[]) ?? []).map(parseDeal),
    };
  } catch (err) {
    logError(err, { module: "dealService.fetchFeaturedDeals" });
    return { success: false, error: toError(err) };
  }
}

export async function fetchActiveDealsForShops(
  shopIds: string[],
): Promise<ServiceResult<Record<string, ShopDeal[]>>> {
  if (!shopIds.length) return { success: true, data: {} };
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("shop_deals")
      .select("*")
      .in("shop_id", shopIds)
      .eq("is_active", true);
    if (error) throw error;
    const map: Record<string, ShopDeal[]> = {};
    for (const row of (data as Record<string, unknown>[]) ?? []) {
      const deal = parseDeal(row);
      if (!map[deal.shop_id]) map[deal.shop_id] = [];
      map[deal.shop_id].push(deal);
    }
    return { success: true, data: map };
  } catch (err) {
    logError(err, { module: "dealService.fetchActiveDealsForShops" });
    return { success: false, error: toError(err) };
  }
}

export async function updateShopDealStatus(
  dealId: string,
  isActive: boolean,
): Promise<ServiceResult<ShopDeal>> {
  return updateShopDeal(dealId, { is_active: isActive });
}

export async function updateShopDeal(
  dealId: string,
  patch: UpdateShopDealInput,
): Promise<ServiceResult<ShopDeal>> {
  const supabase = createClient();
  try {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.title !== undefined) payload.title = patch.title.trim();
    if (patch.description !== undefined) payload.description = patch.description?.trim() || null;
    if (patch.image_url !== undefined) payload.image_url = patch.image_url?.trim() || null;
    if (patch.badge_text !== undefined) payload.badge_text = patch.badge_text?.trim() || null;
    if (patch.is_featured !== undefined) payload.is_featured = patch.is_featured;
    if (patch.is_active !== undefined) payload.is_active = patch.is_active;

    let { data, error } = await supabase
      .from("shop_deals")
      .update(payload)
      .eq("id", dealId)
      .select("*")
      .single();

    if (error && /image_url|badge_text|is_featured/i.test(error.message)) {
      const stripped: Record<string, unknown> = { ...payload };
      delete stripped.image_url;
      delete stripped.badge_text;
      delete stripped.is_featured;
      const retry = await supabase
        .from("shop_deals")
        .update(stripped)
        .eq("id", dealId)
        .select("*")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    return { success: true, data: parseDeal(data as Record<string, unknown>) };
  } catch (err) {
    logError(err, { module: "dealService.updateShopDeal", meta: { dealId } });
    return { success: false, error: toError(err) };
  }
}

export async function deleteShopDeal(dealId: string): Promise<ServiceResult<true>> {
  const supabase = createClient();
  try {
    const { error } = await supabase.from("shop_deals").delete().eq("id", dealId);
    if (error) throw error;
    return { success: true, data: true };
  } catch (err) {
    logError(err, { module: "dealService.deleteShopDeal", meta: { dealId } });
    return { success: false, error: toError(err) };
  }
}
