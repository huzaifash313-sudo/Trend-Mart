/* -------------------------------------------------------------------------- */
/*  TrendMart — Product Service Layer                                         */
/*  All product-related Supabase operations in one place.                      */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { Product, ProductFormData } from "@/types";
import { logError } from "@/services/errorService";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
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

  try {
    const sanitized = sanitizeProductPricing(form);
    const { data, error } = await supabase
      .from("products")
      .insert({ ...sanitized, shop_id: shopId })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as Product };
  } catch (err) {
    logError(err, { module: "productService.createProduct", meta: { shopId, form } });
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
    const sanitized = sanitizeProductPricing(form);
    const { data, error } = await supabase
      .from("products")
      .update(sanitized)
      .eq("id", productId)
      .select()
      .single();

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
