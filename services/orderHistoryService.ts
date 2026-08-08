/* -------------------------------------------------------------------------- */
/*  TrendMart — Client-Side Order History Tracker (localStorage)                */
/*  (Prompt 1) All records are sanitized before storage to prevent XSS.         */
/* -------------------------------------------------------------------------- */

import { sanitizeLight, truncate, sanitizeNumeric } from "@/lib/sanitization";

export interface LocalOrderRecord {
  /** Unique reference ID (auto-generated or from Supabase). */
  id: string;
  shopId: string;
  shopName: string;
  productName: string;
  quantity: number;
  totalAmount: number;
  discountAmount: number;
  couponCode: string;
  notes: string;
  timestamp: string;
}

const STORAGE_KEY = "trendmart_order_history";

// ─── Field length constraints ────────────────────────────────────────────────

const MAX_SHOP_NAME = 100;
const MAX_PRODUCT_NAME = 200;
const MAX_COUPON_CODE = 30;
const MAX_NOTES = 500;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getStoredOrders(): LocalOrderRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Type-validate the stored array before returning
    if (!Array.isArray(parsed)) return [];
    // Validate each record has the required shape; drop malformed entries
    return parsed.filter(
      (item: unknown): item is LocalOrderRecord =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).id === "string" &&
        typeof (item as Record<string, unknown>).shopId === "string",
    );
  } catch {
    return [];
  }
}

function persistOrders(orders: LocalOrderRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    // Keep last 50 orders
    const trimmed = orders.slice(-50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full or disabled — silently ignore
  }
}

/**
 * Sanitize a raw order payload before persisting.
 * - Strips HTML/script tags from all string fields
 * - Truncates fields to max lengths
 * - Validates numeric ranges
 * - Sanitizes coupon code (alphanumeric + hyphens only)
 */
function sanitizeOrderParams(
  params: Omit<LocalOrderRecord, "id" | "timestamp">,
): Omit<LocalOrderRecord, "id" | "timestamp"> {
  return {
    shopId: truncate(sanitizeLight(params.shopId), 50),
    shopName: truncate(sanitizeLight(params.shopName), MAX_SHOP_NAME),
    productName: truncate(sanitizeLight(params.productName), MAX_PRODUCT_NAME),
    quantity: sanitizeNumeric(params.quantity, 1, 999, 1),
    totalAmount: sanitizeNumeric(params.totalAmount, 0, 99_999_999, 0),
    discountAmount: sanitizeNumeric(params.discountAmount, 0, 99_999_999, 0),
    couponCode: truncate(
      sanitizeLight(params.couponCode).replace(/[^A-Z0-9_-]/gi, "").toUpperCase(),
      MAX_COUPON_CODE,
    ),
    notes: truncate(sanitizeLight(params.notes), MAX_NOTES),
  };
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Save a new order record after a WhatsApp order is placed.
 * All input fields are sanitized before storage to prevent XSS.
 * Returns the saved record with a generated ID.
 */
export function saveOrderRecord(
  params: Omit<LocalOrderRecord, "id" | "timestamp">,
): LocalOrderRecord {
  const sanitized = sanitizeOrderParams(params);
  const orders = getStoredOrders();
  const record: LocalOrderRecord = {
    ...sanitized,
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : `ord_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
  };
  orders.push(record);
  persistOrders(orders);
  return record;
}

/**
 * Retrieve all locally stored order records, newest first.
 * Only returns structurally valid records (malformed entries are skipped).
 */
export function getOrderHistory(): LocalOrderRecord[] {
  return getStoredOrders().reverse();
}

/**
 * Retrieve orders for a specific shop.
 * Validates shopId is a non-empty string before filtering.
 */
export function getOrdersByShop(shopId: string): LocalOrderRecord[] {
  if (!shopId || typeof shopId !== "string") return [];
  return getStoredOrders()
    .filter((o) => o.shopId === shopId)
    .reverse();
}

/**
 * Clear a specific record by ID.
 */
export function deleteOrderRecord(orderId: string): boolean {
  if (!orderId || typeof orderId !== "string") return false;
  const orders = getStoredOrders();
  const filtered = orders.filter((o) => o.id !== orderId);
  if (filtered.length === orders.length) return false;
  persistOrders(filtered);
  return true;
}

/**
 * Clear entire order history.
 */
export function clearOrderHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get the count of locally stored orders.
 * Only counts structurally valid entries.
 */
export function getOrderHistoryCount(): number {
  return getStoredOrders().length;
}
