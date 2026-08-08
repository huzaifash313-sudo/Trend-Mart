/* -------------------------------------------------------------------------- */
/*  TrendMart — Inventory Monitoring & Low Stock Alerts                        */
/*                                                                             */
/*  PROMPT 4: HARDENED — Real-time stock status toggles ('In Stock',           */
/*                       'Out of Stock', with quantity counters), strict       */
/*                       type validation, integer coercion to prevent          */
/*                       negative inventory values or corrupted states.        */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { sanitizeNumeric, isValidUUID } from "@/lib/sanitization";
import type { Product } from "@/types";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface InventoryStatus {
  product_id: string;
  product_name: string;
  shop_id: string;
  is_available: boolean;
  /** Current stock count (if tracked), -1 for untracked, always >= 0 when tracked */
  stock_quantity: number;
  /** Low stock threshold — when stock falls to or below this, product is "low stock" */
  low_stock_threshold: number;
  /** Explicit stock status: 'in_stock', 'low_stock', 'out_of_stock', 'unavailable', 'pre_order' */
  stock_status: string;
}

export type InventoryBadge =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "unavailable"
  | "pre_order";

export interface StockUpdatePayload {
  productId: string;
  /** New stock quantity (will be coerced to non-negative integer) */
  stock_quantity?: number;
  /** Low stock warning threshold */
  low_stock_threshold?: number;
  /** Whether the product is currently available for purchase */
  is_available?: boolean;
  /** Stock status label override */
  stock_status?: string;
}

export interface BulkStockUpdate {
  productIds: string[];
  is_available?: boolean;
  stock_status?: string;
}

// ─── Constants (PROMPT 4) ───────────────────────────────────────────────────

/** Maximum stock quantity allowed (prevents integer overflow/abuse). */
const MAX_STOCK_QUANTITY = 999_999;

/** Minimum stock quantity (always 0 — negative values are coerced). */
const MIN_STOCK_QUANTITY = 0;

/** Default low stock threshold. */
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/** Valid stock status strings. */
const VALID_STOCK_STATUSES: readonly string[] = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "unavailable",
  "pre_order",
];

// ─── Validation & Coercion Helpers (PROMPT 4) ───────────────────────────────

/**
 * PROMPT 4: Coerce any input to a non-negative safe integer.
 * This is the core defense against negative inventory values.
 *
 * Rules:
 *  - null/undefined → 0
 *  - negative numbers → 0 (prevent negative stock)
 *  - fractional numbers → floored to integer
 *  - NaN/Infinity → 0
 *  - strings → parsed and coerced
 *  - values > MAX_STOCK_QUANTITY → capped at MAX_STOCK_QUANTITY
 */
function coerceToStockQuantity(value: unknown): number {
  if (value === null || value === undefined) return 0;

  let num: number;
  if (typeof value === "string") {
    // Trim and parse string
    const trimmed = value.trim();
    if (trimmed === "") return 0;
    num = Number(trimmed);
  } else {
    num = Number(value);
  }

  // PROMPT 4: Strict integer coercion
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0; // Negative stock → 0
  if (num > MAX_STOCK_QUANTITY) return MAX_STOCK_QUANTITY;

  // Floor to integer (no fractional stock)
  return Math.floor(num);
}

/**
 * PROMPT 4: Coerce and validate a low-stock threshold value.
 * Must be a non-negative integer between 1 and MAX_STOCK_QUANTITY.
 */
function coerceToThreshold(value: unknown): number {
  const coerced = coerceToStockQuantity(value);
  // Threshold must be at least 1 (zero threshold would mean "never warn")
  return Math.max(1, Math.min(coerced, MAX_STOCK_QUANTITY));
}

/**
 * PROMPT 4: Validate that a boolean representing availability is truly boolean.
 * Coerces truthy/falsy to boolean safely.
 */
function coerceToAvailability(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;
  }
  if (typeof value === "number") return value !== 0;
  return Boolean(value);
}

/**
 * PROMPT 4: Validate stock status string against known valid values.
 * Returns null if invalid, the validated status if valid.
 */
function validateStockStatus(status: unknown): string | null {
  if (!status || typeof status !== "string") return null;
  const lower = status.toLowerCase().trim();
  if (VALID_STOCK_STATUSES.includes(lower)) return lower;
  return null;
}

/**
 * PROMPT 4: Validate product UUID.
 */
function validateProductId(id: unknown): string | null {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!isValidUUID(trimmed)) return null;
  return trimmed;
}

/**
 * PROMPT 4: Derive the correct stock status based on current inventory state.
 * This provides a single source of truth for the UI badge.
 */
