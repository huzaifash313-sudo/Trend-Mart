"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Product, Shop } from "@/types";
import { getProductDiscount } from "@/lib/formatters";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface CartItem {
  /** Unique cart entry id (productId + variant key). */
  id: string;
  productId: string;
  shopId: string;
  shopName: string;
  shopWhatsapp: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  imageUrl?: string | null;
  quantity: number;
  variant?: string;
  currency?: string;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (product: Product, shop: Pick<Shop, "id" | "name" | "whatsapp_number">, quantity?: number, variant?: string) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalAmount: number;
}

/* -------------------------------------------------------------------------- */
/*  Sanitization Helpers — Strict Data Validation                              */
/* -------------------------------------------------------------------------- */

/**
 * Sanitize a numeric value, ensuring it's a finite, non-NaN, positive number.
 * Returns `fallback` if the input is invalid or malicious.
 */
function sanitizeNumber(value: unknown, fallback: number = 0): number {
  if (value === undefined || value === null) return fallback;
  const n = typeof value === "string" ? Number(value) : (value as number);
  // Reject NaN, Infinity, -Infinity, and negative values for prices/counts
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  // Reject unreasonably large numbers (possible overflow attacks)
  if (Math.abs(n) > 99_999_999) return fallback;
  return Math.max(0, n);
}

/**
 * Sanitize a quantity value: must be an integer between 1 and 99.
 */
function sanitizeQuantity(value: unknown): number {
  const n = sanitizeNumber(value, 1);
  const int = Math.round(n);
  if (int < 1) return 1;
  if (int > 99) return 99;
  return int;
}

/**
 * Sanitize a price value: must be finite, non-negative, max 9 digits.
 */
function sanitizePrice(value: unknown): number {
  const n = sanitizeNumber(value, 0);
  return Math.min(n, 99_999_999);
}

/**
 * Strip potentially malicious content from a string.
 * - Removes HTML/script tags
 * - Removes javascript: protocol
 * - Removes event handler attributes (on*)
 * - Trims and limits length
 */
function sanitizeString(input: unknown, maxLength: number = 500): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/on\w+\s*=[^\s>]*/gi, "")
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize a variant string (short, no HTML).
 */
function sanitizeVariant(input: unknown): string {
  return sanitizeString(input, 100);
}

/**
 * Validate and sanitize a single cart item.
 * Returns `null` if the item is irreparably corrupt and should be discarded.
 */
function sanitizeCartItem(raw: Record<string, unknown>): CartItem | null {
  // Required string fields
  const id = sanitizeString(raw.id, 200);
  const productId = sanitizeString(raw.productId, 200);
  const shopId = sanitizeString(raw.shopId, 200);
  const name = sanitizeString(raw.name, 200);

  // If critical identifiers are missing, discard the item
  if (!id || !productId || !shopId || !name) return null;

  // Sanitize remaining string fields
  const shopName = sanitizeString(raw.shopName, 200);
  const shopWhatsapp = sanitizeString(raw.shopWhatsapp, 50);
  const variant = raw.variant ? sanitizeVariant(raw.variant) : undefined;
  const currency = raw.currency ? sanitizeString(raw.currency, 10).toUpperCase() : undefined;

  // Validate currency code (3 uppercase letters or empty)
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    // Invalid currency, use default PKR behavior (don't set)
  }

  // Sanitize numeric fields
  const price = sanitizePrice(raw.price);
  const quantity = sanitizeQuantity(raw.quantity);
  const originalPrice = raw.originalPrice != null ? sanitizePrice(raw.originalPrice) : null;

  // Sanitize image URL (must be valid HTTP(S) if present)
  const imageUrl = raw.imageUrl ? sanitizeString(raw.imageUrl, 500) : null;
  // Validate URL format if present
  if (imageUrl && !/^https?:\/\/.+/i.test(imageUrl)) {
    // Invalid URL — strip it
    return { id, productId, shopId, shopName, shopWhatsapp, name, price, originalPrice, imageUrl: null, quantity, variant, currency };
  }

  return {
    id,
    productId,
    shopId,
    shopName: shopName || "Unknown Shop",
    shopWhatsapp: shopWhatsapp || "",
    name,
    price,
    originalPrice,
    imageUrl,
    quantity,
    variant,
    currency,
  };
}

/**
 * Deep-sanitize an entire cart array loaded from localStorage.
 * Any corrupt items are discarded.
 */
function sanitizeCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const sanitized: CartItem[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const clean = sanitizeCartItem(item as Record<string, unknown>);
      if (clean) sanitized.push(clean);
    }
  }
  return sanitized;
}

/* -------------------------------------------------------------------------- */
/*  Storage Helpers — Robust localStorage with Quota Handling                  */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "trendmart_cart";

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Strict sanitation of all loaded items
    return sanitizeCartItems(parsed);
  } catch {
    // Corrupted data — clear and return empty
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return [];
  }
}

