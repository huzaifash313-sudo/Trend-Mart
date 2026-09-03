"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Cart Store (Zustand + persist)                                 */
/*                                                                             */
/*  Replaces the old CartContext with a Zustand store so cart state is always  */
/*  available (persisted to localStorage) and components can subscribe         */
/*  selectively. The `useCart()` hook below keeps the exact same API as the    */
/*  old context, so every existing call site keeps working unchanged.          */
/* -------------------------------------------------------------------------- */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PriceTier, Product, Shop } from "@/types";
import { getProductDiscount } from "@/lib/formatters";
import { applyPooledTierPrices } from "@/lib/priceTiers";
import { scopedKey, scopedKeyFor } from "@/lib/clientScope";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface CartItem {
  /** Unique cart entry id (productId + variant + notes key). */
  id: string;
  productId: string;
  shopId: string;
  shopName: string;
  shopWhatsapp: string;
  name: string;
  price: number;
  /** Original single-item price — tiered recompute uses this as the base. */
  basePrice?: number;
  originalPrice?: number | null;
  imageUrl?: string | null;
  quantity: number;
  variant?: string;
  /** Per-item special instructions (spice, flavour, etc.). */
  notes?: string;
  currency?: string;
  /** Compact deep-link code for the direct product page `/p/{code}`. */
  shortCode?: string | null;
  /** Quantity price tiers — unit price recomputes when quantity changes. */
  priceTiers?: PriceTier[] | null;
}

/* ── Sanitization Helpers — Strict Data Validation ─────────────────────────── */

function sanitizeNumber(value: unknown, fallback: number = 0): number {
  if (value === undefined || value === null) return fallback;
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  if (Math.abs(n) > 99_999_999) return fallback;
  return Math.max(0, n);
}

function sanitizeQuantity(value: unknown): number {
  const n = sanitizeNumber(value, 1);
  const int = Math.round(n);
  if (int < 1) return 1;
  if (int > 99) return 99;
  return int;
}

function sanitizePrice(value: unknown): number {
  const n = sanitizeNumber(value, 0);
  return Math.min(n, 99_999_999);
}

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

function sanitizeVariant(input: unknown): string {
  return sanitizeString(input, 220);
}

/** Sanitize persisted price tiers to {min_qty, price, mode} numbers. */
function sanitizePriceTiers(raw: unknown): PriceTier[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PriceTier[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const rec = t as Record<string, unknown>;
    const minQty = Math.round(Number(rec.min_qty) || 0);
    const price = Number(rec.price);
    if (minQty >= 1 && Number.isFinite(price) && price > 0) {
      out.push({
        min_qty: minQty,
        price,
        mode: rec.mode === "unit" ? "unit" : "pack",
      });
    }
  }
  return out.length > 0 ? out : null;
}

function sanitizeCartItem(raw: Record<string, unknown>): CartItem | null {
  const id = sanitizeString(raw.id, 200);
  const productId = sanitizeString(raw.productId, 200);
  const shopId = sanitizeString(raw.shopId, 200);
  const name = sanitizeString(raw.name, 200);

  if (!id || !productId || !shopId || !name) return null;

  const shopName = sanitizeString(raw.shopName, 200);
  const shopWhatsapp = sanitizeString(raw.shopWhatsapp, 50);
  const variant = raw.variant ? sanitizeVariant(raw.variant) : undefined;
  const notes = raw.notes ? sanitizeString(raw.notes, 200) || undefined : undefined;
  const currency = raw.currency ? sanitizeString(raw.currency, 10).toUpperCase() : undefined;

  const price = sanitizePrice(raw.price);
  const basePrice = raw.basePrice != null ? sanitizePrice(raw.basePrice) : price;
  const quantity = sanitizeQuantity(raw.quantity);
  const originalPrice = raw.originalPrice != null ? sanitizePrice(raw.originalPrice) : null;

  const imageUrl = raw.imageUrl ? sanitizeString(raw.imageUrl, 500) : null;
  const shortCode = raw.shortCode ? sanitizeString(raw.shortCode, 32) : null;
  const priceTiers = sanitizePriceTiers(raw.priceTiers);
  if (imageUrl && !/^https?:\/\/.+/i.test(imageUrl)) {
    return {
      id, productId, shopId, shopName, shopWhatsapp, name, price, basePrice, originalPrice,
      imageUrl: null, quantity, variant, notes, currency, shortCode, priceTiers,
    };
  }

  return {
    id,
    productId,
    shopId,
    shopName: shopName || "Unknown Shop",
    shopWhatsapp: shopWhatsapp || "",
    name,
    price,
    basePrice,
    originalPrice,
    imageUrl,
    quantity,
    variant,
    notes,
    currency,
    shortCode,
    priceTiers,
  };
}

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

