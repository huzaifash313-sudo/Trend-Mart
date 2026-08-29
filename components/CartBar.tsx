"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart, type CartItem } from "@/context/CartContext";
import { formatRupees } from "@/lib/formatters";
import { priceForQuantity } from "@/lib/priceTiers";
import WhatsAppCheckoutModal from "@/components/WhatsAppCheckoutModal";
import type { WhatsAppCartItem } from "@/components/WhatsAppCheckoutModal";
import type { Shop } from "@/types";
import { fetchShopById } from "@/services/shopService";
import { useConfirm } from "@/components/ConfirmProvider";

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
    // Tier-aware: pack/unit quantity pricing must match the store's total
    // (e.g. "6 = Rs 1100" is never billed as 6 × 200). Mirrors cartStore.totalAmount.
    group.subtotal += priceForQuantity(item.price, item.priceTiers ?? null, item.quantity);
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

/* -------------------------------------------------------------------------- */
/*  CartBar Component                                                          */
/* -------------------------------------------------------------------------- */

export default function CartBar() {
  const pathname = usePathname();
  const { confirm } = useConfirm();
  const { items, removeItem, updateQuantity, updateItemNotes, totalItems, totalAmount, clearCart } = useCart();
  const [expanded, setExpanded] = useState(false);
  const [checkoutShop, setCheckoutShop] = useState<ShopGroup | null>(null);
  const [resolvedShop, setResolvedShop] = useState<Shop | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const shopGroups = useMemo(() => groupItemsByShop(items), [items]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const check = () => {
      setKeyboardOpen(window.innerHeight - vv.height > 150);
    };
    check();
    vv.addEventListener("resize", check);
    window.addEventListener("resize", check);
    return () => {
      vv.removeEventListener("resize", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  // After login/verify — reopen first shop checkout if cart still has items
  useEffect(() => {
    if (totalItems === 0 || shopGroups.length === 0) return;
    try {
      if (sessionStorage.getItem("tm_resume_checkout") === "1") {
        sessionStorage.removeItem("tm_resume_checkout");
        setExpanded(true);
        setCheckoutShop(shopGroups[0]!);
      }
    } catch {
      /* ignore */
    }
  }, [totalItems, shopGroups]);

  // Load full shop row for radius / hours / delivery rules
  useEffect(() => {
    if (!checkoutShop) {
      setResolvedShop(null);
      return;
    }
    let cancelled = false;
    const fallback = stubShopFromGroup(checkoutShop);
    setResolvedShop(fallback);
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

  if (
    pathname === "/offline" ||
    pathname.startsWith("/admin") ||
    pathname === "/login" ||
    pathname === "/signup" ||
    totalItems === 0 ||
    keyboardOpen
  ) {
    return null;
  }

  const checkoutItems: WhatsAppCartItem[] = (checkoutShop?.items ?? []).map((i) => ({
    id: i.id,
    productId: i.productId,
    shopId: i.shopId,
    name: i.name,
    price: i.price,
    imageUrl: i.imageUrl,
    quantity: i.quantity,
    variant: i.variant,
    notes: i.notes,
    currency: i.currency,
    originalPrice: i.originalPrice ?? undefined,
    shortCode: i.shortCode ?? undefined,
    priceTiers: i.priceTiers ?? null,
  }));

  const handleClearCart = async () => {
    if (!(await confirm("Clear your entire cart?"))) return;
    clearCart();
  };

  return (
    <>
      <div className="tm-cartbar-root fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 md:bottom-0 md:z-50">
        <div className="mx-auto max-w-lg px-3">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg transition-all dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]">
            {expanded && (
              <div className="max-h-72 overflow-y-auto border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                  {shopGroups.length > 1 ? (
                    <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {shopGroups.length} shops — checkout each shop separately
                    </p>
                  ) : (
                    <span />
                  )}
                  <Link
                    href="/cart"
                    className="shrink-0 text-[0.65rem] font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    View full cart →
                  </Link>
                </div>

                {shopGroups.map((group) => (
                  <div key={group.shopId}>
                    <div className="flex items-center gap-1.5 bg-zinc-50 px-3 py-1.5 dark:bg-zinc-800/50">
                      <StoreIcon />
                      <span className="truncate text-[0.65rem] font-semibold text-zinc-600 dark:text-zinc-400">
                        {group.shopName}
                      </span>
                      <span className="ml-auto text-[0.65rem] font-bold text-emerald-600 dark:text-emerald-400">
                        {formatRupees(group.subtotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCheckoutShop(group)}
                        className="ml-2 shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-[0.6rem] font-semibold text-white transition-all hover:bg-emerald-700 active:scale-95"
                      >
                        Checkout
                      </button>
                    </div>

                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 border-b border-zinc-50 px-3 py-2 last:border-b-0 dark:border-zinc-800/50"
                      >
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[0.6rem] font-bold text-zinc-400">
                              {item.name.charAt(0)}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            {item.name}
                          </p>
                          {item.variant && (
                            <p className="truncate text-[0.6rem] text-zinc-400">{item.variant}</p>
                          )}
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            {formatRupees(item.price)}
                          </p>
                          <input
                            type="text"
                            value={item.notes ?? ""}
                            onChange={(e) => updateItemNotes(item.id, e.target.value)}
                            placeholder="Order note"
                            maxLength={200}
                            className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[0.6rem] text-zinc-700 placeholder:text-zinc-300/50 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          />
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
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

            <div className="flex items-center gap-2 px-3 py-2.5">
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

              <div className="min-w-0 flex-1 text-right">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {shopGroups.length > 1
                    ? `${shopGroups.length} shops`
                    : (shopGroups[0]?.shopName ?? "")}
                </p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatRupees(totalAmount)}
                </p>
              </div>

              {shopGroups.length === 1 && (
                <button
                  type="button"
                  onClick={() => setCheckoutShop(shopGroups[0]!)}
                  className="shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
                >
                  Order via WhatsApp
                </button>
              )}

              {shopGroups.length > 1 && !expanded && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-[0.65rem] font-semibold text-white hover:bg-emerald-700"
                >
                  Checkout shops
                </button>
              )}

              <button
                type="button"
                onClick={handleClearCart}
                className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                aria-label="Clear cart"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      {checkoutShop && resolvedShop && (
        <WhatsAppCheckoutModal
          items={checkoutItems}
          shop={resolvedShop}
          onClose={() => setCheckoutShop(null)}
          onOrderPlaced={() => {
            setCheckoutShop(null);
            checkoutShop.items.forEach((item) => removeItem(item.id));
          }}
        />
      )}
    </>
  );
}
