"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Dedicated Cart Page (/cart)                                     */
/*                                                                             */
/*  A full-screen view of the cart (the bottom CartBar is a compact peek).     */
/*  Cart state is client-side (localStorage via the Zustand store), so this    */
/*  page works for guests and signed-in users alike. Items are grouped per     */
/*  shop because each shop checks out separately through WhatsApp.             */
/* -------------------------------------------------------------------------- */

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart, type CartItem } from "@/context/CartContext";
import { formatRupees } from "@/lib/formatters";
import { computeVariantPricing } from "@/lib/variantPricing";
import VariantSelector from "@/components/VariantSelector";
import { createClient } from "@/lib/supabase/client";
import type { VariantGroup } from "@/types";
import WhatsAppCheckoutModal, {
  type WhatsAppCartItem,
} from "@/components/WhatsAppCheckoutModal";
import type { Shop } from "@/types";
import { fetchShopById } from "@/services/shopService";
import { useConfirm } from "@/components/ConfirmProvider";

/* ── Icons ─────────────────────────────────────────────────────────────────── */

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function StoreIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.12-5.6A1 1 0 0 1 5.1 3h13.8a1 1 0 0 1 .98.8L21 9" /><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /><path d="M9 21V9h6v12" />
    </svg>
  );
}
function CartIcon() {
  return (
    <svg className="h-14 w-14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}
function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

/* ── Shop grouping ───────────────────────────────────────────────────────────── */

interface ShopGroup {
  shopId: string;
  shopName: string;
  shopWhatsapp: string;
  items: CartItem[];
  subtotal: number;
}

function groupItemsByShop(items: CartItem[]): ShopGroup[] {
  const map = new Map<string, ShopGroup>();
  for (const item of items) {
    if (!map.has(item.shopId)) {
      map.set(item.shopId, {
        shopId: item.shopId,
        shopName: item.shopName,
        shopWhatsapp: item.shopWhatsapp,
        items: [],
        subtotal: 0,
      });
    }
    const group = map.get(item.shopId)!;
    group.items.push(item);
    group.subtotal += item.price * item.quantity;
  }
  return Array.from(map.values());
}

function stubShopFromGroup(group: ShopGroup): Shop {
  return {
    id: group.shopId,
    name: group.shopName,
    whatsapp_number: group.shopWhatsapp,
    location: "",
  } as Shop;
}

/** Authoritative variant metadata for a cart product. */
interface CartVariantData {
  price: number;
  originalPrice: number | null;
  variants: VariantGroup[];
}

/** Convert a "Group: Label · Group: Label" string into `SelectedVariant[]`. */
function labelToSelection(label?: string): { groupName: string; optionLabel: string; priceAdj: number }[] {
  if (!label) return [];
  return label
    .split(/\s*·\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx > 0) {
        return {
          groupName: part.slice(0, idx).trim(),
          optionLabel: part.slice(idx + 1).trim(),
          priceAdj: 0,
        };
      }
      return { groupName: "", optionLabel: part, priceAdj: 0 };
    });
}

/** Whether a variant label selects every group of a product's variant set. */
function isVariantComplete(variants: VariantGroup[], label?: string): boolean {
  if (!variants || variants.length === 0) return true;
  if (!label) return false;
  const selectedGroups = labelToSelection(label)
    .map((s) => s.groupName)
    .filter(Boolean);
  // Legacy labels without "Group: " prefixes can't be verified per-group.
  if (selectedGroups.length === 0) return true;
  return variants.every((g) => selectedGroups.includes(g.name));
}

/** True when a cart item still needs an option picked before checkout. */
function itemNeedsVariant(
  item: CartItem,
  variantData: Record<string, CartVariantData>,
): boolean {
  const data = variantData[item.productId];
  if (!data || data.variants.length === 0) return false;
  return !isVariantComplete(data.variants, item.variant);
}

/* ── Page ────────────────────────────────────────────────────────────────────── */

