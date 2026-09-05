/* -------------------------------------------------------------------------- */
/*  TrendsMart — Shop Service Layer                                            */
/*  All shop-related Supabase operations in one place.                         */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { Shop, Product, ShopFormData } from "@/types";
import { logError, toErrorMessage, toServiceError } from "@/services/errorService";
import { isValidLatitude, isValidLongitude } from "@/lib/geoCoords";
import { normalizePkPhoneDigits } from "@/lib/sanitization";
import {
  generateShopSlug,
  isUuid,
  slugifyShopName,
} from "@/lib/shopSlug";
import { SHOP_STOREFRONT_PRODUCT_LIMIT } from "@/lib/mobilePerf";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return toServiceError(err);
}

function isMissingColumnError(err: unknown): boolean {
  // Inspect the RAW PostgREST error — toServiceError() rewrites missing-column
  // errors into a friendly message that would never match these patterns.
  const msg = toErrorMessage(err);
  return /column .* does not exist|PGRST204|schema cache|Could not find/i.test(msg);
}

/**
 * Columns that older Supabase projects may not have yet.
 * Order matters for the persist fallback: drop least-critical first so a
 * single missing column never wipes location / bio / hours / fees.
 */
const SHOP_EXTENDED_KEYS = [
  "sensitive_info_updated_at",
  "slug",
  "accent_color",
  "announcement_expires_at",
  "announcement",
  "emergency_available",
  "hourly_rate",
  "call_out_charge",
  "shop_type",
  "service_area",
  "tiktok_handle",
  "instagram_handle",
  "facebook_url",
  "secondary_phone",
  "accepts_pickup",
  "accepts_delivery",
    "delivery_fee_per_km",
    "delivery_fee_flat",
    "free_delivery_threshold",
    "free_delivery_radius_km",
    "free_delivery_areas",
    "min_order_amount",
    "delivery_zones",
    "address_display",
    "service_radius_km",
    "latitude",
    "longitude",
    "store_bio",
    "business_hours",
    "operating_status",
] as const;

