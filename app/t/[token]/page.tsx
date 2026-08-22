"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — QR Table Scan & Order Page (/t/[token])                        */
/*                                                                             */
/*  The zero-friction dine-in flow: scan → table auto-detected → browse menu  */
/*  → order in ~30 seconds with NO sign-up. Live status follows in the        */
/*  success view (and on /orders/[id]).                                       */
/* -------------------------------------------------------------------------- */

import { use, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchProductsByShopId } from "@/services/productService";
import {
  lookupTableByToken,
  placeDineInOrder,
  type DineTableLookup,
} from "@/services/dineInService";
import DineInOrderTracker from "@/components/DineInOrderTracker";
import VariantSelector, { type SelectedVariant } from "@/components/VariantSelector";
import { formatRupees } from "@/lib/formatters";
import { getSafeImageUrl } from "@/services/storageService";
import type { Product, SubCategory, VariantGroup } from "@/types";

interface CartLine {
  qty: number;
  notes?: string;
  /** Human-readable selected options, e.g. "Size: Large · Spice: Extra Spicy" */
  variantLabel?: string;
  /** Unit price including variant adjustments. */
  unitPrice?: number;
}

/* ─── Icons ─────────────────────────────────────────────────────────────────── */

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
function SearchIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function CartIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
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
function XIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export default function DineInScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [table, setTable] = useState<DineTableLookup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [products, setProducts] = useState<Product[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  // Variant selection sheet state.
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [variantSelection, setVariantSelection] = useState<SelectedVariant[]>([]);
  const [variantQty, setVariantQty] = useState(1);

  useEffect(() => {
    let cancelled = false;
    // Fresh table scan → clear any state from a previous table's order.
    setTable(null);
    setLoadError(null);
    setLoading(true);
    setProducts([]);
    setSubCategories([]);
    setQuery("");
    setCart({});
    setCheckoutOpen(false);
    setPlacing(false);
    setPlaceError(null);
    setPlacedOrderId(null);
    setImgErrors({});
    setVariantProduct(null);
    setVariantSelection([]);
    setVariantQty(1);
    (async () => {
      const res = await lookupTableByToken(token);
      if (cancelled) return;
      if (!res.success) {
        setLoadError(res.error);
        setLoading(false);
        return;
      }
      if (!res.data) {
        setLoadError("This QR code is not active. Ask the staff for help.");
        setLoading(false);
        return;
      }
      setTable(res.data);
      setLoading(false);

      const [prodRes, subRes] = await Promise.all([
        fetchProductsByShopId(res.data.shop_id),
        createClient()
          .from("sub_categories")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .then(({ data }) => data as SubCategory[] | null),
      ]);
      if (cancelled) return;
      if (prodRes.success) {
        const available = prodRes.data.filter((p) => p.is_available);
        setProducts(available);
      }
      setSubCategories(subRes ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /** Total qty in cart for a product (all variant lines combined). */
  function productQty(productId: string): number {
    return Object.entries(cart).reduce((sum, [key, line]) => {
      return key === productId || key.startsWith(`${productId}::`) ? sum + line.qty : sum;
    }, 0);
  }

  const cartCount = useMemo(() => Object.values(cart).reduce((n, l) => n + l.qty, 0), [cart]);
  const cartTotal = useMemo(
    () =>
      Object.entries(cart).reduce((sum, [key, line]) => {
        const id = key.split("::")[0]!;
        const p = products.find((x) => x.id === id);
        const unit = line.unitPrice ?? p?.price ?? 0;
        return sum + unit * line.qty;
      }, 0),
    [cart, products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [products, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const p of filtered) {
      const key = p.sub_category_id ?? "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return [...groups.entries()].sort((a, b) => {
      const la = a[1][0]?.sub_category_id ? 0 : 1;
      const lb = b[1][0]?.sub_category_id ? 0 : 1;
      return la - lb;
    });
  }, [filtered]);

  function bump(productId: string, delta: number) {
    setCart((prev) => {
      const next = { ...prev };
      const current = next[productId]?.qty ?? 0;
      const qty = current + delta;
      if (qty <= 0) delete next[productId];
      else next[productId] = { ...next[productId], qty };
      return next;
    });
  }

  /** Add to cart, opening the variant sheet first when the product has options. */
  function handleAdd(product: Product) {
    const groups: VariantGroup[] = (product.variants as VariantGroup[] | null) ?? [];
    if (groups.length > 0) {
      setVariantSelection([]);
      setVariantQty(1);
      setVariantProduct(product);
    } else {
      bump(product.id, 1);
    }
  }

  /** Unit price incl. selected variant adjustments. */
  function unitPriceFor(product: Product, selection: SelectedVariant[]): number {
    const base = product.price ?? 0;
    return base + selection.reduce((sum, s) => sum + (s.priceAdj ?? 0), 0);
  }

  /** Build a human-readable variant label from the selection. */
  function variantLabelFor(selection: SelectedVariant[]): string {
    return selection.map((s) => `${s.groupName}: ${s.optionLabel}`).join(" · ");
  }

  /** Confirm the variant sheet — add the line to cart. */
  function confirmVariantAdd() {
    if (!variantProduct) return;
    const groups: VariantGroup[] = (variantProduct.variants as VariantGroup[] | null) ?? [];
    // Require a selection in every group so the order is unambiguous.
    const missing = groups.filter((g) => !variantSelection.some((s) => s.groupName === g.name));
    if (missing.length > 0) {
      setPlaceError(`Please choose: ${missing.map((g) => g.name).join(", ")}.`);
      return;
    }
    const label = variantLabelFor(variantSelection);
    const unit = unitPriceFor(variantProduct, variantSelection);
    const id = variantProduct.id;
    setCart((prev) => {
      const next = { ...prev };
      const existing = next[id];
      if (existing) {
        // Merge same product + same options into one line; otherwise keep separate lines.
        if (existing.variantLabel === label) {
          next[id] = { ...existing, qty: existing.qty + variantQty };
          return next;
        }
      }
      next[`${id}::${label || "plain"}`] = {
        qty: variantQty,
        variantLabel: label,
        unitPrice: unit,
      };
      return next;
    });
    setVariantProduct(null);
    setPlaceError(null);
  }

  async function submitOrder() {
    if (!table) return;
    if (!table.shop_is_live) {
      setPlaceError("This shop is currently offline and not taking orders.");
      return;
    }
    if (!name.trim()) {
      setPlaceError("Please enter your name so the kitchen knows who ordered.");
      return;
    }
    const items = Object.entries(cart).map(([key, line]) => {
      const id = key.split("::")[0]!;
      const p = products.find((x) => x.id === id)!;
      return {
        productId: id,
        name: p.name,
        price: line.unitPrice ?? p.price,
        quantity: line.qty,
        variant: line.variantLabel,
        notes: line.notes?.trim() || undefined,
      };
    });
    setPlacing(true);
    setPlaceError(null);
    const res = await placeDineInOrder({
      tableToken: token,
      customerName: name.trim(),
      customerPhone: phone.trim() || undefined,
      items,
      notes: notes.trim() || undefined,
    });
    setPlacing(false);
    if (res.success) {
      setPlacedOrderId(res.data.id);
      setCheckoutOpen(false);
      setCart({});
      setNotes("");
    } else {
      setPlaceError(res.error);
    }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  /* ── Invalid / inactive token ── */
  if (loadError || !table) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50 px-6 text-center dark:bg-[color:var(--tm-surface)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
          <XIcon />
        </div>
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {loadError ?? "Table not found."}
        </p>
        <p className="max-w-xs text-xs text-zinc-500 dark:text-zinc-400">
          Please ask a staff member to help you order.
        </p>
      </div>
    );
  }

  /* ── Order placed → live tracker ── */
  if (placedOrderId) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-[color:var(--tm-surface)]">
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <DineInOrderTracker orderId={placedOrderId} tableToken={token} />
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setPlacedOrderId(null)}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Order something else
            </button>
            <Link
              href={`/orders/${placedOrderId}?table=${encodeURIComponent(token)}`}
              className="text-xs font-semibold text-emerald-600 underline"
            >
              Open full tracking page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ── Menu ── */
  return (
    <div className="min-h-screen bg-zinc-50 pb-28 dark:bg-[color:var(--tm-surface)]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-100 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]/90">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          {table.shop_logo_url ? (
            <Image
              src={table.shop_logo_url}
              alt={table.shop_name}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              <StoreIcon />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {table.shop_name}
            </p>
            <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {table.shop_location || "Welcome!"}
            </p>
          </div>
          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
            {table.table_name}
          </span>
        </div>
        {/* Search */}
        <div className="mx-auto max-w-md px-4 pb-3">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the menu…"
              className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
            />
          </div>
        </div>
      </header>

      {/* Offline notice */}
      {!table.shop_is_live && (
        <div className="mx-auto mt-3 max-w-md px-4">
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
            This shop is currently offline and not taking orders.
          </p>
        </div>
      )}

      {/* Menu sections */}
      <main className="mx-auto max-w-md px-4 pt-4">
        {grouped.length === 0 && (
          <p className="py-16 text-center text-sm text-zinc-400 dark:text-zinc-500">
            {query ? "Nothing matches your search." : "The menu is empty right now."}
          </p>
        )}
        {grouped.map(([key, items]) => (
          <section key={key} className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {items[0]?.sub_category_id
                ? subCategories.find((s) => s.id === items[0].sub_category_id)?.name
                : "Menu"}
            </h2>
            <div className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-100 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]">
              {items.map((p) => {
                const qty = productQty(p.id);
                const hasVariants = ((p.variants as VariantGroup[] | null) ?? []).length > 0;
                const showImg = p.image_url && !imgErrors[p.id];
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-3">
                    {showImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getSafeImageUrl(p.image_url, "product")}
                        alt={p.name}
                        loading="lazy"
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                        onError={() => setImgErrors((prev) => ({ ...prev, [p.id]: true }))}
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xl font-bold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {p.name}
                      </p>
                      {p.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {p.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {formatRupees(p.price)}
                        {hasVariants ? (
                          <span className="ml-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                            · options
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {qty === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleAdd(p)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-600 text-emerald-600 transition hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        aria-label={`Add ${p.name}`}
                      >
                        <PlusIcon />
                      </button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2 rounded-full bg-emerald-600 px-1.5 py-1 text-white">
                        <button
                          type="button"
                          onClick={() => {
                            if (hasVariants) {
                              // For variants, clear all lines of this product.
                              setCart((prev) => {
                                const next = { ...prev };
                                for (const key of Object.keys(next)) {
                                  if (key === p.id || key.startsWith(`${p.id}::`)) delete next[key];
                                }
                                return next;
                              });
                            } else {
                              bump(p.id, -1);
                            }
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-emerald-700"
                          aria-label={`Remove ${p.name}`}
                        >
                          <MinusIcon />
                        </button>
                        <span className="w-5 text-center text-sm font-bold">{qty}</span>
                        <button
                          type="button"
                          onClick={() => handleAdd(p)}
                          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-emerald-700"
                          aria-label={`Add more ${p.name}`}
                        >
                          <PlusIcon />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* Cart bar — always shows once items are added */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              <CartIcon />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {cartCount} item{cartCount > 1 ? "s" : ""}
              </p>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {formatRupees(cartTotal)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
            >
              Review order
            </button>
          </div>
        </div>
      )}

      {/* Variant selection sheet */}
      {variantProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setVariantProduct(null)}>
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-[color:var(--tm-surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {variantProduct.name}
                </h3>
                <p className="mt-0.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatRupees(unitPriceFor(variantProduct, variantSelection))}
                  {variantSelection.some((s) => s.priceAdj !== 0) ? (
                    <span className="ml-1 text-[10px] font-medium text-zinc-400">
                      (incl. options)
                    </span>
                  ) : null}
                </p>
              </div>
              <button type="button" onClick={() => setVariantProduct(null)} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">
                <XIcon />
              </button>
            </div>

            <VariantSelector
              variants={(variantProduct.variants as VariantGroup[] | null) ?? []}
              basePrice={variantProduct.price ?? 0}
              compact
              onSelectionChange={setVariantSelection}
            />

            {/* Quantity */}
            <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Quantity</span>
              <div className="flex items-center gap-2 rounded-full bg-zinc-100 px-1.5 py-1 dark:bg-zinc-800">
                <button
                  type="button"
                  onClick={() => setVariantQty((q) => Math.max(1, q - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-700 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-700"
                  aria-label="Decrease quantity"
                >
                  <MinusIcon />
                </button>
                <span className="w-6 text-center text-sm font-bold text-zinc-900 dark:text-zinc-100">{variantQty}</span>
                <button
                  type="button"
                  onClick={() => setVariantQty((q) => Math.min(20, q + 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-700 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-700"
                  aria-label="Increase quantity"
                >
                  <PlusIcon />
                </button>
              </div>
            </div>

            {placeError && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {placeError}
              </p>
            )}

            <button
              type="button"
              onClick={confirmVariantAdd}
              className="mt-4 w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-700 active:scale-95"
            >
              Add to order · {formatRupees(unitPriceFor(variantProduct, variantSelection) * variantQty)}
            </button>
          </div>
        </div>
      )}

      {/* Checkout sheet */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setCheckoutOpen(false)}>
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-[color:var(--tm-surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Review your order
              </h3>
              <button type="button" onClick={() => setCheckoutOpen(false)} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">
                <XIcon />
              </button>
            </div>

            {/* Items */}
            <div className="mb-4 divide-y divide-zinc-100 rounded-xl border border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
              {Object.entries(cart).map(([key, line]) => {
                const id = key.split("::")[0]!;
                const p = products.find((x) => x.id === id);
                if (!p) return null;
                const unit = line.unitPrice ?? p.price;
                return (
                  <div key={key} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                      {p.image_url && !imgErrors[id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getSafeImageUrl(p.image_url, "product")} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {p.name} <span className="text-zinc-400">× {line.qty}</span>
                      </p>
                      {line.variantLabel ? (
                        <p className="truncate text-xs text-emerald-600 dark:text-emerald-400">
                          {line.variantLabel}
                        </p>
                      ) : null}
                      {line.notes ? (
                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          Note: {line.notes}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-bold text-zinc-800 dark:text-zinc-200">
                      {formatRupees(unit * line.qty)}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Form */}
            <div className="mb-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Your name *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ali"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Phone <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  inputMode="tel"
                  placeholder="03XX XXXXXXX"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Special instructions <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Less spicy, no onions"
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>

            {placeError && (
              <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {placeError}
              </p>
            )}

            <button
              type="button"
              disabled={placing}
              onClick={() => void submitOrder()}
              className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {placing ? "Sending order…" : `Order Now • ${formatRupees(cartTotal)}`}
            </button>
            <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
              No sign-up needed. The kitchen confirms your order on this screen.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