export default function CartPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const {
    items,
    removeItem,
    updateQuantity,
    updateItemNotes,
    updateItemVariant,
    totalItems,
    totalAmount,
    clearCart,
  } = useCart();

  const [checkoutShop, setCheckoutShop] = useState<ShopGroup | null>(null);
  const [resolvedShop, setResolvedShop] = useState<Shop | null>(null);
  const [variantData, setVariantData] = useState<Record<string, CartVariantData>>({});
  const [variantOpenId, setVariantOpenId] = useState<string | null>(null);

  const shopGroups = useMemo(() => groupItemsByShop(items), [items]);

  // Fetch variant metadata for products that carry options so the cart can
  // let shoppers pick/change size/color/etc. inline before checkout.
  useEffect(() => {
    let cancelled = false;
    const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
    if (productIds.length === 0) return;
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, price, original_price, compare_at_price, variants")
        .in("id", productIds);
      if (cancelled || error || !data) return;
      const map: Record<string, CartVariantData> = {};
      for (const row of data as Record<string, unknown>[]) {
        const variants = Array.isArray(row.variants)
          ? (row.variants as VariantGroup[])
          : [];
        if (variants.length === 0) continue;
        const original =
          typeof row.original_price === "number"
            ? row.original_price
            : typeof row.compare_at_price === "number"
              ? row.compare_at_price
              : null;
        map[String(row.id)] = {
          price: Number(row.price) || 0,
          originalPrice: original != null && original > 0 ? original : null,
          variants,
        };
      }
      setVariantData(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  // Load the full shop row (radius / hours / delivery rules) for checkout.
  useEffect(() => {
    if (!checkoutShop) {
      setResolvedShop(null);
      return;
    }
    let cancelled = false;
    setResolvedShop(stubShopFromGroup(checkoutShop));
    void fetchShopById(checkoutShop.shopId).then((res) => {
      if (cancelled) return;
      if (res.success && res.data.shop) {
        setResolvedShop({
          ...res.data.shop,
          whatsapp_number: res.data.shop.whatsapp_number || checkoutShop.shopWhatsapp,
          name: res.data.shop.name || checkoutShop.shopName,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [checkoutShop]);

  const handleClear = useCallback(async () => {
    if (!(await confirm("Clear your entire cart?"))) return;
    clearCart();
  }, [confirm, clearCart]);

  const checkoutItems: WhatsAppCartItem[] = (checkoutShop?.items ?? []).map((i) => ({
    id: i.id,
    productId: i.productId,
    shopId: i.shopId,
    name: i.name,
    price: i.basePrice ?? i.price,
    basePrice: i.basePrice ?? i.price,
    imageUrl: i.imageUrl,
    quantity: i.quantity,
    variant: i.variant,
    notes: i.notes,
    currency: i.currency,
    originalPrice: i.originalPrice ?? undefined,
    shortCode: i.shortCode ?? undefined,
    priceTiers: i.priceTiers ?? null,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Go back"
          >
            <ChevronLeftIcon />
          </button>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Your Cart{totalItems > 0 ? ` (${totalItems})` : ""}
          </h1>
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto rounded-full px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Clear all
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-28">
        {items.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 text-zinc-300 dark:text-zinc-600">
              <CartIcon />
            </div>
            <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">
              Your cart is empty
            </p>
            <p className="mt-1 max-w-xs text-sm text-zinc-400 dark:text-zinc-500">
              Browse shops, deals and products, then add items to build your order.
            </p>
            <Link
              href="/"
              className="mt-6 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {shopGroups.length > 1 && (
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {shopGroups.length} shops — each shop checks out separately via WhatsApp.
              </p>
            )}

            {shopGroups.map((group) => (
              <section
                key={group.shopId}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                {/* Shop header */}
                <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    <StoreIcon />
                  </span>
                  <Link
                    href={`/shop/${group.shopId}`}
                    className="truncate text-sm font-bold text-zinc-800 hover:underline dark:text-zinc-200"
                  >
                    {group.shopName || "Shop"}
                  </Link>
                  <span className="ml-auto text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {formatRupees(group.subtotal)}
                  </span>
                </div>

                {/* Items */}
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {group.items.map((item) => (
                    <li key={item.id} className="flex gap-3 px-4 py-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-lg font-bold text-zinc-400">
                            {item.name.charAt(0)}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {item.name}
                        </p>
                        {item.variant && (
                          <p className="truncate text-xs text-zinc-400">{item.variant}</p>
                        )}
                        <p className="mt-0.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {formatRupees(item.price)}
                          {item.originalPrice && item.originalPrice > item.price ? (
                            <span className="ml-2 text-xs font-normal text-zinc-400 line-through">
                              {formatRupees(item.originalPrice)}
                            </span>
                          ) : null}
                        </p>

                        {/* Inline variant picker */}
                        {(() => {
                          const data = variantData[item.productId];
                          if (!data || data.variants.length === 0) return null;
                          const open = variantOpenId === item.id;
                          return (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setVariantOpenId(open ? null : item.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                              >
                                {item.variant ? "Change options" : "Select options"}
                                {itemNeedsVariant(item, variantData) && (
                                  <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">
                                    Required
                                  </span>
                                )}
                              </button>
                              {open && (
                                <div className="mt-1.5">
                                  <VariantSelector
                                    variants={data.variants}
                                    basePrice={data.price}
                                    baseOriginalPrice={data.originalPrice}
                                    initialSelection={labelToSelection(item.variant)}
                                    onSelectionChange={(sel) => {
                                      const label = sel
                                        .map((v) => `${v.groupName}: ${v.optionLabel}`)
                                        .join(" · ");
                                      const { price, originalPrice } = computeVariantPricing(
                                        data.price,
                                        data.originalPrice,
                                        data.variants,
                                        label,
                                      );
                                      updateItemVariant(
                                        item.id,
                                        label,
                                        price,
                                        originalPrice,
                                      );
                                    }}
                                    compact
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <input
                          type="text"
                          value={item.notes ?? ""}
                          onChange={(e) => updateItemNotes(item.id, e.target.value)}
                          placeholder="Note (flavour, spice, size…)"
                          maxLength={200}
                          className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-700 placeholder:text-zinc-300/60 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          aria-label={`Note for ${item.name}`}
                        />
                      </div>

                      {/* Qty controls */}
                      <div className="flex shrink-0 flex-col items-end justify-between">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              item.quantity <= 1
                                ? removeItem(item.id)
                                : updateQuantity(item.id, item.quantity - 1)
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            aria-label={item.quantity <= 1 ? `Remove ${item.name}` : `Decrease ${item.name}`}
                          >
                            {item.quantity <= 1 ? <TrashIcon /> : <MinusIcon />}
                          </button>
                          <span className="w-6 text-center text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            disabled={item.quantity >= 99}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            aria-label={`Increase ${item.name}`}
                          >
                            <PlusIcon />
                          </button>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                          {formatRupees(item.price * item.quantity)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Shop checkout */}
                <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Subtotal:{" "}
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      {formatRupees(group.subtotal)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCheckoutShop(group)}
                    disabled={group.items.some((i) => itemNeedsVariant(i, variantData))}
                    className="rounded-full bg-wa-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-wa-600/25 transition-all hover:bg-wa-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {group.items.some((i) => itemNeedsVariant(i, variantData))
                      ? "Select options first"
                      : "Order via WhatsApp"}
                  </button>
                </div>
              </section>
            ))}

            {/* Grand total */}
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Total ({totalItems} item{totalItems === 1 ? "" : "s"})
                </span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {formatRupees(totalAmount)}
                </span>
              </div>
              <Link
                href="/"
                className="mt-3 block text-center text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                + Continue shopping
              </Link>
            </div>
          </div>
        )}
      </main>

      {checkoutShop && resolvedShop && (
        <WhatsAppCheckoutModal
          items={checkoutItems}
          shop={resolvedShop}
          onClose={() => setCheckoutShop(null)}
          onOrderPlaced={() => {
            const toRemove = checkoutShop.items.map((i) => i.id);
            setCheckoutShop(null);
            toRemove.forEach((id) => removeItem(id));
          }}
        />
      )}
    </div>
  );
}
