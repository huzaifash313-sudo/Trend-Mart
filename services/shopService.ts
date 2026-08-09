/* -------------------------------------------------------------------------- */
/*  TrendMart — Shop Service Layer                                            */
/*  All shop-related Supabase operations in one place.                         */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { Shop, Product, ShopFormData } from "@/types";
import { logError, toServiceError } from "@/services/errorService";
import { isValidLatitude, isValidLongitude } from "@/lib/geoCoords";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return toServiceError(err);
}

function isMissingColumnError(err: unknown): boolean {
  const msg = toServiceError(err);
  return /column .* does not exist|PGRST204|schema cache|Could not find/i.test(msg);
}

/** Fields that may be missing if the merchant hasn't run the full SQL setup yet. */
const SHOP_EXTENDED_KEYS = [
  "latitude",
  "longitude",
  "service_radius_km",
  "delivery_zones",
  "address_display",
  "min_order_amount",
  "free_delivery_threshold",
  "delivery_fee_flat",
  "delivery_fee_per_km",
  "service_area",
  "hourly_rate",
  "call_out_charge",
  "emergency_available",
  "shop_type",
  "announcement",
  "accent_color",
  "store_bio",
  "instagram_handle",
  "facebook_url",
  "secondary_phone",
  "business_hours",
  "operating_status",
] as const;

function stripExtendedShopFields(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...payload };
  for (const key of SHOP_EXTENDED_KEYS) {
    delete out[key];
  }
  return out;
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
}): Promise<ServiceResult<Shop[]>> {
  const supabase = createClient();

  try {
    let query = supabase.from("shops").select("*");

    if (opts?.publicOnly) {
      query = query.eq("is_live", true).eq("verification_status", "approved");
    }

    if (opts?.category && opts.category !== "All") {
      query = query.eq("category", opts.category);
    }

    if (opts?.search) {
      query = query.or(
        `name.ilike.%${opts.search}%,category.ilike.%${opts.search}%`,
      );
    }
    

    query = query.order("name", { ascending: true });

    const { data, error } = await query;

    if (error) throw error;
    return { success: true, data: (data as Shop[]) ?? [] };
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
    // Fetch shop
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("*")
      .eq("id", id)
      .single();

    if (shopError) throw shopError;
    if (!shop) throw new Error("Shop not found.");

    // Fetch products
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("shop_id", id)
      .order("created_at", { ascending: false });

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
  const digits = input.replace(/\D/g, "");
  // Valid Pakistani numbers: 10-13 digits (with/without country code)
  if (digits.length < 10 || digits.length > 15) return "";
  return digits;
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
 * Sanitize an Instagram handle. Returns empty string for invalid handles.
 */
function sanitizeDbInstagram(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim().replace(/^@/, "");
  if (/^[a-zA-Z0-9._]{1,30}$/.test(trimmed)) return `@${trimmed}`;
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
  | "delivery_fee_flat"
  | "delivery_fee_per_km"
> & {
  hourly_rate: number | null;
  call_out_charge: number | null;
  latitude: number | null;
  longitude: number | null;
  min_order_amount: number;
  free_delivery_threshold: number | null;
  delivery_fee_flat: number;
  delivery_fee_per_km: number;
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
    secondary_phone: sanitizeDbPhone(form.secondary_phone),
    business_hours: sanitizeDbString(form.business_hours, 150),
    operating_status: sanitizeDbString(form.operating_status, 150),
    accent_color: sanitizeDbHexColor(form.accent_color),
    store_bio: sanitizeDbString(form.store_bio, 500),
    announcement: sanitizeDbString(form.announcement, 200),
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
    delivery_fee_flat: sanitizeDbNumeric(form.delivery_fee_flat, 0, 99_999) ?? 0,
    delivery_fee_per_km: sanitizeDbNumeric(form.delivery_fee_per_km, 0, 9_999) ?? 0,
  };
}

/**
 * Create a new shop for the currently-authenticated user.
 * New stores go live immediately (no Super-Admin approval queue).
 * Email must be verified first.
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
        error: "Please verify your email before registering a store.",
      };
    }

    const sanitized = sanitizeShopForm(form) as Record<string, unknown>;
    // Auto-approve + live on create — no admin gate.
    const insertPayload: Record<string, unknown> = {
      ...sanitized,
      owner_id: user.id,
      verification_status: "approved",
      is_live: true,
    };

    let { data, error } = await supabase
      .from("shops")
      .insert(insertPayload)
      .select()
      .single();

    if (error && isMissingColumnError(error)) {
      // Older schemas may lack geo/delivery/verification columns — retry core fields.
      const core: Record<string, unknown> = {
        ...stripExtendedShopFields(sanitized),
        owner_id: user.id,
        is_live: true,
        verification_status: "approved",
      };
      ({ data, error } = await supabase
        .from("shops")
        .insert(core)
        .select()
        .single());
      if (error && isMissingColumnError(error)) {
        delete core.verification_status;
        ({ data, error } = await supabase
          .from("shops")
          .insert(core)
          .select()
          .single());
      }
    }

    if (error) throw error;
    return { success: true, data: data as Shop };
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
  const supabase = createClient();

  try {
    const sanitized = sanitizeShopForm(form) as Record<string, unknown>;
    let { data, error } = await supabase
      .from("shops")
      .update(sanitized)
      .eq("id", shopId)
      .select()
      .single();

    // If the DB is missing geo/delivery columns, retry with core shop fields
    // so merchants can still save name/phone/logo/etc.
    if (error && isMissingColumnError(error)) {
      ({ data, error } = await supabase
        .from("shops")
        .update(stripExtendedShopFields(sanitized))
        .eq("id", shopId)
        .select()
        .single());
    }

    if (error) throw error;
    if (!data) {
      return {
        success: false,
        error: "Update did not persist. Confirm you own this shop and try again.",
      };
    }
    return { success: true, data: data as Shop };
  } catch (err) {
    logError(err, { module: "shopService.updateShop", meta: { shopId, form } });
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
