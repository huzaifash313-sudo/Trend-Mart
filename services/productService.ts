/* -------------------------------------------------------------------------- */
/*  TrendsMart — Product Service Layer                                         */
/*  All product-related Supabase operations in one place.                      */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { MarketplaceProduct, Product, ProductFormData } from "@/types";
import { logError, toErrorMessage, toServiceError } from "@/services/errorService";
import { isValidUUID } from "@/lib/sanitization";
import { generateProductShortCode } from "@/lib/shortCode";
import { diversifyMarketplaceFeed, scoreProductPopularity } from "@/lib/marketplaceDiversity";
import {
  buildFuzzyIlikeOr,
  fuzzyFilterAndRank,
  FUZZY_MIN_SCORE,
} from "@/lib/fuzzySearch";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return toServiceError(err);
}

/** Core columns that exist on every TrendsMart products table. */
const PRODUCT_CORE_KEYS = [
  "name",
  "description",
  "price",
  "image_url",
  "is_available",
  "variants",
] as const;

function isMissingColumnError(err: unknown): boolean {
  // Inspect the RAW PostgREST error — toServiceError() rewrites missing-column
  // errors into a friendly message that would never match these patterns.
  const msg = toErrorMessage(err);
  return /column .* does not exist|PGRST204|schema cache|Could not find/i.test(msg);
}

/** Postgres 22P02 — e.g. writing a category name into a uuid-typed category_id. */
function isInvalidUuidSyntaxError(err: unknown): boolean {
  const msg = toErrorMessage(err);
  return /22P02|invalid input syntax for type uuid/i.test(msg);
}

/** Postgres 23505 — unique constraint violation (e.g. short_code collision). */
function isUniqueViolation(err: unknown): boolean {
  const msg = toErrorMessage(err);
  return /23505|duplicate key|unique constraint/i.test(msg);
}

const CATEGORY_ID_UUID_FLAG = "tm_products_category_id_is_uuid";
const CATEGORY_ID_TEXT_FLAG = "tm_products_category_id_is_text";

/** True only when we know category_id is text (safe to store names). */
function shouldSendCategoryName(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (window.localStorage?.getItem(CATEGORY_ID_UUID_FLAG) === "1") return false;
    return window.localStorage?.getItem(CATEGORY_ID_TEXT_FLAG) === "1";
  } catch {
    return false;
  }
}

function markCategoryIdColumnAsUuid(): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage?.setItem(CATEGORY_ID_UUID_FLAG, "1");
      window.localStorage?.removeItem(CATEGORY_ID_TEXT_FLAG);
    }
  } catch {
    /* ignore */
  }
}

function markCategoryIdColumnAsText(): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage?.setItem(CATEGORY_ID_TEXT_FLAG, "1");
      window.localStorage?.removeItem(CATEGORY_ID_UUID_FLAG);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Build a clean insert/update row from form data.
 * - Drops empty UUID fields (PostgREST rejects "" for uuid columns)
 * - Normalises optional pricing / gallery fields
 * - `category_id` stores the main category NAME (text) on correct schemas;
 *   legacy uuid-typed columns are detected once and then skipped (no noisy 400s)
 */
function buildProductRow(
  form: ProductFormData,
  opts?: { coreOnly?: boolean; omitCategoryId?: boolean },
): Record<string, unknown> {
  const sanitized = sanitizeProductPricing(form);
  // Gallery: prefer `images[]`, keep `image_url` as cover (first photo)
  const galleryRaw = Array.isArray(sanitized.images)
    ? sanitized.images
    : sanitized.image_url
      ? [sanitized.image_url]
      : [];
  const gallery = galleryRaw
    .filter((u): u is string => typeof u === "string" && !!u.trim())
    .map((u) => u.trim())
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, 6);
  const cover = gallery[0] || sanitized.image_url?.trim() || null;

  const row: Record<string, unknown> = {
    name: (sanitized.name ?? "").trim(),
    description: sanitized.description ?? "",
    price: sanitized.price ?? 0,
    image_url: cover,
    is_available: sanitized.is_available ?? true,
    variants: sanitized.variants ?? null,
  };

  if (!opts?.coreOnly) {
    row.title = sanitized.title?.trim() || sanitized.name?.trim() || null;
    row.original_price = sanitized.original_price ?? null;
    if ("deal_expires_at" in sanitized) {
      const raw = sanitized.deal_expires_at;
      if (raw == null || raw === "") {
        row.deal_expires_at = null;
      } else {
        const t = new Date(raw).getTime();
        row.deal_expires_at = Number.isNaN(t) ? null : new Date(t).toISOString();
      }
    }
    row.images = gallery.length > 0 ? gallery : [];
    row.stock_status = sanitized.stock_status || "in_stock";
    row.currency = "PKR";
    row.price_tiers =
      Array.isArray(sanitized.price_tiers) && sanitized.price_tiers.length > 0
        ? sanitized.price_tiers
        : null;

    // category_id: intended schema stores the category NAME (text). Live DBs that
    // still type it as uuid reject names with 400/22P02. Never POST a non-UUID
    // name — that was the noisy console error despite the success toast (retry
    // without category_id). Taxonomy is kept via sub_category_id.
    // After FIX_category_id_uuid_to_text.sql, set localStorage
    // tm_products_category_id_is_text=1 (or we detect below) to store names again.
    const cat = sanitized.category_id?.trim() || null;
    if (!opts?.omitCategoryId && cat) {
      if (isValidUUID(cat)) {
        row.category_id = cat;
      } else if (shouldSendCategoryName()) {
        row.category_id = cat;
      }
    }

    const subId = sanitized.sub_category_id;
    row.sub_category_id =
      typeof subId === "string" && isValidUUID(subId) ? subId : null;
  }

  return row;
}

