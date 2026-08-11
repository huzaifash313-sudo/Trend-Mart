import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { normalizeDealGallery } from "@/lib/productImages";
import type { DealScheduleType, ShopDeal } from "@/lib/dealSchedule";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

const DEAL_CORE =
  "id, shop_id, title, description, schedule_type, weekdays, starts_on, ends_on, day_of_month, is_active, image_url, images, badge_text, is_featured, product_id, price, original_price, created_at, updated_at";

const PRODUCT_JOIN =
  "products:product_id ( id, name, image_url, images, price, original_price )";

const DEAL_LIST_SELECT = `${DEAL_CORE}, shops:shop_id ( name, logo_url, slug, whatsapp_number ), ${PRODUCT_JOIN}`;

const DEAL_SELECT_FALLBACK = `*, shops:shop_id ( name, logo_url, slug, whatsapp_number ), ${PRODUCT_JOIN}`;

export interface CreateShopDealInput {
  title: string;
  description?: string;
  schedule_type: DealScheduleType;
  weekdays?: number[];
  starts_on?: string;
  ends_on?: string;
  day_of_month?: number;
  image_url?: string | null;
  images?: string[] | null;
  badge_text?: string | null;
  is_featured?: boolean;
  product_id?: string | null;
  price?: number | null;
  original_price?: number | null;
}

export interface UpdateShopDealInput {
  title?: string;
  description?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  badge_text?: string | null;
  is_featured?: boolean;
  is_active?: boolean;
  product_id?: string | null;
  price?: number | null;
  original_price?: number | null;
}

function parseImages(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const urls = raw.filter((u): u is string => typeof u === "string" && !!u.trim());
  return urls.length ? urls : [];
}

function parseMoney(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseDeal(row: Record<string, unknown>): ShopDeal {
  const shops = row.shops as Record<string, unknown> | null | undefined;
  const product = row.products as Record<string, unknown> | null | undefined;
  const dealImages = parseImages(row.images);
  const productImages = product ? parseImages(product.images) : null;
  const cover =
    (row.image_url as string | null)?.trim() ||
    dealImages?.[0] ||
    (product?.image_url as string | null)?.trim() ||
    productImages?.[0] ||
    null;
  const gallery =
    (dealImages && dealImages.length > 0 ? dealImages : null) ??
    (productImages && productImages.length > 0 ? productImages : null) ??
    (cover ? [cover] : []);

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
    image_url: cover,
    images: gallery,
    badge_text: (row.badge_text as string | null) ?? null,
    is_featured: row.is_featured === true,
    product_id: row.product_id ? String(row.product_id) : null,
    price: parseMoney(row.price) ?? (product ? parseMoney(product.price) : null),
    original_price:
      parseMoney(row.original_price) ?? (product ? parseMoney(product.original_price) : null),
    created_at: String(row.created_at ?? ""),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    shop_name: shops ? String(shops.name ?? "") || null : null,
    shop_logo_url: shops ? ((shops.logo_url as string | null) ?? null) : null,
    shop_slug: shops ? ((shops.slug as string | null) ?? null) : null,
    shop_whatsapp: shops ? ((shops.whatsapp_number as string | null) ?? null) : null,
  };
}

function applyGalleryFields(
  payload: Record<string, unknown>,
  image_url?: string | null,
  images?: string[] | null,
) {
  const urls = [
    ...(Array.isArray(images) ? images : []),
    ...(image_url ? [image_url] : []),
  ];
  const gallery = normalizeDealGallery(urls);
  payload.image_url = gallery.image_url || null;
  payload.images = gallery.images;
}

