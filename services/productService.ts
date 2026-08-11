/* -------------------------------------------------------------------------- */
/*  TrendMart — Product Service Layer                                         */
/*  All product-related Supabase operations in one place.                      */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { MarketplaceProduct, Product, ProductFormData } from "@/types";
import { logError, toServiceError } from "@/services/errorService";
import { isValidUUID } from "@/lib/sanitization";
import { diversifyMarketplaceFeed } from "@/lib/marketplaceDiversity";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return toServiceError(err);
}

/** Core columns that exist on every TrendMart products table. */
const PRODUCT_CORE_KEYS = [
  "name",
  "description",
  "price",
  "image_url",
  "is_available",
  "variants",
] as const;

function isMissingColumnError(err: unknown): boolean {
  const msg = toServiceError(err);
  return /column .* does not exist|PGRST204|schema cache|Could not find/i.test(msg);
}

/** Postgres 22P02 — e.g. writing a category name into a uuid-typed category_id. */
function isInvalidUuidSyntaxError(err: unknown): boolean {
  const msg = toServiceError(err);
  return /22P02|invalid input syntax for type uuid/i.test(msg);
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
  | "newest"
  | "price_asc"
  | "price_desc"
  | "discount";

export interface MarketplaceProductFilters {
  query?: string;
  /** Shop main category (matches shops.category) */
  category?: string;
  subCategoryId?: string | null;
  sort?: MarketplaceSort;
  /** Cap rows pulled from Supabase before client sort (default 160) */
  limit?: number;
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
    category_id: (row.category_id as string | null) ?? null,
    sub_category_id: (row.sub_category_id as string | null) ?? null,
    created_at: (row.created_at as string | undefined) ?? undefined,
    shop_name: String(shop.name),
    shop_logo_url: shop.logo_url ?? null,
    shop_whatsapp: shop.whatsapp_number ?? null,
    shop_category: shop.category ?? null,
    shop_latitude: typeof shop.latitude === "number" ? shop.latitude : null,
    shop_longitude: typeof shop.longitude === "number" ? shop.longitude : null,
    shop_avg_rating:
      typeof shop.avg_rating === "number" ? shop.avg_rating : Number(shop.avg_rating) || null,
    shop_review_count:
      typeof shop.review_count === "number"
        ? shop.review_count
        : Number(shop.review_count) || null,
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
  id, shop_id, name, title, description, price, original_price, compare_at_price,
  deal_expires_at, currency, image_url, images, is_available, stock_status,
  variants, category_id, sub_category_id, created_at,
  shops!inner (
    id, name, logo_url, whatsapp_number, category,
    is_live, verification_status, latitude, longitude,
    avg_rating, review_count
  )
`;

/** Pre-migration fallback if avg_rating columns are not applied yet. */
const MARKETPLACE_SELECT_LEGACY = `
  id, shop_id, name, title, description, price, original_price, compare_at_price,
  deal_expires_at, currency, image_url, images, is_available, stock_status,
  variants, category_id, sub_category_id, created_at,
  shops!inner (
    id, name, logo_url, whatsapp_number, category,
    is_live, verification_status, latitude, longitude
  )
`;

function isMissingRatingColumnError(err: unknown): boolean {
  const msg = err && typeof err === "object" && "message" in err
    ? String((err as { message?: string }).message || "")
    : String(err || "");
  return /avg_rating|review_count|column .* does not exist/i.test(msg);
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
    .limit(200);

  if (opts.availableOnly) builder = builder.eq("is_available", true);
  builder = builder.not("shop_id", "in", `(${excludeIds.join(",")})`);
  if (opts.subCategoryId) builder = builder.eq("sub_category_id", opts.subCategoryId);

  const safe = opts.query.replace(/[%_,.()']/g, " ").trim();
  if (safe) {
    const pattern = `%${safe}%`;
    builder = builder.or(
      `name.ilike.${pattern},description.ilike.${pattern},title.ilike.${pattern}`,
    );
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
    limit = 160,
    availableOnly = true,
  } = filters;

  try {
    let builder = supabase
      .from("products")
      .select(MARKETPLACE_SELECT)
      .eq("shops.is_live", true)
      .eq("shops.verification_status", "approved")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 20), 240));

    if (availableOnly) {
      builder = builder.eq("is_available", true);
    }

    const q = query.trim();
    if (q) {
      const safe = q.replace(/[%_,.()]/g, " ").trim();
      if (safe) {
        const pattern = `%${safe}%`;
        builder = builder.or(
          `name.ilike.${pattern},description.ilike.${pattern},title.ilike.${pattern}`,
        );
      }
    }

    if (subCategoryId) {
      builder = builder.eq("sub_category_id", subCategoryId);
    }

    let { data, error } = await builder;
    if (error && isMissingRatingColumnError(error)) {
      // Migration not applied yet — degrade gracefully without ratings.
      let legacy = supabase
        .from("products")
        .select(MARKETPLACE_SELECT_LEGACY)
        .eq("shops.is_live", true)
        .eq("shops.verification_status", "approved")
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(limit, 20), 240));
      if (availableOnly) legacy = legacy.eq("is_available", true);
      if (q) {
        const safe = q.replace(/[%_,.()']/g, " ").trim();
        if (safe) {
          const pattern = `%${safe}%`;
          legacy = legacy.or(
            `name.ilike.${pattern},description.ilike.${pattern},title.ilike.${pattern}`,
          );
        }
      }
      if (subCategoryId) legacy = legacy.eq("sub_category_id", subCategoryId);
      const legacyRes = await legacy;
      data = legacyRes.data;
      error = legacyRes.error;
    }
    if (error) throw error;

    let items = ((data as Record<string, unknown>[]) ?? [])
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
          .limit(Math.min(Math.max(limit, 20), 240));
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
    const fullRow: Record<string, unknown> = {
      ...productFields,
      shop_id: shopId,
    };
    let { data, error } = await supabase
      .from("products")
      .insert(fullRow)
      .select()
      .single();

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
      row = { ...(sanitized as Record<string, unknown>) };
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