function pickKeys(
  row: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in row) out[key] = row[key];
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Pricing Sanitization                                                       */
/*                                                                              */
/*  Callers across the dashboard frequently send *partial* ProductFormData     */
/*  objects to `updateProduct` (e.g. toggling availability only) and rely on   */
/*  Supabase's `.update()` only touching the keys that are actually present.   */
/*  These helpers must preserve that behaviour — they only sanitize a pricing  */
/*  field when the caller explicitly included it, never inventing new keys.    */
/* ──────────────────────────────────────────────────────────────────────────── */

/** Sanitize a required price: coerces to a finite, non-negative number (2dp). */
function sanitizePriceValue(input: unknown): number {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || Number.isNaN(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Sanitize an optional "original price" (markdown/compare-at) value.
 * Empty, zero, negative, or non-finite inputs are normalised to `null`
 * (i.e. "no discount"), so the storefront never renders a broken badge.
 */
function sanitizeOptionalPriceValue(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Sanitize pricing fields on a (possibly partial) ProductFormData payload
 * without adding keys the caller didn't send.
 */
function sanitizeProductPricing<T extends Partial<ProductFormData>>(form: T): T {
  const out: T = { ...form };
  if ("price" in form) {
    (out as Partial<ProductFormData>).price = sanitizePriceValue(form.price);
  }
  if ("original_price" in form) {
    (out as Partial<ProductFormData>).original_price = sanitizeOptionalPriceValue(
      form.original_price,
    );
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Queries                                                                    */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Fetch all products belonging to a specific shop.
 */
export async function fetchProductsByShopId(
  shopId: string,
): Promise<ServiceResult<Product[]>> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as Product[]) ?? [] };
  } catch (err) {
    logError(err, { module: "productService.fetchProductsByShopId", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

export type MarketplaceSort =
  | "for_you"
  | "popular"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "discount"
  | "nearest";

export interface MarketplaceProductFilters {
  query?: string;
  /** Shop main category (matches shops.category) */
  category?: string;
  subCategoryId?: string | null;
  sort?: MarketplaceSort;
  /** Page size (rows per page, clamped 20..200). */
  limit?: number;
  /** Zero-based row offset for cursor pagination (default 0). */
  offset?: number;
  availableOnly?: boolean;
}

type ShopJoin = {
  id?: string;
  name?: string | null;
  logo_url?: string | null;
  whatsapp_number?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_live?: boolean | null;
  verification_status?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  free_delivery_threshold?: number | null;
  announcement?: string | null;
  announcement_expires_at?: string | null;
  delivery_fee_flat?: number | null;
  delivery_fee_per_km?: number | null;
  location?: string | null;
  service_radius_km?: number | null;
  delivery_zones?: string[] | null;
};

function mapMarketplaceRow(row: Record<string, unknown>): MarketplaceProduct | null {
  const shopRaw = row.shops as ShopJoin | ShopJoin[] | null | undefined;
  const shop = Array.isArray(shopRaw) ? shopRaw[0] : shopRaw;
  if (!shop?.name) return null;

  const images = Array.isArray(row.images)
    ? (row.images as string[])
    : null;

  return {
    id: String(row.id),
    shop_id: String(row.shop_id ?? shop.id ?? ""),
    name: String(row.name ?? ""),
    title: (row.title as string | null) ?? null,
    description: String(row.description ?? ""),
    price: Number(row.price) || 0,
    original_price: (row.original_price as number | null) ?? null,
    compare_at_price: (row.compare_at_price as number | null) ?? null,
    deal_expires_at: (row.deal_expires_at as string | null) ?? null,
    currency: String(row.currency ?? "PKR"),
    image_url: (row.image_url as string | null) ?? null,
    images,
    is_available: row.is_available !== false,
    stock_status: (row.stock_status as string | undefined) ?? undefined,
    variants: (row.variants as Product["variants"]) ?? null,
    price_tiers: (row.price_tiers as Product["price_tiers"]) ?? null,
    orders_count: Number(row.orders_count) || 0,
    click_count: Number(row.click_count) || 0,
    category_id: (row.category_id as string | null) ?? null,
    sub_category_id: (row.sub_category_id as string | null) ?? null,
    created_at: (row.created_at as string | undefined) ?? undefined,
    short_code: (row.short_code as string | null) ?? null,
    shop_name: String(shop.name),
    shop_logo_url: shop.logo_url ?? null,
    shop_whatsapp: shop.whatsapp_number ?? null,
    shop_category: shop.category ?? null,
    shop_latitude: typeof shop.latitude === "number" ? shop.latitude : null,
    shop_longitude: typeof shop.longitude === "number" ? shop.longitude : null,
    shop_location: shop.location ?? null,
    shop_service_radius_km:
      typeof shop.service_radius_km === "number" ? shop.service_radius_km : null,
    shop_delivery_zones: Array.isArray(shop.delivery_zones)
      ? (shop.delivery_zones as string[])
      : null,
    shop_avg_rating:
      typeof shop.avg_rating === "number" ? shop.avg_rating : Number(shop.avg_rating) || null,
    shop_review_count:
      typeof shop.review_count === "number"
        ? shop.review_count
        : Number(shop.review_count) || null,
    shop_free_delivery_threshold:
      typeof shop.free_delivery_threshold === "number"
        ? shop.free_delivery_threshold
        : Number(shop.free_delivery_threshold) || null,
    shop_delivery_fee_flat:
      typeof shop.delivery_fee_flat === "number"
        ? shop.delivery_fee_flat
        : Number(shop.delivery_fee_flat) || null,
    shop_delivery_fee_per_km:
      typeof shop.delivery_fee_per_km === "number"
        ? shop.delivery_fee_per_km
        : Number(shop.delivery_fee_per_km) || null,
    shop_announcement: shop.announcement ?? null,
    shop_announcement_expires_at: shop.announcement_expires_at ?? null,
  };
}

function sortMarketplaceProducts(
  items: MarketplaceProduct[],
  sort: MarketplaceSort,
): MarketplaceProduct[] {
  // Fair mix: best-of-each-shop + round-robin so one seller cannot flood the feed
  return diversifyMarketplaceFeed(items, sort);
}

const MARKETPLACE_SELECT = `
  id, shop_id, name, title, price, original_price, compare_at_price,
  deal_expires_at, currency, image_url, images, is_available, stock_status,
  category_id, sub_category_id, created_at, short_code, variants, price_tiers,
  orders_count, click_count,
  shops!inner (
    id, name, logo_url, whatsapp_number, category,
    is_live, verification_status, latitude, longitude, location,
    service_radius_km, delivery_zones,
    avg_rating, review_count,
    free_delivery_threshold, announcement, announcement_expires_at,
    delivery_fee_flat, delivery_fee_per_km
  )
`;

/** Pre-migration fallback if avg_rating / offer columns are not applied yet. */
const MARKETPLACE_SELECT_LEGACY = `
  id, shop_id, name, title, price, original_price, compare_at_price,
  deal_expires_at, currency, image_url, images, is_available, stock_status,
  category_id, sub_category_id, created_at, variants,
  shops!inner (
    id, name, logo_url, whatsapp_number, category,
    is_live, verification_status, latitude, longitude, location
  )
`;

function isMissingRatingColumnError(err: unknown): boolean {
  const msg = err && typeof err === "object" && "message" in err
    ? String((err as { message?: string }).message || "")
    : String(err || "");
  return /avg_rating|review_count|free_delivery_threshold|announcement|column .* does not exist/i.test(msg);
}

/**
 * Newest-first DB slice can be dominated by one seller — even after category /
 * subcategory / search filters. Pull extra rows from *other* shops that still
 * match the same filters so fair-mix has something to interleave.
 */
async function topUpMarketplaceDiversity(
  supabase: ReturnType<typeof createClient>,
  items: MarketplaceProduct[],
  opts: {
    availableOnly: boolean;
    query: string;
    subCategoryId?: string | null;
    category?: string;
    targetShopSpread?: number;
  },
): Promise<MarketplaceProduct[]> {
  if (items.length === 0) return items;

  const targetShops = opts.targetShopSpread ?? 12;
  const counts = new Map<string, number>();
  for (const p of items) {
    counts.set(p.shop_id, (counts.get(p.shop_id) ?? 0) + 1);
  }

  const shopCount = counts.size;
  const maxShare = Math.max(...counts.values()) / items.length;

  // Enough distinct shops and no single seller >55% → diversify alone is enough
  if (shopCount >= Math.min(targetShops, 4) && maxShare < 0.55) {
    return items;
  }

  // Exclude shops flooding the newest window (or the only shop in the slice)
  const excludeIds = [...counts.entries()]
    .filter(([, n]) => n >= 6 || shopCount === 1)
    .map(([id]) => id);

  if (excludeIds.length === 0) return items;

  let builder = supabase
    .from("products")
    .select(MARKETPLACE_SELECT)
    .eq("shops.is_live", true)
    .eq("shops.verification_status", "approved")
    .order("created_at", { ascending: false })
    .limit(120);

  if (opts.availableOnly) builder = builder.eq("is_available", true);
  builder = builder.not("shop_id", "in", `(${excludeIds.join(",")})`);
  if (opts.subCategoryId) builder = builder.eq("sub_category_id", opts.subCategoryId);

  const fuzzyOr = opts.query
    ? buildFuzzyIlikeOr(opts.query, ["name", "title"], 10)
    : null;
  if (fuzzyOr) {
    builder = builder.or(fuzzyOr);
  } else {
    const safe = opts.query.replace(/[%_,.()']/g, " ").trim();
    if (safe) {
      const pattern = `%${safe}%`;
      builder = builder.or(
        `name.ilike.${pattern},title.ilike.${pattern}`,
      );
    }
  }

  const { data, error } = await builder;
  if (error || !data?.length) return items;

  const seen = new Set(items.map((p) => p.id));
  let extra = (data as Record<string, unknown>[])
    .map(mapMarketplaceRow)
    .filter((p): p is MarketplaceProduct => !!p && !seen.has(p.id));

  // Keep the same category filter the user already applied
  if (opts.category && opts.category !== "All") {
    const cat = opts.category.toLowerCase();
    extra = extra.filter((p) => {
      const shopCat = (p.shop_category ?? "").toLowerCase();
      const prodCat = (p.category_id ?? "").toLowerCase();
      return shopCat === cat || prodCat === cat || shopCat.includes(cat) || prodCat.includes(cat);
    });
  }

  if (!extra.length) return items;
  return [...items, ...extra];
}

/** How many rows to pull per search so popularity-aware ranking is stable across pages. */
const SEARCH_POOL_SIZE = 250;

/** Dedupe marketplace rows keeping order (first list wins). */
function mergeMarketplaceRows(
  first: Record<string, unknown>[] | null,
  second: Record<string, unknown>[] | null,
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const list of [first, second]) {
    for (const row of list ?? []) {
      const id = String(row.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }
  }
  return out;
}

interface MarketplaceRowsQuery {
  orderBy?: Array<[string, boolean]>;
  limit?: number;
  range?: [number, number];
  availableOnly: boolean;
  q: string;
  subCategoryId?: string | null;
}

/**
 * Run a marketplace products query with the standard live/approved + filter
 * stack. Retries with the legacy select when the ratings/popularity columns
 * are missing (migration not applied yet).
 */
async function runMarketplaceRows(
  supabase: ReturnType<typeof createClient>,
  opts: MarketplaceRowsQuery,
): Promise<{ rows: Record<string, unknown>[] | null; error: unknown }> {
  const build = (
    select: string,
    overrides?: { orderBy?: Array<[string, boolean]> },
  ) => {
    let b = supabase
      .from("products")
      .select(select)
      .eq("shops.is_live", true)
      .eq("shops.verification_status", "approved");
    if (opts.availableOnly) b = b.eq("is_available", true);
    if (opts.q) {
      const fuzzyOr = buildFuzzyIlikeOr(opts.q, ["name", "title"], 10);
      if (fuzzyOr) {
        b = b.or(fuzzyOr);
      } else {
        const safe = opts.q.replace(/[%_,.()']/g, " ").trim();
        if (safe) {
          const pattern = `%${safe}%`;
          b = b.or(`name.ilike.${pattern},title.ilike.${pattern}`);
        }
      }
    }
    if (opts.subCategoryId) b = b.eq("sub_category_id", opts.subCategoryId);
    for (const [col, ascending] of overrides?.orderBy ?? opts.orderBy ?? []) {
      b = b.order(col, { ascending });
    }
    if (opts.range) b = b.range(opts.range[0], opts.range[1]);
    else if (opts.limit != null) b = b.limit(opts.limit);
    return b;
  };

  const primary = await build(MARKETPLACE_SELECT);
  if (primary.error && isMissingRatingColumnError(primary.error)) {
    // Popularity columns don't exist yet — retry without them (and without
    // ordering on missing columns).
    const legacy = await build(MARKETPLACE_SELECT_LEGACY, {
      orderBy: opts.orderBy?.filter(
        ([col]) => col !== "orders_count" && col !== "click_count",
      ),
    });
    return {
      rows: (legacy.data as Record<string, unknown>[] | null) ?? null,
      error: legacy.error,
    };
  }
  return {
    rows: (primary.data as Record<string, unknown>[] | null) ?? null,
    error: primary.error,
  };
}

/**
 * Blend fuzzy relevance (0–100) with real popularity signals — parent shop
 * reviews/rating, total orders and real clicks — into one search score.
 * Relevance still leads: a cold exact match outranks a weak fuzzy one, but
 * strong demand can lift a near match above an ignored exact match.
 */
export function blendSearchScore(relevance: number, product: MarketplaceProduct): number {
  const popularity = scoreProductPopularity(product);
  return relevance * 0.62 + popularity * 0.38;
}

/**
 * Cross-store marketplace catalogue for /products.
 * Only products from live + approved shops.
 */
export async function fetchMarketplaceProducts(
  filters: MarketplaceProductFilters = {},
): Promise<ServiceResult<MarketplaceProduct[]>> {
  const supabase = createClient();
  const {
    query = "",
    category,
    subCategoryId,
    sort = "for_you",
    limit = 72,
    offset = 0,
    availableOnly = true,
  } = filters;
  // Page size clamped to [20, 200]; offset is a safe non-negative integer.
  const pageSize = Math.min(Math.max(Math.round(limit) || 20, 20), 200);
  const start = Math.max(0, Math.round(offset) || 0);

  try {
    const q = query.trim();
    const searchMode = q.length > 0;

    let rows: Record<string, unknown>[] | null = null;
    let error: unknown = null;

    if (searchMode) {
      // Broader pool so popularity-aware ranking stays consistent across
      // infinite-scroll pages. Two slices merged: newest matches (so a brand
      // new exact match is never buried) + most-ordered/clicks (so demand
      // leaders always surface). Deduped, then rank-blended client-side.
      const [fresh, popular] = await Promise.all([
        runMarketplaceRows(supabase, {
          orderBy: [["created_at", false]],
          limit: SEARCH_POOL_SIZE,
          availableOnly,
          q,
          subCategoryId,
        }),
        runMarketplaceRows(supabase, {
          orderBy: [
            ["orders_count", false],
            ["click_count", false],
            ["created_at", false],
          ],
          limit: SEARCH_POOL_SIZE,
          availableOnly,
          q,
          subCategoryId,
        }),
      ]);
      error = fresh.error || popular.error;
      rows = mergeMarketplaceRows(fresh.rows, popular.rows);
    } else {
      const res = await runMarketplaceRows(supabase, {
        orderBy: [["created_at", false]],
        range: [start, start + pageSize - 1],
        availableOnly,
        q,
        subCategoryId,
      });
      error = res.error;
      rows = res.rows;
    }
    if (error) throw error;

    let items = (rows ?? [])
      .map(mapMarketplaceRow)
      .filter((p): p is MarketplaceProduct => !!p);

    // Fallback: older products may lack sub_category_id — use shops that sell that sub-cat
    if (subCategoryId && items.length === 0) {
      const subRes = await fetchShopIdsBySubCategory(subCategoryId);
      if (subRes.success && subRes.data.length > 0) {
        const { data: fallbackRows, error: fbErr } = await supabase
          .from("products")
          .select(MARKETPLACE_SELECT)
          .eq("shops.is_live", true)
          .eq("shops.verification_status", "approved")
          .eq("is_available", true)
          .in("shop_id", subRes.data)
          .order("created_at", { ascending: false })
          .limit(Math.min(Math.max(limit, 20), 120));
        if (!fbErr && fallbackRows) {
          items = (fallbackRows as Record<string, unknown>[])
            .map(mapMarketplaceRow)
            .filter((p): p is MarketplaceProduct => !!p);
        }
      }
    }

    if (category && category !== "All") {
      const cat = category.toLowerCase();
      items = items.filter((p) => {
        const shopCat = (p.shop_category ?? "").toLowerCase();
        const prodCat = (p.category_id ?? "").toLowerCase();
        return shopCat === cat || prodCat === cat || shopCat.includes(cat) || prodCat.includes(cat);
      });
    }

    // Typo rescue only when the primary query returned almost nothing (avoid 240-row storm).
    if (q && items.length < 3) {
      let broad = supabase
        .from("products")
        .select(MARKETPLACE_SELECT)
        .eq("shops.is_live", true)
        .eq("shops.verification_status", "approved")
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(limit, 40), 120));
      if (availableOnly) broad = broad.eq("is_available", true);
      if (subCategoryId) broad = broad.eq("sub_category_id", subCategoryId);
      const broadRes = await broad;
      if (!broadRes.error && broadRes.data) {
        const pool = (broadRes.data as Record<string, unknown>[])
          .map(mapMarketplaceRow)
          .filter((p): p is MarketplaceProduct => !!p);
        const seen = new Set(items.map((p) => p.id));
        for (const p of pool) {
          if (!seen.has(p.id)) {
            items.push(p);
            seen.add(p.id);
          }
        }
      }
    }

    if (q) {
      const ranked = fuzzyFilterAndRank(
        items,
        q,
        (p) => [p.name, p.title, p.shop_name, p.shop_category],
        { minScore: FUZZY_MIN_SCORE, weights: [1, 0.95, 0.7, 0.55] },
      );
      // Blended ranking: relevance leads, then reviews/orders/clicks lift the
      // best-loved products. Skip the For You mix so typos still surface hits.
      const blended = ranked
        .map((r) => ({ item: r.item, score: blendSearchScore(r.score, r.item) }))
        .sort((a, b) => b.score - a.score)
        .map((r) => r.item);
      return { success: true, data: blended.slice(start, start + pageSize) };
    }

    items = await topUpMarketplaceDiversity(supabase, items, {
      availableOnly,
      query: q,
      subCategoryId,
      category,
      targetShopSpread: 12,
    });

    return { success: true, data: sortMarketplaceProducts(items, sort) };
  } catch (err) {
    logError(err, { module: "productService.fetchMarketplaceProducts", meta: { ...filters } });
    return { success: false, error: toError(err) };
  }
}

/** Single marketplace product by id (deep-links / recently viewed). */
export async function fetchMarketplaceProductById(
  productId: string,
): Promise<ServiceResult<MarketplaceProduct | null>> {
  if (!productId || !isValidUUID(productId)) {
    return { success: true, data: null };
  }
  const supabase = createClient();
  try {
    const primary = await supabase
      .from("products")
      .select(MARKETPLACE_SELECT)
      .eq("id", productId)
      .eq("shops.is_live", true)
      .eq("shops.verification_status", "approved")
      .maybeSingle();

    let row: Record<string, unknown> | null =
      (primary.data as Record<string, unknown> | null) ?? null;
    let error = primary.error;

    if (error && isMissingRatingColumnError(error)) {
      const legacy = await supabase
        .from("products")
        .select(MARKETPLACE_SELECT_LEGACY)
        .eq("id", productId)
        .eq("shops.is_live", true)
        .eq("shops.verification_status", "approved")
        .maybeSingle();
      row = (legacy.data as Record<string, unknown> | null) ?? null;
      error = legacy.error;
    }
    if (error) throw error;
    if (!row) return { success: true, data: null };
    return { success: true, data: mapMarketplaceRow(row) };
  } catch (err) {
    logError(err, { module: "productService.fetchMarketplaceProductById", meta: { productId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Resolve a direct product-page reference (`/p/[code]`) to a product.
 * Accepts either a short code (from the `short_code` column) or a full UUID.
 * Returns `null` data when no matching live/approved product exists.
 */
export async function fetchProductByReference(
  ref: string,
): Promise<ServiceResult<MarketplaceProduct | null>> {
  const trimmed = (ref ?? "").trim();
  if (!trimmed) return { success: true, data: null };

  // Full UUID — look up directly (also the fallback before short_code exists).
  if (isValidUUID(trimmed)) {
    return fetchMarketplaceProductById(trimmed);
  }

  const supabase = createClient();
  try {
    const res = await supabase
      .from("products")
      .select(MARKETPLACE_SELECT)
      .eq("short_code", trimmed)
      .eq("shops.is_live", true)
      .eq("shops.verification_status", "approved")
      .maybeSingle();

    if (res.error && isMissingColumnError(res.error)) {
      // short_code migration not applied — can't resolve a short code.
      return { success: true, data: null };
    }
    if (res.error) throw res.error;

    const row = res.data as Record<string, unknown> | null;
    return { success: true, data: row ? mapMarketplaceRow(row) : null };
  } catch (err) {
    logError(err, { module: "productService.fetchProductByReference", meta: { ref: trimmed } });
    return { success: false, error: toError(err) };
  }
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Mutations (protected by RLS)                                               */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Add a new product to the specified shop.
 * RLS ensures only the shop owner can insert.
 */
export async function createProduct(
  shopId: string,
  form: ProductFormData,
): Promise<ServiceResult<Product>> {
  const supabase = createClient();

  if (!shopId || !isValidUUID(shopId)) {
    return { success: false, error: "Invalid shop. Please re-open the dashboard and try again." };
  }
  if (!form.name?.trim()) {
    return { success: false, error: "Product name is required." };
  }
  if (!(form.price > 0)) {
    return { success: false, error: "Price must be greater than 0." };
  }

  try {
    const productFields = buildProductRow(form);
    const productName = String(productFields.name ?? form.name.trim());
    // Compact deep-link code for `/p/{short_code}`. Regenerate on the extremely
    // rare unique collision; the existing missing-column fallback below strips
    // it gracefully when the short_code migration hasn't been applied yet.
    let shortCode = generateProductShortCode();
    let fullRow: Record<string, unknown> = {
      ...productFields,
      short_code: shortCode,
      shop_id: shopId,
    };
    let { data, error } = await supabase
      .from("products")
      .insert(fullRow)
      .select()
      .single();

    // Retry a short_code unique violation (23505) with a fresh code.
    for (let attempt = 0; attempt < 3 && error && isUniqueViolation(error); attempt++) {
      shortCode = generateProductShortCode();
      fullRow = { ...productFields, short_code: shortCode, shop_id: shopId };
      ({ data, error } = await supabase
        .from("products")
        .insert(fullRow)
        .select()
        .single());
    }

    // Legacy DBs typed category_id as uuid — category NAMES like
    // "Tech & IT Services" then fail with 22P02. Remember that and retry
    // without category_id so the console stays clean on later adds.
    if (error && isInvalidUuidSyntaxError(error)) {
      markCategoryIdColumnAsUuid();
      const withoutCat: Record<string, unknown> = {
        ...buildProductRow(form, { omitCategoryId: true }),
        shop_id: shopId,
      };
      delete withoutCat.category_id;
      ({ data, error } = await supabase
        .from("products")
        .insert(withoutCat)
        .select()
        .single());
    }

    // Newer optional columns (deal_expires_at, images, …) — strip then retry.
    if (error && isMissingColumnError(error)) {
      const msg = toError(error);
      const stripped: Record<string, unknown> = {
        ...buildProductRow(form, { omitCategoryId: true }),
        shop_id: shopId,
      };
      delete stripped.category_id;
      if (/deal_expires_at/i.test(msg)) delete stripped.deal_expires_at;
      if (/images/i.test(msg)) delete stripped.images;
      if (/original_price/i.test(msg)) delete stripped.original_price;
      if (/price_tiers/i.test(msg)) delete stripped.price_tiers;
      ({ data, error } = await supabase
        .from("products")
        .insert(stripped)
        .select()
        .single());
    }

    // Older DBs may be missing enhanced columns — retry with the core set.
    if (error && isMissingColumnError(error)) {
      const coreRow: Record<string, unknown> = {
        ...pickKeys(buildProductRow(form, { coreOnly: true }), [
          ...PRODUCT_CORE_KEYS,
        ]),
        shop_id: shopId,
      };
      ({ data, error } = await supabase
        .from("products")
        .insert(coreRow)
        .select()
        .single());
    }

    // Insert can succeed while `.select().single()` fails under strict RLS.
    // Fall back to reading the newest product for this shop by name.
    if (error && /PGRST116|0 rows|multiple \(or no\) rows/i.test(toError(error))) {
      const { data: inserted, error: fetchErr } = await supabase
        .from("products")
        .select("*")
        .eq("shop_id", shopId)
        .eq("name", productName)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!fetchErr && inserted) {
        return { success: true, data: inserted as Product };
      }
    }

    if (error) throw error;
    if (
      data &&
      typeof fullRow.category_id === "string" &&
      !isValidUUID(fullRow.category_id)
    ) {
      markCategoryIdColumnAsText();
    }
    return { success: true, data: data as Product };
  } catch (err) {
    logError(err, { module: "productService.createProduct", meta: { shopId, form } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Create multiple products for a shop in one merchant action.
 * Continues on per-row failures and returns a summary.
 */
export async function bulkCreateProducts(
  shopId: string,
  forms: ProductFormData[],
): Promise<
  ServiceResult<{ created: Product[]; failed: { index: number; error: string }[] }>
> {
  if (!shopId || !isValidUUID(shopId)) {
    return { success: false, error: "Invalid shop. Please re-open the dashboard and try again." };
  }
  if (!forms.length) {
    return { success: false, error: "Add at least one product row." };
  }

  const created: Product[] = [];
  const failed: { index: number; error: string }[] = [];

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    const result = await createProduct(shopId, form);
    if (result.success) created.push(result.data);
    else failed.push({ index: i, error: result.error });
  }

  if (created.length === 0) {
    return {
      success: false,
      error: failed[0]?.error ?? "Failed to create products.",
    };
  }

  return { success: true, data: { created, failed } };
}

/**
 * Shop IDs that currently have at least one product in the given sub-category.
 * Used for homepage / search filtering by sub-category.
 */
export async function fetchShopIdsBySubCategory(
  subCategoryId: string,
): Promise<ServiceResult<string[]>> {
  if (!subCategoryId || !isValidUUID(subCategoryId)) {
    return { success: true, data: [] };
  }
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("products")
      .select("shop_id")
      .eq("sub_category_id", subCategoryId)
      .eq("is_available", true);

    if (error) throw error;
    const ids = Array.from(
      new Set(((data as { shop_id: string }[]) ?? []).map((r) => r.shop_id).filter(Boolean)),
    );
    return { success: true, data: ids };
  } catch (err) {
    logError(err, {
      module: "productService.fetchShopIdsBySubCategory",
      meta: { subCategoryId },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Update an existing product.
 * RLS ensures only the shop owner can update.
 */
export async function updateProduct(
  productId: string,
  form: ProductFormData,
): Promise<ServiceResult<Product>> {
  const supabase = createClient();

  try {
    // Preserve partial-update behaviour for callers that only send a few keys
    // (e.g. availability toggle) — only include keys present on `form`.
    const hasPartialShape =
      !("name" in form) ||
      !("description" in form) ||
      !("price" in form);

    let row: Record<string, unknown>;
    if (hasPartialShape) {
      const sanitized = sanitizeProductPricing(form);
      row = { ...(sanitized as unknown as Record<string, unknown>) };
      if (
        "sub_category_id" in row &&
        (typeof row.sub_category_id !== "string" ||
          !isValidUUID(row.sub_category_id as string))
      ) {
        row.sub_category_id = null;
      }
    } else {
      row = buildProductRow(form);
    }

    let { data, error } = await supabase
      .from("products")
      .update(row)
      .eq("id", productId)
      .select()
      .single();

    if (error && isInvalidUuidSyntaxError(error)) {
      markCategoryIdColumnAsUuid();
      const withoutCat = { ...row };
      delete withoutCat.category_id;
      ({ data, error } = await supabase
        .from("products")
        .update(withoutCat)
        .eq("id", productId)
        .select()
        .single());
    }

    if (error && isMissingColumnError(error) && !hasPartialShape) {
      const msg = toError(error);
      const stripped = { ...row };
      if (/deal_expires_at/i.test(msg)) delete stripped.deal_expires_at;
      if (/images/i.test(msg)) delete stripped.images;
      if (/original_price/i.test(msg)) delete stripped.original_price;
      if (/price_tiers/i.test(msg)) delete stripped.price_tiers;
      ({ data, error } = await supabase
        .from("products")
        .update(stripped)
        .eq("id", productId)
        .select()
        .single());
    }

    if (error && isMissingColumnError(error) && !hasPartialShape) {
      const coreRow = pickKeys(buildProductRow(form, { coreOnly: true }), [
        ...PRODUCT_CORE_KEYS,
      ]);
      ({ data, error } = await supabase
        .from("products")
        .update(coreRow)
        .eq("id", productId)
        .select()
        .single());
    }

    if (error) throw error;
    return { success: true, data: data as Product };
  } catch (err) {
    logError(err, { module: "productService.updateProduct", meta: { productId, form } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Delete a product by its ID.
 * RLS ensures only the shop owner can delete.
 */
export async function deleteProduct(
  productId: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();

  try {
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "productService.deleteProduct", meta: { productId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Bulk update availability status for multiple products.
 * Uses a single atomic transaction to set `is_available` for all given product IDs.
 */
export async function bulkUpdateAvailability(
  productIds: string[],
  isAvailable: boolean,
): Promise<ServiceResult<null>> {
  const supabase = createClient();

  try {
    const { error } = await supabase
      .from("products")
      .update({ is_available: isAvailable })
      .in("id", productIds);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, {
      module: "productService.bulkUpdateAvailability",
      meta: { productIds, isAvailable },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Toggle the merchant "pin to top" flag on a product. Pinned products sort
 * first in the storefront. Degrades gracefully if the column hasn't been
 * added yet (run supabase/migrations/20260817000000_products_is_pinned.sql).
 */
export async function setProductPinned(
  productId: string,
  isPinned: boolean,
): Promise<ServiceResult<null>> {
  const supabase = createClient();

  try {
    const { error } = await supabase
      .from("products")
      .update({ is_pinned: isPinned })
      .eq("id", productId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    if (isMissingColumnError(err)) {
      return {
        success: false,
        error: "Pin is not available yet — run the products is_pinned migration.",
      };
    }
    logError(err, { module: "productService.setProductPinned", meta: { productId, isPinned } });
    return { success: false, error: toError(err) };
  }
}