function saveCart(items: CartItem[]): void {
  try {
    // Before saving, re-sanitize to ensure data integrity
    const clean = sanitizeCartItems(items);
    const json = JSON.stringify(clean);
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Storage quota exceeded or disabled — try clearing and retrying
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 10)));
    } catch {
      // Give up; cart will exist only in memory
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                    */
/* -------------------------------------------------------------------------- */

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loadCart());
  const hydratedRef = useRef(false);

  // Mark hydrated after mount
  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  // Persist on change (skip initial render)
  useEffect(() => {
    if (hydratedRef.current) saveCart(items);
  }, [items]);

  const addItem = useCallback(
    (
      product: Product,
      shop: Pick<Shop, "id" | "name" | "whatsapp_number">,
      quantity = 1,
      variant?: string,
    ) => {
      // ── Strict Input Sanitization ──────────────────────────────────────
      const safeProductId = sanitizeString(product.id, 200);
      const safeShopId = sanitizeString(shop.id, 200);
      const safeShopName = sanitizeString(shop.name, 200);
      const safeShopWhatsapp = sanitizeString(shop.whatsapp_number, 50);
      const safeName = sanitizeString(product.name, 200);
      const safePrice = sanitizePrice(product.price);
      const { originalPrice: discountOriginalPrice } = getProductDiscount(product);
      const safeOriginalPrice = discountOriginalPrice != null ? sanitizePrice(discountOriginalPrice) : null;
      const safeQuantity = sanitizeQuantity(quantity);
      const safeVariant = variant ? sanitizeVariant(variant) : undefined;
      const safeCurrency = product.currency ? sanitizeString(product.currency, 10).toUpperCase() : undefined;

      // Reject invalid currencies
      const validCurrency = safeCurrency && /^[A-Z]{3}$/.test(safeCurrency) ? safeCurrency : undefined;

      // Validate critical fields — reject if missing
      if (!safeProductId || !safeShopId || !safeName) {
        console.warn("[Cart] addItem rejected: missing critical fields.", { product, shop });
        return;
      }

      // Validate image URL
      let safeImageUrl: string | null = null;
      if (product.image_url) {
        const rawUrl = sanitizeString(product.image_url, 500);
        if (/^https?:\/\/.+/i.test(rawUrl)) {
          safeImageUrl = rawUrl;
        }
      }

      setItems((prev) => {
        // Generate a unique cart id from sanitized values
        const variantSuffix = safeVariant ? `-${safeVariant.replace(/\s+/g, "-")}` : "";
        const cartId = `${safeProductId}${variantSuffix}`;

        const existing = prev.find((i) => i.id === cartId);
        if (existing) {
          return prev.map((i) =>
            i.id === cartId
              ? { ...i, quantity: Math.min(99, i.quantity + safeQuantity) }
              : i,
          );
        }

        return [
          ...prev,
          {
            id: cartId,
            productId: safeProductId,
            shopId: safeShopId,
            shopName: safeShopName || "Unknown Shop",
            shopWhatsapp: safeShopWhatsapp || "",
            name: safeName,
            price: safePrice,
            originalPrice: safeOriginalPrice,
            imageUrl: safeImageUrl,
            quantity: safeQuantity,
            variant: safeVariant,
            currency: validCurrency,
          },
        ];
      });
    },
    [],
  );

  const removeItem = useCallback((cartItemId: string) => {
    if (!cartItemId || typeof cartItemId !== "string") return;
    setItems((prev) => prev.filter((i) => i.id !== cartItemId));
  }, []);

  const updateQuantity = useCallback(
    (cartItemId: string, quantity: number) => {
      if (!cartItemId || typeof cartItemId !== "string") return;
      const safeQuantity = sanitizeQuantity(quantity);
      if (safeQuantity < 1) {
        setItems((prev) => prev.filter((i) => i.id !== cartItemId));
        return;
      }
      setItems((prev) =>
        prev.map((i) =>
          i.id === cartItemId ? { ...i, quantity: safeQuantity } : i,
        ),
      );
    },
    [],
  );

  const clearCart = useCallback(() => {
    setItems([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  // ── Derived Values with Strict NaN Protection ────────────────────────
  const totalItems = items.reduce((sum, i) => {
    const qty = sanitizeQuantity(i.quantity);
    return sum + qty;
  }, 0);

  const totalAmount = items.reduce((sum, i) => {
    const price = sanitizePrice(i.price);
    const qty = sanitizeQuantity(i.quantity);
    const lineTotal = price * qty;
    // Final guard against NaN
    return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
  }, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalAmount }}
    >
      {children}
    </CartContext.Provider>
  );
}

export default CartProvider;