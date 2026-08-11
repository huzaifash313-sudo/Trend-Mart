import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import type { DealScheduleType, ShopDeal } from "@/lib/dealSchedule";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

export interface CreateShopDealInput {
  title: string;
  description?: string;
  schedule_type: DealScheduleType;
  weekdays?: number[];
  starts_on?: string;
  ends_on?: string;
  day_of_month?: number;
}

function parseDeal(row: Record<string, unknown>): ShopDeal {
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
    created_at: String(row.created_at ?? ""),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function createShopDeal(
  shopId: string,
  input: CreateShopDealInput,
): Promise<ServiceResult<ShopDeal>> {
  const supabase = createClient();
  try {
    const title = input.title.trim();
    if (!title) return { success: false, error: "Deal title is required." };

    const payload: Record<string, unknown> = {
      shop_id: shopId,
      title,
      description: input.description?.trim() || null,
      schedule_type: input.schedule_type,
      weekdays: null,
      starts_on: null,
      ends_on: null,
      day_of_month: null,
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

    const { data, error } = await supabase.from("shop_deals").insert(payload).select().single();
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
    const { data, error } = await supabase
      .from("shop_deals")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(500);
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
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("shop_deals")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", dealId)
      .select()
      .single();
    if (error) throw error;
    return { success: true, data: parseDeal(data as Record<string, unknown>) };
  } catch (err) {
    logError(err, { module: "dealService.updateShopDealStatus", meta: { dealId } });
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