/** Persist offer end time; empty / invalid → null (no countdown). */
function sanitizeAnnouncementExpires(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

/** Pull the missing column name from PostgREST / Postgres errors. */
function missingColumnFromError(err: unknown): string | null {
  const msg = toErrorMessage(err);
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" of relation/i,
    /column "([^"]+)" does not exist/i,
  ];
  for (const re of patterns) {
    const match = msg.match(re);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Insert or update a shop row. If the live schema is missing a column, omit
 * only that column and retry — never drop every extra field at once.
 * `slug` is written in a second pass so a missing slug column cannot fail
 * name / location / fees / pin.
 */
async function persistShopRow(
  action: "insert" | "update",
  payload: Record<string, unknown>,
  shopId?: string,
): Promise<{ data: Shop; error: null } | { data: null; error: unknown }> {
  const supabase = createClient();
  const body: Record<string, unknown> = { ...payload };
  const slug =
    typeof body.slug === "string" && body.slug.trim() ? String(body.slug).trim() : null;
  delete body.slug;
  delete body.id;
  delete body.created_at;
  delete body.updated_at;
  delete body.avg_rating;
  delete body.review_count;
  delete body.subscription_tier;
  delete body.stories_quota;
  delete body.pro_expires_at;
  if (action === "update") {
    delete body.owner_id;
    delete body.verification_status;
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const result =
      action === "insert"
        ? await supabase.from("shops").insert(body).select().single()
        : await supabase.from("shops").update(body).eq("id", shopId!).select().single();

    if (!result.error && result.data) {
      const saved = result.data as Shop;
      if (!slug || !saved.id) return { data: saved, error: null };
      const slugged = await supabase
        .from("shops")
        .update({ slug })
        .eq("id", saved.id)
        .select()
        .single();
      if (!slugged.error && slugged.data) return { data: slugged.data as Shop, error: null };
      if (slugged.error && !isMissingColumnError(slugged.error)) {
        logError(slugged.error, {
          module: "shopService.persistShopRow.slug",
          meta: { shopId: saved.id },
        });
      }
      return { data: saved, error: null };
    }

    lastError = result.error;
    if (!result.error || !isMissingColumnError(result.error)) {
      return { data: null, error: result.error };
    }

    const missing = missingColumnFromError(result.error);
    if (missing && Object.prototype.hasOwnProperty.call(body, missing)) {
      delete body[missing];
      continue;
    }

    const extra = SHOP_EXTENDED_KEYS.find((key) => key in body);
    if (extra) {
      delete body[extra];
      continue;
    }
    break;
  }

  return { data: null, error: lastError };
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Public Queries                                                             */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Fetch all shops, ordered alphabetically.
 * Category filtering and search are applied client-side for responsiveness,
 * but you can also pass `category` to filter server-side.
 */
export async function fetchShops(opts?: {
  category?: string;
  search?: string;
  /**
   * When true, restricts results to storefronts that are actually
   * discoverable by customers (`is_live = true AND verification_status =
   * 'approved'`). Use this for any customer-facing listing (homepage,
   * search). Omit/false for merchant dashboard and admin contexts, which
   * need to see a shop regardless of its live/approval state.
   */
  publicOnly?: boolean;
  /** Cap rows for customer listings (homepage). Omit for full admin lists. */
  limit?: number;
  /** 0-based row offset for page-based / infinite scroll. */
  offset?: number;
}): Promise<ServiceResult<Shop[]>> {
  const supabase = createClient();

  // `owner_id` is the merchant's internal auth user id — it must never reach
  // the public storefront payload. Merchant dashboards (which pass no
  // `publicOnly`) still need it to filter their own shops client-side.
  const includeOwnerId = !opts?.publicOnly;

  const SHOP_LIST_SELECT = [
    "id",
    "name",
    "slug",
    "category",
    "location",
    "logo_url",
    "banner_url",
    "is_live",
    "verification_status",
    "latitude",
    "longitude",
    "service_radius_km",
    "delivery_zones",
    "address_display",
    "free_delivery_threshold",
    "free_delivery_radius_km",
    "delivery_fee_flat",
    "delivery_fee_per_km",
    "free_delivery_areas",
    "min_order_amount",
    "avg_rating",
    "review_count",
    "announcement",
    "announcement_expires_at",
    "whatsapp_number",
    ...(includeOwnerId ? ["owner_id" as const] : []),
    "created_at",
  ].join(", ");

  /** Strip `owner_id` from rows when they were fetched for a public list. */
  const redactOwnerId = (rows: unknown): Shop[] =>
    ((rows as Shop[]) ?? []).map((shop) =>
      includeOwnerId
        ? shop
        : (Object.fromEntries(
            Object.entries(shop).filter(([key]) => key !== "owner_id"),
          ) as Shop),
    );

  try {
    let query = supabase.from("shops").select(SHOP_LIST_SELECT);

    if (opts?.publicOnly) {
      query = query.eq("is_live", true).eq("verification_status", "approved");
    }

    if (opts?.category && opts.category !== "All") {
      query = query.eq("category", opts.category);
    }

    if (opts?.search) {
      const safe = opts.search.replace(/[%_,.()']/g, " ").trim();
      if (safe) {
        const pattern = `%${safe}%`;
        query = query.or(
          `name.ilike.${pattern},category.ilike.${pattern}`,
        );
      }
    }

    query = query.order("name", { ascending: true });

    const limit =
      opts?.limit && opts.limit > 0 ? Math.min(opts.limit, 500) : undefined;
    const offset =
      opts?.offset && opts.offset > 0 ? Math.max(0, Math.floor(opts.offset)) : 0;

    if (limit !== undefined) {
      if (offset > 0) {
        query = query.range(offset, offset + limit - 1);
      } else {
        query = query.limit(limit);
      }
    }

    const { data, error } = await query;

    if (error && isMissingColumnError(error)) {
      // Older schemas — fall back to * without crashing the homepage.
      let fallback = supabase.from("shops").select("*");
      if (opts?.publicOnly) {
        fallback = fallback.eq("is_live", true).eq("verification_status", "approved");
      }
      if (opts?.category && opts.category !== "All") {
        fallback = fallback.eq("category", opts.category);
      }
      fallback = fallback.order("name", { ascending: true });
      if (limit !== undefined) {
        if (offset > 0) {
          fallback = fallback.range(offset, offset + limit - 1);
        } else {
          fallback = fallback.limit(limit);
        }
      }
      const retry = await fallback;
      if (retry.error) throw retry.error;
      return { success: true, data: redactOwnerId(retry.data) };
    }

    if (error) throw error;
    return { success: true, data: redactOwnerId(data) };
  } catch (err) {
    logError(err, { module: "shopService.fetchShops", meta: { opts } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Fetch a single shop by its UUID, including all of its products.
 */
export async function fetchShopById(
  id: string,
): Promise<ServiceResult<{ shop: Shop; products: Product[] }>> {
  const supabase = createClient();

  try {
    let shop: Shop | null = null;

    if (isUuid(id)) {
      // Public storefronts are only visible when live + approved. The UUID
      // path previously skipped these filters (only the slug path enforced
      // them), which let pending / suspended / offline shops leak their full
      // record (owner_id, whatsapp, addresses) to anyone who had the UUID.
      const { data, error: shopError } = await supabase
        .from("shops")
        .select("*")
        .eq("id", id)
        .eq("is_live", true)
        .eq("verification_status", "approved")
        .maybeSingle();

      if (shopError) throw shopError;
      shop = (data as Shop | null) ?? null;

      // Owner fallback: the store owner may still open their own storefront
      // (paused / suspended) to manage it, but it stays hidden from everyone
      // else.
      if (!shop) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: owned, error: ownerError } = await supabase
            .from("shops")
            .select("*")
            .eq("id", id)
            .eq("owner_id", user.id)
            .maybeSingle();
          if (ownerError) throw ownerError;
          shop = (owned as Shop | null) ?? null;
        }
      }
    } else {
      const slug = decodeURIComponent(id).trim().toLowerCase();

      // Prefer a real `shops.slug` column when present.
      let { data, error: slugError } = await supabase
        .from("shops")
        .select("*")
        .eq("slug", slug)
        .eq("is_live", true)
        .eq("verification_status", "approved")
        .maybeSingle();

      if (slugError && isMissingColumnError(slugError)) {
        ({ data, error: slugError } = await supabase
          .from("shops")
          .select("*")
          .eq("slug", slug)
          .eq("is_live", true)
          .maybeSingle());
      }

      if (slugError && !isMissingColumnError(slugError)) throw slugError;
      shop = (data as Shop | null) ?? null;

      if (!shop) {
        // Older schemas have no slug column. Resolve generated slugs from live,
        // approved shops client-side as a compatibility path.
        let { data: shops, error: shopsError } = await supabase
          .from("shops")
          .select("*")
          .eq("is_live", true)
          .eq("verification_status", "approved");

        if (shopsError && isMissingColumnError(shopsError)) {
          ({ data: shops, error: shopsError } = await supabase
            .from("shops")
            .select("*")
            .eq("is_live", true));
        }

        if (shopsError) throw shopsError;
        shop =
          ((shops as Shop[] | null) ?? []).find((candidate) => {
            const explicitSlug = candidate.slug?.trim().toLowerCase();
            return (
              explicitSlug === slug ||
              generateShopSlug(candidate.name, candidate.id) === slug ||
              slugifyShopName(candidate.name) === slug
            );
          }) ?? null;
      }
    }

    if (!shop) throw new Error("Shop not found.");

    // Fetch products (capped — storefront paginates client-side / load-more)
    // `variants` (JSONB) is included so the QuickView modal can render the
    // Size/Color/Flavour selector in the delivery flow — same data the
    // restaurant/kitchen flow already sees via select("*").
    const PRODUCT_SELECT =
      "id, shop_id, name, title, description, price, original_price, compare_at_price, deal_expires_at, currency, image_url, images, is_available, is_pinned, stock_status, category_id, sub_category_id, created_at, short_code, variants";
    const PRODUCT_SELECT_LEGACY =
      "id, shop_id, name, title, description, price, original_price, compare_at_price, deal_expires_at, currency, image_url, images, is_available, stock_status, category_id, sub_category_id, created_at, variants";

    let products: Product[] | null = null;
    let productError: unknown = null;

    const first = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false })
      .limit(SHOP_STOREFRONT_PRODUCT_LIMIT);
    products = (first.data as Product[] | null) ?? null;
    productError = first.error;

    // Older schemas may not have is_pinned yet — retry without it.
    if (productError && isMissingColumnError(productError)) {
      const retry = await supabase
        .from("products")
        .select(PRODUCT_SELECT_LEGACY)
        .eq("shop_id", shop.id)
        .order("created_at", { ascending: false })
        .limit(SHOP_STOREFRONT_PRODUCT_LIMIT);
      products = (retry.data as Product[] | null) ?? null;
      productError = retry.error;
    }

    if (productError) throw productError;

    return {
      success: true,
      data: {
        shop: shop as Shop,
        products: (products as Product[]) ?? [],
      },
    };
  } catch (err) {
    logError(err, { module: "shopService.fetchShopById", meta: { id } });
    return { success: false, error: toError(err) };
  }
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Authenticated Mutations (called from dashboard)                            */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Fetch the shop owned by the currently-authenticated user.
 * Returns `null` data if the user hasn't created a shop yet (not an error).
 */
export async function fetchMyShop(): Promise<ServiceResult<Shop | null>> {
  const supabase = createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Not authenticated." };

    // Prefer the newest shop. `.maybeSingle()` errors when a merchant has
    // more than one row — that made settings look "empty" after save.
    const { data, error } = await supabase
      .from("shops")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return { success: true, data: (data as Shop) ?? null };
  } catch (err) {
    logError(err, { module: "shopService.fetchMyShop" });
    return { success: false, error: toError(err) };
  }
}

/**
 * Fetch every shop owned by the currently signed-in user.
 * Prefer this over `fetchShops()` + client-side owner filtering — RLS + an
 * explicit owner_id filter is the reliable way for the merchant dashboard.
 */
export async function fetchMyShops(): Promise<ServiceResult<Shop[]>> {
  const supabase = createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("shops")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as Shop[]) ?? [] };
  } catch (err) {
    logError(err, { module: "shopService.fetchMyShops" });
    return { success: false, error: toError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Strict Server-Side Sanitization Helpers                                    */
/*  Matches the robust pattern used across all shop services.                  */
/* -------------------------------------------------------------------------- */

/**
 * Sanitize a string value for database storage.
 * - Trims whitespace
 * - Strips HTML/script injection
 * - Limits to max length
 * - Returns empty string for null/undefined/malformed inputs
 */
function sanitizeDbString(input: unknown, maxLength: number = 500): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize a numeric string input for database numeric columns.
 * - Trims whitespace
 * - Converts to Number
 * - Returns `null` for empty, NaN, Infinity, or out-of-range values
 * - Clamps to reasonable bounds
 */
function sanitizeDbNumeric(input: unknown, min: number = 0, max: number = 99_999_999): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || Number.isNaN(input)) return null;
    if (input < min || input > max) return null;
    return Math.round(input * 100) / 100; // 2-decimal precision
  }
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  if (n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Sanitize a boolean value. Returns `false` for any non-boolean input.
 */
function sanitizeDbBoolean(input: unknown): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input === "string") {
    const lower = input.trim().toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
  }
  if (typeof input === "number") return input !== 0;
  return false;
}