/* ── Store ─────────────────────────────────────────────────────────────────── */

interface CartState {
  items: CartItem[];
  addItem: (
    product: Product,
    shop: Pick<Shop, "id" | "name" | "whatsapp_number">,
    quantity?: number,
    variant?: string,
    notes?: string,
  ) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  updateItemNotes: (cartItemId: string, notes: string) => void;
  updateItemVariant: (
    cartItemId: string,
    variant: string,
    price: number,
    originalPrice?: number | null,
  ) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      addItem: (product, shop, quantity = 1, variant, notes) => {
        const safeProductId = sanitizeString(product.id, 200);
        const safeShopId = sanitizeString(shop.id, 200);
        const safeShopName = sanitizeString(shop.name, 200);
        const safeShopWhatsapp = sanitizeString(shop.whatsapp_number, 50);
        const safeName = sanitizeString(product.name, 200);
        const safePrice = sanitizePrice(product.price);
        const { originalPrice: discountOriginalPrice } = getProductDiscount(product);
        const safeOriginalPrice =
          discountOriginalPrice != null ? sanitizePrice(discountOriginalPrice) : null;
        const safeQuantity = sanitizeQuantity(quantity);
        const safeVariant = variant ? sanitizeVariant(variant) : undefined;
        const safeNotes = notes ? sanitizeString(notes, 200) || undefined : undefined;
        const safeCurrency = product.currency
          ? sanitizeString(product.currency, 10).toUpperCase()
          : undefined;
        const validCurrency =
          safeCurrency && /^[A-Z]{3}$/.test(safeCurrency) ? safeCurrency : undefined;
        const safeShortCode = product.short_code
          ? sanitizeString(product.short_code, 32)
          : null;
        const safePriceTiers = sanitizePriceTiers(product.price_tiers);

        if (!safeProductId || !safeShopId || !safeName) return;

        let safeImageUrl: string | null = null;
        if (product.image_url) {
          const rawUrl = sanitizeString(product.image_url, 500);
          if (/^https?:\/\/.+/i.test(rawUrl)) safeImageUrl = rawUrl;
        }

        set((state) => {
          const variantSuffix = safeVariant ? `-${safeVariant.replace(/\s+/g, "-")}` : "";
          const notesSuffix = safeNotes
            ? `-n-${safeNotes.slice(0, 24).replace(/\s+/g, "-")}`
            : "";
          const cartId = `${safeProductId}${variantSuffix}${notesSuffix}`;

          const existing = state.items.find((i) => i.id === cartId);
          if (existing) {
            const mergedQty = Math.min(99, existing.quantity + safeQuantity);
            return {
              items: applyPooledTierPrices(
                state.items.map((i) =>
                  i.id === cartId
                    ? {
                        ...i,
                        quantity: mergedQty,
                        price: safePrice,
                        basePrice: safePrice,
                        priceTiers: safePriceTiers ?? i.priceTiers,
                      }
                    : i,
                ),
              ),
            };
          }

          return {
            items: applyPooledTierPrices([
              ...state.items,
              {
                id: cartId,
                productId: safeProductId,
                shopId: safeShopId,
                shopName: safeShopName || "Unknown Shop",
                shopWhatsapp: safeShopWhatsapp || "",
                name: safeName,
                price: safePrice,
                basePrice: safePrice,
                originalPrice: safeOriginalPrice,
                imageUrl: safeImageUrl,
                quantity: safeQuantity,
                variant: safeVariant,
                notes: safeNotes,
                currency: validCurrency,
                shortCode: safeShortCode,
                priceTiers: safePriceTiers,
              },
            ]),
          };
        });
      },

      removeItem: (cartItemId) => {
        if (!cartItemId || typeof cartItemId !== "string") return;
        set((state) => ({
          items: applyPooledTierPrices(state.items.filter((i) => i.id !== cartItemId)),
        }));
      },

      updateQuantity: (cartItemId, quantity) => {
        if (!cartItemId || typeof cartItemId !== "string") return;
        const safeQuantity = sanitizeQuantity(quantity);
        if (safeQuantity < 1) {
          set((state) => ({ items: state.items.filter((i) => i.id !== cartItemId) }));
          return;
        }
        set((state) => ({
          items: applyPooledTierPrices(
            state.items.map((i) =>
              i.id === cartItemId
                ? {
                    ...i,
                    quantity: safeQuantity,
                  }
                : i,
            ),
          ),
        }));
      },

      updateItemNotes: (cartItemId, notes) => {
        if (!cartItemId || typeof cartItemId !== "string") return;
        const safeNotes = sanitizeString(notes, 200);
        set((state) => ({
          items: state.items.map((i) =>
            i.id === cartItemId ? { ...i, notes: safeNotes || undefined } : i,
          ),
        }));
      },

