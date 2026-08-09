"use client";

import { useState, useMemo } from "react";
import { useCart, type CartItem } from "@/context/CartContext";
import { formatRupees } from "@/lib/formatters";
import WhatsAppCheckoutModal from "@/components/WhatsAppCheckoutModal";
import type { WhatsAppCartItem } from "@/components/WhatsAppCheckoutModal";
import type { Shop } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Inline Icons                                                               */
/* -------------------------------------------------------------------------- */

function CartIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.12-5.6A1 1 0 0 1 5.1 3h13.8a1 1 0 0 1 .98.8L21 9" /><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /><path d="M9 21V9h6v12" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shop Group Helper                                                           */
/* -------------------------------------------------------------------------- */

interface ShopGroup {
  shopId: string;
  shopName: string;
  shopWhatsapp: string;
  items: CartItem[];
  subtotal: number;
}

/** Group cart items by shop_id for per-shop checkout. */
function groupItemsByShop(items: CartItem[]): ShopGroup[] {
  const map = new Map<string, ShopGroup>();
  for (const item of items) {
    const key = item.shopId;
    if (!map.has(key)) {
      map.set(key, {
        shopId: item.shopId,
        shopName: item.shopName,
        shopWhatsapp: item.shopWhatsapp,
        items: [],
        subtotal: 0,
      });
    }
    const group = map.get(key)!;
    group.items.push(item);
    group.subtotal += item.price * item.quantity;
  }
  return Array.from(map.values());
}

/* -------------------------------------------------------------------------- */
/*  CartBar Component                                                          */
/* -------------------------------------------------------------------------- */

export default function CartBar() {
  const { items, removeItem, updateQuantity, totalItems, totalAmount, clearCart } = useCart();
  const [expanded, setExpanded] = useState(false);
  const [checkoutShop, setCheckoutShop] = useState<ShopGroup | null>(null);

  // Group items by shop
  const shopGroups = useMemo(() => groupItemsByShop(items), [items]);

  if (totalItems === 0) return null;

  // Build checkout items for the selected shop group
  const checkoutItems: WhatsAppCartItem[] = (checkoutShop?.items ?? []).map((i) => ({
    id: i.id,
    productId: i.productId,
    shopId: i.shopId,
    name: i.name,
    price: i.price,
    imageUrl: i.imageUrl,
    quantity: i.quantity,
    variant: i.variant,
    currency: i.currency,
    originalPrice: i.originalPrice ?? undefined,
  }));

  return (
    <>
      {/* ── Floating Cart Bar ─────────────────────────────────────────── */}
      <div className="fixed bottom-16 left-0 right-0 z-40 md:bottom-0">
        <div className="mx-auto max-w-lg px-3">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg transition-all dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]">
            {/* ── Expanded Items List (grouped by shop) ────────────────── */}
            {expanded && (
              <div className="max-h-72 overflow-y-auto border-b border-zinc-100 dark:border-zinc-800">
                {shopGroups.length > 1 && (
                  <p className="px-3 pt-2 pb-1 text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {shopGroups.length} shops in cart
                  </p>
                )}

                {shopGroups.map((group) => (
                  <div key={group.shopId}>
                    {/* Shop header */}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50">
                      <StoreIcon />
                      <span className="truncate text-[0.65rem] font-semibold text-zinc-600 dark:text-zinc-400">
                        {group.shopName}
                      </span>
                      <span className="ml-auto text-[0.65rem] font-bold text-emerald-600 dark:text-emerald-400">
                        {formatRupees(group.subtotal)}
                      </span>
                      {/* Per-shop checkout button */}
                      <button
                        type="button"
                        onClick={() => setCheckoutShop(group)}
                        className="ml-2 shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-[0.6rem] font-semibold text-white hover:bg-emerald-700 active:scale-95 transition-all"
                      >
                        Checkout
                      </button>
                    </div>

                    {/* Items in this shop group */}
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 border-b border-zinc-50 px-3 py-2 last:border-b-0 dark:border-zinc-800/50"
                      >
                        {/* Thumbnail */}
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[0.6rem] font-bold text-zinc-400">
                              {item.name.charAt(0)}
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            {item.name}
                          </p>
                          {item.variant && (
                            <p className="text-[0.6rem] text-zinc-400 truncate">
                              {item.variant}
                            </p>
                          )}
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            {formatRupees(item.price)}
                          </p>
                        </div>

                        {/* Quantity controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              item.quantity <= 1
                                ? removeItem(item.id)
                                : updateQuantity(item.id, item.quantity - 1)
                            }
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            aria-label={`Decrease ${item.name}`}
                          >
                            {item.quantity <= 1 ? <TrashIcon /> : <MinusIcon />}
                          </button>
                          <span className="w-6 text-center text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            disabled={item.quantity >= 99}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            aria-label={`Increase ${item.name}`}
                          >
                            <PlusIcon />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* ── Bottom Bar ────────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              {/* Expand toggle */}
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                aria-label={expanded ? "Collapse cart" : "Expand cart"}
              >
                <CartIcon />
                <span className="font-bold">{totalItems}</span>
                {expanded ? <ChevronDownIcon /> : <ChevronUpIcon />}
              </button>

              {/* Total */}
              <div className="min-w-0 flex-1 text-right">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {shopGroups.length > 1 ? `${shopGroups.length} shops` : shopGroups[0]?.shopName ?? ""}
                </p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatRupees(totalAmount)}
                </p>
              </div>

              {/* Checkout button for single shop — when only one shop, direct checkout */}
              {shopGroups.length === 1 && (
                <button
                  type="button"
                  onClick={() => setCheckoutShop(shopGroups[0])}
                  className="shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-sm"
                >
                  Order via WhatsApp
                </button>
              )}

              {/* When multiple shops: expand to pick */}
              {shopGroups.length > 1 && !expanded && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="shrink-0 rounded-full bg-zinc-200 px-3 py-1.5 text-[0.65rem] font-semibold text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                >
                  Review
                </button>
              )}

              {/* Clear cart */}
              <button
                type="button"
                onClick={clearCart}
                className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                aria-label="Clear cart"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Checkout Modal — per shop group ────────────────────────────── */}
      {checkoutShop && (
        <WhatsAppCheckoutModal
          items={checkoutItems}
          shop={{
            id: checkoutShop.shopId,
            name: checkoutShop.shopName,
            whatsapp_number: checkoutShop.shopWhatsapp,
            location: "",
          } as Shop}
          onClose={() => setCheckoutShop(null)}
          onOrderPlaced={() => {
            setCheckoutShop(null);
            // Clear only items from this shop group
            checkoutShop.items.forEach((item) => removeItem(item.id));
          }}
        />
      )}
    </>
  );
}