/**
 * Sanitize a WhatsApp/phone number: strip non-digit chars, validate length.
 * Returns empty string for invalid numbers.
 */
function sanitizeDbPhone(input: unknown): string {
  if (typeof input !== "string") return "";
  return normalizePkPhoneDigits(input);
}

/**
 * Sanitize a URL: ensure it's valid http/https (or a data-URI image fallback).
 * Returns empty string for invalid values — never throws.
 */
function sanitizeDbUrl(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  // Keep existing data-URI placeholders (storage fallback) instead of wiping them
  if (trimmed.startsWith("data:image/")) {
    return trimmed.slice(0, 2_000_000);
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href.slice(0, 2000);
    }
  } catch {
    // Not a valid URL
  }
  return "";
}

/**
 * Sanitize a hex color code. Returns empty string for invalid hex.
 */
function sanitizeDbHexColor(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(trimmed)) return trimmed;
  return "";
}

/**
 * Sanitize a geo-coordinate pair for database storage.
 * - Accepts `null` (coordinate not set)
 * - Rejects out-of-range or non-finite values by returning `null` for both
 */
function sanitizeDbCoordinates(
  latitude: unknown,
  longitude: unknown,
): { latitude: number | null; longitude: number | null } {
  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lng = typeof longitude === "number" ? longitude : Number(longitude);
  if (
    latitude === null ||
    longitude === null ||
    latitude === undefined ||
    longitude === undefined ||
    !isValidLatitude(lat) ||
    !isValidLongitude(lng)
  ) {
    return { latitude: null, longitude: null };
  }
  return { latitude: lat, longitude: lng };
}