      updateItemVariant: (cartItemId, variant, price, originalPrice) => {
        if (!cartItemId || typeof cartItemId !== "string") return;
        const safeVariant = variant ? sanitizeVariant(variant) : undefined;
        const safePrice = sanitizePrice(price);
        const safeOriginal =
          originalPrice != null ? sanitizePrice(originalPrice) : null;
        set((state) => ({
          items: applyPooledTierPrices(
            state.items.map((i) =>
              i.id === cartItemId
                ? {
                    ...i,
                    variant: safeVariant,
                    price: safePrice,
                    basePrice: safePrice,
                    originalPrice: safeOriginal,
                  }
                : i,
            ),
          ),
        }));
      },

      clearCart: () => {
        set({ items: [] });
        try {
          if (typeof window !== "undefined") {
            useCartStore.persist.clearStorage();
            // Legacy flat key from pre-namespacing builds.
            localStorage.removeItem("trendsmart_cart");
          }
        } catch {
          /* ignore */
        }
      },
    }),
    {
      name: "trendsmart_cart",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          // SSR-safe no-op storage — hydration only happens on the client.
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          } as unknown as Storage;
        }
        // Per-account storage: every read/write targets the current account's
        // namespaced key (`trendsmart_cart:u_<id>` or `trendsmart_cart:guest`)
        // so switching accounts never leaks or overwrites another account.
        const scoped = {
          getItem: (name: string) => {
            try {
              return window.localStorage.getItem(scopedKey(name));
            } catch {
              return null;
            }
          },
          setItem: (name: string, value: string) => {
            try {
              window.localStorage.setItem(scopedKey(name), value);
            } catch {
              /* storage full / unavailable */
            }
          },
          removeItem: (name: string) => {
            try {
              window.localStorage.removeItem(scopedKey(name));
            } catch {
              /* ignore */
            }
          },
        };
        return scoped as unknown as Storage;
      }),
      partialize: (state) => ({ items: state.items }),
      merge: (persisted, current) => {
        const rawItems = (persisted as { items?: unknown } | undefined)?.items;
        return { ...current, items: applyPooledTierPrices(sanitizeCartItems(rawItems)) };
      },
    },
  ),
);

/* ── Compat hook (same shape as the old useCart) ───────────────────────────── */

export function useCart() {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const updateItemNotes = useCartStore((s) => s.updateItemNotes);
  const updateItemVariant = useCartStore((s) => s.updateItemVariant);
  const clearCart = useCartStore((s) => s.clearCart);

  const totalItems = items.reduce((sum, i) => sum + sanitizeQuantity(i.quantity), 0);
  const totalAmount = items.reduce((sum, i) => {
    const qty = sanitizeQuantity(i.quantity);
    const price = sanitizePrice(i.price);
    const lineTotal = price * qty;
    return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
  }, 0);

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    updateItemNotes,
    updateItemVariant,
    clearCart,
    totalItems,
    totalAmount,
  };
}

/* ── Per-account scope helpers ─────────────────────────────────────────────── */

/**
 * Called whenever the owning account changes (sign-in / sign-out / switch).
 * Re-reads the persisted cart from the new account's namespaced key so the UI
 * immediately shows the right cart without leaking the previous account's.
 */
export function refreshCartForScope(): void {
  try {
    void useCartStore.persist.rehydrate();
  } catch {
    /* ignore */
  }
}

/**
 * Guest → signed-in hand-off: carry the anonymous cart over into the user's
 * bucket. Existing user items are preserved; guest-only lines are appended.
 */
export function migrateGuestCartToUserBucket(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  const guestKey = scopedKeyFor("trendsmart_cart", "guest");
  const userKey = scopedKeyFor("trendsmart_cart", `u_${userId}`);
  try {
    const guestRaw = window.localStorage.getItem(guestKey);
    if (guestRaw === null) return;

    const userRaw = window.localStorage.getItem(userKey);
    if (userRaw === null) {
      window.localStorage.setItem(userKey, guestRaw);
      window.localStorage.removeItem(guestKey);
      return;
    }

    const guestState = JSON.parse(guestRaw) as {
      state?: { items?: unknown };
      version?: number;
    };
    const userState = JSON.parse(userRaw) as {
      state?: { items?: unknown };
      version?: number;
    };
    const guestItems = sanitizeCartItems(guestState?.state?.items);
    const userItems = sanitizeCartItems(userState?.state?.items);
    if (guestItems.length === 0) return;

    const existingIds = new Set(userItems.map((i) => i.id));
    const merged = [...userItems, ...guestItems.filter((i) => !existingIds.has(i.id))];
    window.localStorage.setItem(
      userKey,
      JSON.stringify({ state: { items: merged }, version: userState?.version ?? 0 }),
    );
    window.localStorage.removeItem(guestKey);
  } catch {
    /* ignore */
  }
}
