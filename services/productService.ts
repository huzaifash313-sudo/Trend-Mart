/* -------------------------------------------------------------------------- */
/*  TrendMart — Product Service Layer                                         */
/*  All product-related Supabase operations in one place.                      */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { Product, ProductFormData } from "@/types";
import { logError, toServiceError } from "@/services/errorService";
import { isValidUUID } from "@/lib/sanitization";

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
  const row: Record<string, unknown> = {
    name: (sanitized.name ?? "").trim(),
    description: sanitized.description ?? "",
    price: sanitized.price ?? 0,
    image_url: sanitized.image_url || null,
    is_available: sanitized.is_available ?? true,
    variants: sanitized.variants ?? null,
  };

  if (!opts?.coreOnly) {
    row.title = sanitized.title?.trim() || sanitized.name?.trim() || null;
    row.original_price = sanitized.original_price ?? null;
    row.images = sanitized.images ?? null;
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