/**
 * Sanitize a delivery/service radius in km. Clamped to [1, 500], default 10.
 */
function sanitizeDbRadiusKm(input: unknown): number {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || Number.isNaN(n)) return 10;
  return Math.round(Math.max(1, Math.min(500, n)));
}

/**
 * Sanitize the merchant's free-delivery radius (km). Empty / 0 / invalid →
 * null (feature off). Decimals allowed (e.g. 1.5 km), capped at 200 km.
 */
function sanitizeDbFreeRadiusKm(input: unknown): number | null {
  if (input == null || input === "") return null;
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 200);
}

/** Sanitize coverage / delivery zone markers (max 10 entries). */
function sanitizeDeliveryZones(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((z): z is string => typeof z === "string")
    .map((z) => z.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Sanitize the free-delivery-areas list: string array (or comma-separated
 * string) of locality names. Dedupes + caps length so the column stays tidy.
 */
function sanitizeFreeDeliveryAreas(input: unknown): string[] {
  if (input == null) return [];
  const raw: string[] = Array.isArray(input)
    ? input.filter((v): v is string => typeof v === "string")
    : typeof input === "string"
      ? input.split(",")
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const name = String(item).trim().slice(0, 60);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Sanitize an Instagram handle. Returns empty string for invalid handles.
 */
function sanitizeDbInstagram(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim().replace(/^@/, "");
  if (/^[a-zA-Z0-9._]{1,30}$/.test(trimmed)) return `@${trimmed}`;
  return "";
}

/**
 * Sanitize a TikTok handle (username only). Returns empty string for invalid.
 */
function sanitizeDbTikTok(input: unknown): string {
  if (typeof input !== "string") return "";
  const raw = input.trim();
  if (!raw) return "";
  const fromUrl = raw.match(/tiktok\.com\/@?([^/?#]+)/i);
  const trimmed = (fromUrl?.[1] ?? raw).replace(/^@/, "");
  if (/^[a-zA-Z0-9._]{1,30}$/.test(trimmed)) return trimmed;
  return "";
}

/**
 * Sanitize a Facebook URL. Returns empty string for invalid.
 */
function sanitizeDbFacebook(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  // Must be a facebook.com or fb.com URL
  if (/^https?:\/\/(www\.)?(facebook\.com|fb\.com)\/.+/i.test(trimmed)) {
    return sanitizeDbUrl(trimmed);
  }
  return "";
}

/**
 * Comprehensive sanitization of the entire shop form before database insertion.
 * - Every field undergoes strict type validation
 * - Empty/malformed numeric inputs are cleanly converted to null
 * - String fields are stripped of HTML/injection vectors
 * - Booleans are forced to true/false
 */
function sanitizeShopForm(form: ShopFormData): Omit<
  ShopFormData,
  | "hourly_rate"
  | "call_out_charge"
  | "latitude"
  | "longitude"
  | "min_order_amount"
  | "free_delivery_threshold"
  | "free_delivery_radius_km"
  | "delivery_fee_flat"
  | "delivery_fee_per_km"
  | "announcement_expires_at"
> & {
  hourly_rate: number | null;
  call_out_charge: number | null;
  latitude: number | null;
  longitude: number | null;
  min_order_amount: number;
  free_delivery_threshold: number | null;
  free_delivery_radius_km: number | null;
  delivery_fee_flat: number;
  delivery_fee_per_km: number;
  announcement_expires_at: string | null;
} {
  const { latitude, longitude } = sanitizeDbCoordinates(form.latitude, form.longitude);
  return {
    name: sanitizeDbString(form.name, 100),
    category: sanitizeDbString(form.category, 50),
    location: sanitizeDbString(form.location, 200),
    whatsapp_number: sanitizeDbPhone(form.whatsapp_number),
    logo_url: sanitizeDbUrl(form.logo_url),
    banner_url: sanitizeDbUrl(form.banner_url),
    is_live: sanitizeDbBoolean(form.is_live),
    instagram_handle: sanitizeDbInstagram(form.instagram_handle),
    facebook_url: sanitizeDbFacebook(form.facebook_url),
    tiktok_handle: sanitizeDbTikTok(form.tiktok_handle),
    secondary_phone: sanitizeDbPhone(form.secondary_phone),
    business_hours: sanitizeDbString(form.business_hours, 150),
    operating_status: sanitizeDbString(form.operating_status, 150),
    accent_color: sanitizeDbHexColor(form.accent_color),
    store_bio: sanitizeDbString(form.store_bio, 500),
    announcement: sanitizeDbString(form.announcement, 200),
    announcement_expires_at: form.announcement?.trim()
      ? sanitizeAnnouncementExpires(form.announcement_expires_at)
      : null,
    service_area: sanitizeDbString(form.service_area, 200),
    hourly_rate: sanitizeDbNumeric(form.hourly_rate, 0, 999_999),
    call_out_charge: sanitizeDbNumeric(form.call_out_charge, 0, 999_999),
    emergency_available: sanitizeDbBoolean(form.emergency_available),
    shop_type: form.shop_type === "service" ? "service" : "retail",
    latitude,
    longitude,
    service_radius_km: sanitizeDbRadiusKm(form.service_radius_km),
    delivery_zones: sanitizeDeliveryZones(form.delivery_zones),
    address_display: sanitizeDbString(form.address_display, 400),
    min_order_amount: sanitizeDbNumeric(form.min_order_amount, 0, 999_999) ?? 0,
    free_delivery_threshold: sanitizeDbNumeric(form.free_delivery_threshold, 0, 999_999),
    free_delivery_radius_km: sanitizeDbFreeRadiusKm(form.free_delivery_radius_km),
    delivery_fee_flat: sanitizeDbNumeric(form.delivery_fee_flat, 0, 99_999) ?? 0,
    delivery_fee_per_km: sanitizeDbNumeric(form.delivery_fee_per_km, 0, 9_999) ?? 0,
    free_delivery_areas: sanitizeFreeDeliveryAreas(form.free_delivery_areas),
    accepts_delivery: sanitizeDbBoolean(form.accepts_delivery ?? true),
    accepts_pickup: sanitizeDbBoolean(form.accepts_pickup ?? true),
  };
}

/**
 * Create a new shop for the currently-authenticated user.
 * Email-verified merchants go live immediately (admin approval queue is off).
 */
export async function createShop(
  form: ShopFormData,
): Promise<ServiceResult<Shop>> {
  const supabase = createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Not authenticated." };
    if (!user.email_confirmed_at) {
      return {
        success: false,
        error:
          "Verify your email first. After verification your store goes live automatically.",
      };
    }

    // Strict one-store-per-account rule. The DB also enforces this with a
    // unique index (see one_shop_per_owner migration) — this guard returns a
    // friendly error before the insert instead of a raw constraint violation.
    const existing = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!existing.error && existing.data) {
      return {
        success: false,
        error:
          "You already own a store on TrendsMart — only one store is allowed per account. Open it from your dashboard.",
      };
    }

    const sanitized = sanitizeShopForm(form) as Record<string, unknown>;
    const persisted = await persistShopRow("insert", {
      ...sanitized,
      owner_id: user.id,
      verification_status: "approved",
      is_live: sanitizeDbBoolean(form.is_live) ?? true,
    });

    if (persisted.error || !persisted.data) throw persisted.error;
    const saved = persisted.data;
    const withIdSlug = await persistShopRow(
      "update",
      { slug: generateShopSlug(saved.name, saved.id) },
      saved.id,
    );
    const finalShop = withIdSlug.data ?? saved;

    // 1st month free — start trial subscription (best-effort; never blocks shop create).
    try {
      const { initializeSubscription } = await import("@/services/subscriptionService");
      void initializeSubscription(finalShop.id, "free_trial");
    } catch (subErr) {
      logError(subErr, { module: "shopService.createShop.trial", meta: { shopId: finalShop.id } });
    }

    return { success: true, data: finalShop };
  } catch (err) {
    logError(err, { module: "shopService.createShop", meta: { form } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Update an existing shop.  The RLS policy ensures only the owner can update.
 */
export async function updateShop(
  shopId: string,
  form: ShopFormData,
): Promise<ServiceResult<Shop>> {
  try {
    const sanitized = sanitizeShopForm(form) as Record<string, unknown>;
    sanitized.slug = generateShopSlug(String(sanitized.name ?? form.name), shopId);
    const persisted = await persistShopRow("update", sanitized, shopId);
    if (persisted.error || !persisted.data) {
      return {
        success: false,
        error: persisted.error
          ? toError(persisted.error)
          : "Update did not persist. Confirm you own this shop and try again.",
      };
    }
    return { success: true, data: persisted.data };
  } catch (err) {
    logError(err, { module: "shopService.updateShop", meta: { shopId, form } });
    return { success: false, error: toError(err) };
  }
}

/** Sensitive profile fields (name + phone numbers) are locked to one change
 * per rolling 7 days. */
const SENSITIVE_INFO_LOCK_MS = 7 * 24 * 60 * 60 * 1000;

export function sensitiveInfoLockedUntil(
  updatedAt: string | null | undefined,
): Date | null {
  if (!updatedAt) return null;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return null;
  const next = t + SENSITIVE_INFO_LOCK_MS;
  return next > Date.now() ? new Date(next) : null;
}

/**
 * Update a shop's profile with an optional once-per-week lock on sensitive
 * fields (name, whatsapp number, secondary phone). Location and every other
 * field are always free.
 *
 * When `sensitiveChanged` is true, the current `sensitive_info_updated_at` is
 * checked; if it was changed within the last 7 days the update is rejected
 * with the next available date. Otherwise the timestamp is bumped so the lock
 * window resets. Callers must already have verified the account password.
 */
export async function updateShopProfile(
  shopId: string,
  form: ShopFormData,
  sensitiveChanged: boolean,
): Promise<ServiceResult<Shop>> {
  const supabase = createClient();

  try {
    const sanitized = sanitizeShopForm(form) as Record<string, unknown>;
    sanitized.slug = generateShopSlug(String(sanitized.name ?? form.name), shopId);

    if (sensitiveChanged) {
      let lockColumnAvailable = true;
      const { data: current, error: readError } = await supabase
        .from("shops")
        .select("sensitive_info_updated_at")
        .eq("id", shopId)
        .maybeSingle();

      if (readError && isMissingColumnError(readError)) {
        // Lock column isn't in the DB yet (migration not applied) — skip the
        // lock entirely. Writing the column here would fail the whole update
        // and the fallback below would also drop the secondary phone, so the
        // number would silently never save.
        lockColumnAvailable = false;
      } else if (readError) {
        throw readError;
      }

      if (lockColumnAvailable) {
        const lastRaw = (
          current as { sensitive_info_updated_at?: string | null } | null
        )?.sensitive_info_updated_at;
        const lockedUntil = sensitiveInfoLockedUntil(lastRaw);
        if (lockedUntil) {
          return {
            success: false,
            error: `Store name and phone numbers can only be changed once per week. Available again after ${lockedUntil.toLocaleDateString("en-PK", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}.`,
          };
        }
        sanitized.sensitive_info_updated_at = new Date().toISOString();
      }
    }

    const persisted = await persistShopRow("update", sanitized, shopId);
    if (persisted.error || !persisted.data) {
      return {
        success: false,
        error: persisted.error
          ? toError(persisted.error)
          : "Update did not persist. Confirm you own this shop and try again.",
      };
    }
    return { success: true, data: persisted.data };
  } catch (err) {
    logError(err, { module: "shopService.updateShopProfile", meta: { shopId, sensitiveChanged } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Delete a shop.  RLS ensures only the owner can delete.
 */
export async function deleteShop(shopId: string): Promise<ServiceResult<null>> {
  const supabase = createClient();

  try {
    const { error } = await supabase.from("shops").delete().eq("id", shopId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "shopService.deleteShop", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}
