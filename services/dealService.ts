import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { normalizeDealGallery } from "@/lib/productImages";
import type { DealScheduleType, ShopDeal } from "@/lib/dealSchedule";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type PostgrestLikeError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
} | null;

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

function errText(error: PostgrestLikeError): string {
  if (!error) return "";
  return [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ");
}

/** Base schedule columns that every shop_deals table should have. */
const DEAL_BASE =
  "id, shop_id, title, description, schedule_type, weekdays, starts_on, ends_on, day_of_month, is_active, created_at, updated_at";

const DEAL_VISUAL = "image_url, images, badge_text, is_featured";
const DEAL_COMMERCE = "product_id, price, original_price";

const PRODUCT_JOIN =
  "products:product_id ( id, name, image_url, images, price, original_price )";

const SHOP_JOIN = "shops:shop_id ( name, logo_url, slug, whatsapp_number )";

/** Progressive selects — first match that works is cached for this tab session. */
const LIST_SELECT_ATTEMPTS = [
  `${DEAL_BASE}, ${DEAL_VISUAL}, ${DEAL_COMMERCE}, ${SHOP_JOIN}, ${PRODUCT_JOIN}`,
  `${DEAL_BASE}, ${DEAL_VISUAL}, ${DEAL_COMMERCE}, ${SHOP_JOIN}`,
  `${DEAL_BASE}, ${DEAL_VISUAL}, ${SHOP_JOIN}`,
  `${DEAL_BASE}, image_url, badge_text, is_featured, ${SHOP_JOIN}`,
  `${DEAL_BASE}, ${SHOP_JOIN}`,
  `*, ${SHOP_JOIN}`,
  "*",
] as const;

const SHOP_SELECT_ATTEMPTS = [
  `${DEAL_BASE}, ${DEAL_VISUAL}, ${DEAL_COMMERCE}, ${PRODUCT_JOIN}`,
  `${DEAL_BASE}, ${DEAL_VISUAL}, ${DEAL_COMMERCE}`,
  `${DEAL_BASE}, ${DEAL_VISUAL}`,
  `${DEAL_BASE}, image_url, badge_text, is_featured`,
  DEAL_BASE,
  "*",
] as const;

let cachedListSelect: string | null = null;
let cachedShopSelect: string | null = null;

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

function isSchemaMismatch(error: PostgrestLikeError): boolean {
  const t = errText(error);
  if (!t) return false;
  return /image_url|badge_text|is_featured|images|product_id|original_price|\bprice\b|products|column .* does not exist|PGRST204|PGRST200|PGRST201|Could not find|schema cache|42703/i.test(
    t,
  );
}

async function selectWithFallback(
  attempts: readonly string[],
  cache: { get: () => string | null; set: (s: string | null) => void },
  run: (select: string) => Promise<{ data: unknown; error: PostgrestLikeError }>,
): Promise<{ data: unknown; error: PostgrestLikeError }> {
  const preferred = cache.get();
  const ordered = preferred
    ? [preferred, ...attempts.filter((s) => s !== preferred)]
    : [...attempts];

  let lastError: PostgrestLikeError = null;
  for (const select of ordered) {
    const result = await run(select);
    if (!result.error) {
      cache.set(select);
      return result;
    }
    lastError = result.error;
    // Cached shape went stale (schema changed) — drop it and keep trying
    if (preferred && select === preferred) cache.set(null);
  }
  return { data: null, error: lastError };
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

    const attempts = [
      payload,
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

    let data: unknown = null;
    let error: PostgrestLikeError = null;

    for (const attempt of attempts) {
      const insert = await supabase.from("shop_deals").insert(attempt).select("*").maybeSingle();
      data = insert.data;
      error = insert.error;
      if (!error && data) break;
      if (error && !isSchemaMismatch(error)) break;
    }

    if (error) throw error;
    if (!data) return { success: false, error: "Deal was not created." };
    return { success: true, data: parseDeal(data as Record<string, unknown>) };
  } catch (err) {
    logError(err, { module: "dealService.createShopDeal", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

export async function fetchDealsByShopId(shopId: string): Promise<ServiceResult<ShopDeal[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await selectWithFallback(
      SHOP_SELECT_ATTEMPTS,
      {
        get: () => cachedShopSelect,
        set: (s) => {
          cachedShopSelect = s;
        },
      },
      async (select) => {
        const res = await supabase
          .from("shop_deals")
          .select(select)
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false });
        return { data: res.data, error: res.error };
      },
    );

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
    const { data, error } = await selectWithFallback(
      LIST_SELECT_ATTEMPTS,
      {
        get: () => cachedListSelect,
        set: (s) => {
          cachedListSelect = s;
        },
      },
      async (select) => {
        // Prefer featured first when column exists; fall back without that order.
        const withFeatured = await supabase
          .from("shop_deals")
          .select(select)
          .eq("is_active", true)
          .order("is_featured", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(cap);

        if (
          withFeatured.error &&
          /is_featured/i.test(errText(withFeatured.error))
        ) {
          const plain = await supabase
            .from("shop_deals")
            .select(select)
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(cap);
          return { data: plain.data, error: plain.error };
        }

        return { data: withFeatured.data, error: withFeatured.error };
      },
    );

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
  try {
    const all = await fetchActiveDeals(Math.max(limit * 3, 48));
    if (!all.success) return all;
    const featured = all.data.filter((d) => d.is_featured);
    const pool = featured.length ? featured : all.data;
    return { success: true, data: pool.slice(0, limit) };
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
    const { data, error } = await selectWithFallback(
      SHOP_SELECT_ATTEMPTS,
      {
        get: () => cachedShopSelect,
        set: (s) => {
          cachedShopSelect = s;
        },
      },
      async (select) => {
        const res = await supabase
          .from("shop_deals")
          .select(select)
          .in("shop_id", shopIds)
          .eq("is_active", true);
        return { data: res.data, error: res.error };
      },
    );

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

    const stripLadder = [
      payload,
      stripOptionalColumns(payload, ["product_id", "price", "original_price"]),
      stripOptionalColumns(payload, ["product_id", "price", "original_price", "images"]),
      stripOptionalColumns(payload, [
        "product_id",
        "price",
        "original_price",
        "images",
        "image_url",
        "badge_text",
      ]),
      // Last resort: only is_active / title / description / updated_at
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

    let data: unknown = null;
    let error: PostgrestLikeError = null;

    for (const attempt of stripLadder) {
      const keys = Object.keys(attempt).filter((k) => k !== "updated_at");
      if (keys.length === 0) continue;

      const res = await supabase
        .from("shop_deals")
        .update(attempt)
        .eq("id", dealId)
        .select("*")
        .maybeSingle();

      data = res.data;
      error = res.error;

      if (!error && data) break;

      if (!error && !data) {
        // Update may have applied but RETURNING was empty (RLS) — re-fetch
        const refetch = await supabase.from("shop_deals").select("*").eq("id", dealId).maybeSingle();
        if (refetch.data) {
          data = refetch.data;
          error = null;
          break;
        }
        // Still empty — likely RLS; stop retrying strips
        error = {
          message:
            "Update blocked by database permissions. Run supabase/FIX_SHOP_DEALS_SCHEMA.sql",
        };
        break;
      }

      if (error && !isSchemaMismatch(error)) break;
    }

    if (error) throw error;
    if (!data) {
      return {
        success: false,
        error: "Could not update deal (check merchant RLS / run FIX_SHOP_DEALS_SCHEMA.sql).",
      };
    }
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