function applyCommerceFields(
  payload: Record<string, unknown>,
  input: { product_id?: string | null; price?: number | null; original_price?: number | null },
) {
  if (input.product_id !== undefined) {
    payload.product_id = input.product_id?.trim() || null;
  }
  if (input.price !== undefined) {
    const p = input.price == null ? null : Number(input.price);
    payload.price = p != null && Number.isFinite(p) && p >= 0 ? p : null;
  }
  if (input.original_price !== undefined) {
    const o = input.original_price == null ? null : Number(input.original_price);
    payload.original_price = o != null && Number.isFinite(o) && o >= 0 ? o : null;
  }
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
    badge_text: input.badge_text?.trim() || null,
    is_featured: input.is_featured === true,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  applyGalleryFields(payload, input.image_url, input.images);
  applyCommerceFields(payload, input);

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

function stripOptionalColumns(payload: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next = { ...payload };
  for (const k of keys) delete next[k];
  return next;
}

function isOptionalColumnError(message: string): boolean {
  return /image_url|badge_text|is_featured|images|product_id|original_price|products|column .* does not exist|PGRST204|Could not find/i.test(
    message,
  );
}

export async function createShopDeal(
  shopId: string,
  input: CreateShopDealInput,
): Promise<ServiceResult<ShopDeal>> {
  const supabase = createClient();
  try {
    const built = buildSchedulePayload(input);
    if (!built.success) return built;

    const payload: Record<string, unknown> = { ...built.data, shop_id: shopId };

    let { data, error } = await supabase
      .from("shop_deals")
      .insert(payload)
      .select(DEAL_LIST_SELECT)
      .single();

    // Progressive strip for older DBs missing commerce / visual columns
    if (error && isOptionalColumnError(error.message)) {
      const attempts = [
        stripOptionalColumns(payload, ["product_id", "price", "original_price"]),
        stripOptionalColumns(payload, ["product_id", "price", "original_price", "images"]),
        stripOptionalColumns(payload, [
          "product_id",
          "price",
          "original_price",
          "images",
          "image_url",
          "badge_text",
          "is_featured",
        ]),
      ];
      for (const attempt of attempts) {
        const retry = await supabase
          .from("shop_deals")
          .insert(attempt)
          .select(DEAL_SELECT_FALLBACK)
          .single();
        data = retry.data;
        error = retry.error;
        if (!error) break;
      }
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
    const withProduct = `${DEAL_CORE}, ${PRODUCT_JOIN}`;
    let { data, error } = await supabase
      .from("shop_deals")
      .select(withProduct)
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (error && isOptionalColumnError(error.message)) {
      const retry = await supabase
        .from("shop_deals")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false });
      data = retry.data;
      error = retry.error;
    }

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

export async function fetchActiveDeals(limit = 100): Promise<ServiceResult<ShopDeal[]>> {
  const supabase = createClient();
  const cap = Math.min(Math.max(limit, 12), 160);
  try {
    let { data, error } = await supabase
      .from("shop_deals")
      .select(DEAL_LIST_SELECT)
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(cap);

    if (error && isOptionalColumnError(error.message)) {
      const withShops = await supabase
        .from("shop_deals")
        .select(
          "*, shops:shop_id ( name, logo_url, slug, whatsapp_number )",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(cap);
      if (!withShops.error) {
        data = withShops.data;
        error = null;
      } else {
        const fallback = await supabase
          .from("shop_deals")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(cap);
        data = fallback.data;
        error = fallback.error;
      }
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

export async function fetchFeaturedDeals(limit = 24): Promise<ServiceResult<ShopDeal[]>> {
  const supabase = createClient();
  try {
    let { data, error } = await supabase
      .from("shop_deals")
      .select(DEAL_LIST_SELECT)
      .eq("is_active", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error && /is_featured|images|product_id|shops/i.test(error.message)) {
      const all = await fetchActiveDeals(Math.max(limit * 2, 48));
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
    let { data, error } = await supabase
      .from("shop_deals")
      .select(DEAL_CORE)
      .in("shop_id", shopIds)
      .eq("is_active", true);

    if (error && isOptionalColumnError(error.message)) {
      const retry = await supabase
        .from("shop_deals")
        .select("*")
        .in("shop_id", shopIds)
        .eq("is_active", true);
      data = retry.data;
      error = retry.error;
    }

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
    if (patch.badge_text !== undefined) payload.badge_text = patch.badge_text?.trim() || null;
    if (patch.is_featured !== undefined) payload.is_featured = patch.is_featured;
    if (patch.is_active !== undefined) payload.is_active = patch.is_active;
    if (patch.image_url !== undefined || patch.images !== undefined) {
      applyGalleryFields(payload, patch.image_url, patch.images);
    }
    applyCommerceFields(payload, patch);

    let { data, error } = await supabase
      .from("shop_deals")
      .update(payload)
      .eq("id", dealId)
      .select("*")
      .single();

    if (error && isOptionalColumnError(error.message)) {
      const stripped = stripOptionalColumns(payload, [
        "product_id",
        "price",
        "original_price",
        "images",
        "image_url",
        "badge_text",
        "is_featured",
      ]);
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