function deriveStockStatus(
  isAvailable: boolean,
  stockQuantity: number,
  lowStockThreshold: number,
): InventoryBadge {
  if (!isAvailable) return "unavailable";
  if (stockQuantity <= 0) return "out_of_stock";
  if (stockQuantity <= lowStockThreshold) return "low_stock";
  return "in_stock";
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Determine what inventory badge to display for a product.
 *
 * PROMPT 4: Enhanced to respect actual stock quantities and low-stock thresholds
 * rather than just the binary is_available flag.
 */
export function getInventoryBadge(product: Product): InventoryBadge {
  // Check if product has explicit stock_status
  if (product.stock_status && VALID_STOCK_STATUSES.includes(product.stock_status)) {
    return product.stock_status as InventoryBadge;
  }

  if (!product.is_available) return "unavailable";

  // If product has variants with stock tracking, check the total
  if (product.variants && product.variants.length > 0) {
    let totalStock = 0;
    let totalThreshold = 0;
    let allOutOfStock = true;

    for (const group of product.variants) {
      for (const option of group.options) {
        const optStock = coerceToStockQuantity(option.stock ?? -1);
        if (optStock >= 0) {
          totalStock += optStock;
          totalThreshold += coerceToThreshold(option.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD);
          if (optStock > 0) allOutOfStock = false;
        }
      }
    }

    if (allOutOfStock && totalStock >= 0) return "out_of_stock";
    if (totalStock <= totalThreshold && totalStock > 0) return "low_stock";
    if (totalStock > 0) return "in_stock";
  }

  // Fallback to the basic available flag
  return "in_stock";
}

/**
 * Get human-readable label and styling classes for an inventory badge.
 */
export function getInventoryBadgeConfig(badge: InventoryBadge): {
  label: string;
  bgClass: string;
  textClass: string;
  icon: string;
} {
  switch (badge) {
    case "in_stock":
      return {
        label: "In Stock",
        bgClass: "bg-emerald-100 dark:bg-emerald-900/20",
        textClass: "text-emerald-700 dark:text-emerald-400",
        icon: "✓",
      };
    case "low_stock":
      return {
        label: "Low Stock",
        bgClass: "bg-amber-100 dark:bg-amber-900/20",
        textClass: "text-amber-700 dark:text-amber-400",
        icon: "⚠",
      };
    case "out_of_stock":
      return {
        label: "Out of Stock",
        bgClass: "bg-red-100 dark:bg-red-900/20",
        textClass: "text-red-700 dark:text-red-400",
        icon: "✕",
      };
    case "unavailable":
      return {
        label: "Unavailable",
        bgClass: "bg-zinc-100 dark:bg-zinc-800",
        textClass: "text-zinc-500 dark:text-zinc-400",
        icon: "—",
      };
    case "pre_order":
      return {
        label: "Pre-Order",
        bgClass: "bg-blue-100 dark:bg-blue-900/20",
        textClass: "text-blue-700 dark:text-blue-400",
        icon: "📦",
      };
  }
}

/* -------------------------------------------------------------------------- */
/*  Queries                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Fetch all products for a shop and return their inventory statuses.
 *
 * PROMPT 4: Enhanced to include actual stock quantities and thresholds
 * from both the product level and variant level.
 */
export async function fetchInventoryForShop(
  shopId: string,
): Promise<ServiceResult<InventoryStatus[]>> {
  const sanitizedShopId = validateProductId(shopId);
  if (!sanitizedShopId) {
    return { success: false, error: "Invalid shop ID." };
  }

  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("shop_id", sanitizedShopId)
      .order("name", { ascending: true });

    if (error) throw error;

    const products = (data as Product[]) ?? [];

    // PROMPT 4: Build detailed inventory status for each product
    const statuses: InventoryStatus[] = products.map((p) => {
      // Aggregate stock from variants if available
      let totalStock = -1; // -1 = untracked
      let totalThreshold = DEFAULT_LOW_STOCK_THRESHOLD;

      if (p.variants && p.variants.length > 0) {
        totalStock = 0;
        let hasTrackedVariants = false;

        for (const group of p.variants) {
          for (const option of group.options) {
            const optStock = coerceToStockQuantity(option.stock ?? -1);
            if (option.stock !== undefined && option.stock !== null) {
              hasTrackedVariants = true;
              totalStock += optStock;
              // Use the lowest threshold among variants as the trigger
              const optThreshold = coerceToThreshold(
                option.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
              );
              totalThreshold = Math.min(totalThreshold, optThreshold);
            }
          }
        }

        if (!hasTrackedVariants) {
          totalStock = -1; // No variants had stock tracking
        }
      }

      return {
        product_id: p.id,
        product_name: p.name,
        shop_id: p.shop_id,
        is_available: coerceToAvailability(p.is_available),
        stock_quantity: totalStock,
        low_stock_threshold: totalThreshold,
        stock_status: p.stock_status || deriveStockStatus(
          p.is_available,
          totalStock,
          totalThreshold,
        ),
      };
    });

    return { success: true, data: statuses };
  } catch (err) {
    logError(err, { module: "inventoryService.fetchInventoryForShop", meta: { shopId: sanitizedShopId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Quick check: count how many products in a shop are out of stock.
 */
export async function countOutOfStockProducts(
  shopId: string,
): Promise<ServiceResult<number>> {
  const sanitizedShopId = validateProductId(shopId);
  if (!sanitizedShopId) {
    return { success: false, error: "Invalid shop ID." };
  }

  const supabase = createClient();
  try {
    const { count, error } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", sanitizedShopId)
      .eq("is_available", false);

    if (error) throw error;
    return { success: true, data: coerceToStockQuantity(count) };
  } catch (err) {
    logError(err, { module: "inventoryService.countOutOfStockProducts", meta: { shopId: sanitizedShopId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Check inventory health — returns a summary of products by availability.
 */
export async function getInventoryHealth(
  shopId: string,
): Promise<
  ServiceResult<{
    total: number;
    available: number;
    unavailable: number;
    healthPercent: number;
  }>
> {
  const sanitizedShopId = validateProductId(shopId);
  if (!sanitizedShopId) {
    return { success: false, error: "Invalid shop ID." };
  }

  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("products")
      .select("is_available")
      .eq("shop_id", sanitizedShopId);

    if (error) throw error;

    const products = (data as { is_available: boolean }[]) ?? [];
    const total = products.length;
    const available = products.filter((p) => coerceToAvailability(p.is_available)).length;
    const unavailable = total - available;
    const healthPercent = total > 0
      ? coerceToStockQuantity(Math.round((available / total) * 100))
      : 100;

    return {
      success: true,
      data: { total, available, unavailable, healthPercent },
    };
  } catch (err) {
    logError(err, { module: "inventoryService.getInventoryHealth", meta: { shopId: sanitizedShopId } });
    return { success: false, error: toError(err) };
  }
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Mutations (PROMPT 4: Strict validation)                                     */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Update stock for a single product.
 *
 * PROMPT 4: All inputs undergo strict type coercion and validation.
 *  - stock_quantity: coerced to non-negative integer, capped at MAX_STOCK_QUANTITY
 *  - low_stock_threshold: coerced to safe integer between 1 and MAX_STOCK_QUANTITY
 *  - is_available: coerced to boolean
 *  - stock_status: validated against known statuses
 *
 * Negative values are rejected/prevented — if a negative is submitted,
 * it is coerced to 0 (prevents corrupted inventory).
 */
export async function updateProductStock(
  payload: StockUpdatePayload,
): Promise<ServiceResult<Product>> {
  // PROMPT 4: Validate product ID
  const sanitizedProductId = validateProductId(payload.productId);
  if (!sanitizedProductId) {
    return { success: false, error: "Invalid product ID." };
  }

  // PROMPT 4: Build the update object with ALL fields coerced and validated
  const updateData: Record<string, unknown> = {};

  // Coerce stock quantity
  if (payload.stock_quantity !== undefined) {
    updateData.stock_quantity = coerceToStockQuantity(payload.stock_quantity);
  }

  // Coerce low stock threshold
  if (payload.low_stock_threshold !== undefined) {
    updateData.low_stock_threshold = coerceToThreshold(payload.low_stock_threshold);
  }

  // Coerce availability
  if (payload.is_available !== undefined) {
    updateData.is_available = coerceToAvailability(payload.is_available);
  }

  // Validate stock status
  if (payload.stock_status !== undefined) {
    const validStatus = validateStockStatus(payload.stock_status);
    if (validStatus) {
      updateData.stock_status = validStatus;
    } else if (payload.stock_status !== null && payload.stock_status !== "") {
      // Invalid status provided — reject
      return {
        success: false,
        error: `Invalid stock status: "${payload.stock_status}". Valid values: ${VALID_STOCK_STATUSES.join(", ")}`,
      };
    }
  }

  if (Object.keys(updateData).length === 0) {
    return { success: false, error: "No valid fields to update." };
  }

  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", sanitizedProductId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as Product };
  } catch (err) {
    logError(err, {
      module: "inventoryService.updateProductStock",
      meta: { productId: sanitizedProductId, payload },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Toggle product availability (quick on/off switch).
 *
 * PROMPT 4: Ensures the toggle is strict boolean.
 */
export async function toggleProductAvailability(
  productId: string,
): Promise<ServiceResult<{ is_available: boolean }>> {
  const sanitizedProductId = validateProductId(productId);
  if (!sanitizedProductId) {
    return { success: false, error: "Invalid product ID." };
  }

  const supabase = createClient();
  try {
    // First, get current state
    const { data: current, error: fetchError } = await supabase
      .from("products")
      .select("is_available")
      .eq("id", sanitizedProductId)
      .single();

    if (fetchError) throw fetchError;

    const currentState = coerceToAvailability((current as { is_available: boolean })?.is_available);
    const newState = !currentState;

    const { error: updateError } = await supabase
      .from("products")
      .update({ is_available: newState })
      .eq("id", sanitizedProductId);

    if (updateError) throw updateError;

    return { success: true, data: { is_available: newState } };
  } catch (err) {
    logError(err, {
      module: "inventoryService.toggleProductAvailability",
      meta: { productId: sanitizedProductId },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Bulk update availability status for multiple products.
 *
 * PROMPT 4: Validates each product ID and coerces the availability flag.
 */
export async function bulkUpdateAvailability(
  productIds: string[],
  isAvailable: boolean,
): Promise<ServiceResult<null>> {
  // PROMPT 4: Validate all product IDs
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return { success: false, error: "No product IDs provided." };
  }

  const sanitizedIds = productIds
    .map((id) => validateProductId(id))
    .filter((id): id is string => id !== null);

  if (sanitizedIds.length === 0) {
    return { success: false, error: "No valid product IDs found." };
  }

  // PROMPT 4: Coerce availability to boolean
  const safeAvailability = coerceToAvailability(isAvailable);

  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("products")
      .update({ is_available: safeAvailability })
      .in("id", sanitizedIds);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, {
      module: "inventoryService.bulkUpdateAvailability",
      meta: { productIds: sanitizedIds, isAvailable: safeAvailability },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Bulk update stock status for multiple products.
 *
 * PROMPT 4: Validates stock status string before applying.
 */
export async function bulkUpdateStockStatus(
  productIds: string[],
  stockStatus: string,
): Promise<ServiceResult<null>> {
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return { success: false, error: "No product IDs provided." };
  }

  const sanitizedIds = productIds
    .map((id) => validateProductId(id))
    .filter((id): id is string => id !== null);

  if (sanitizedIds.length === 0) {
    return { success: false, error: "No valid product IDs found." };
  }

  // PROMPT 4: Validate stock status
  const validStatus = validateStockStatus(stockStatus);
  if (!validStatus) {
    return {
      success: false,
      error: `Invalid stock status. Valid values: ${VALID_STOCK_STATUSES.join(", ")}`,
    };
  }

  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("products")
      .update({ stock_status: validStatus })
      .in("id", sanitizedIds);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, {
      module: "inventoryService.bulkUpdateStockStatus",
      meta: { productIds: sanitizedIds, stockStatus: validStatus },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Get low-stock alerts for a merchant's shop.
 * Returns products where stock is at or below threshold (and > 0).
 */
export async function getLowStockAlerts(
  shopId: string,
): Promise<ServiceResult<InventoryStatus[]>> {
  const sanitizedShopId = validateProductId(shopId);
  if (!sanitizedShopId) {
    return { success: false, error: "Invalid shop ID." };
  }

  const result = await fetchInventoryForShop(sanitizedShopId);
  if (!result.success) return result;

  const lowStock = result.data.filter(
    (item) =>
      item.is_available &&
      item.stock_quantity >= 0 &&
      item.stock_quantity <= item.low_stock_threshold &&
      item.stock_quantity > 0,
  );

  return { success: true, data: lowStock };
}

/**
 * Get out-of-stock products for a merchant's shop.
 */
export async function getOutOfStockProducts(
  shopId: string,
): Promise<ServiceResult<InventoryStatus[]>> {
  const sanitizedShopId = validateProductId(shopId);
  if (!sanitizedShopId) {
    return { success: false, error: "Invalid shop ID." };
  }

  const result = await fetchInventoryForShop(sanitizedShopId);
  if (!result.success) return result;

  const outOfStock = result.data.filter(
    (item) => !item.is_available || item.stock_quantity === 0,
  );

  return { success: true, data: outOfStock };
}