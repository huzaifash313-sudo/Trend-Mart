"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — QR Table Scan & Order Page (/t/[token])                        */
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
import { formatRupees, getProductDiscount } from "@/lib/formatters";
import { computeVariantPrice, variantPriceRange } from "@/lib/variantPricing";
import { getSafeImageUrl } from "@/services/storageService";
import { fetchDealsByShopId } from "@/services/dealService";
import { isDealOrderableToday, type ShopDeal } from "@/lib/dealSchedule";
import { trackDineOrder } from "@/services/dineInService";
import {
  getRecentDineOrders,
  saveRecentDineOrder,
  removeRecentDineOrder,
  type RecentDineOrder,
} from "@/lib/recentDineOrders";
import type { Product, SubCategory, VariantGroup } from "@/types";

interface CartLine {
  qty: number;
  notes?: string;
  /** Human-readable selected options, e.g. "Size: Large · Spice: Extra Spicy" */
  variantLabel?: string;
  /** Unit price including variant adjustments. */
  unitPrice?: number;
  /** Snapshot name (products + deals both live in the cart). */
  name: string;
  /** True when the line is a standalone shop deal (shop_deals row). */
  isDeal?: boolean;
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
function WhatsAppIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
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
  const [deals, setDeals] = useState<ShopDeal[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentDineOrder[]>([]);

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

      const [prodRes, subRes, dealRes] = await Promise.all([
        fetchProductsByShopId(res.data.shop_id),
        createClient()
          .from("sub_categories")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .then(({ data }) => data as SubCategory[] | null),
        fetchDealsByShopId(res.data.shop_id),
      ]);
      if (cancelled) return;
      if (prodRes.success) {
        const available = prodRes.data.filter((p) => p.is_available);
        setProducts(available);
      }
      setSubCategories(subRes ?? []);
      if (dealRes.success) {
        setDeals(dealRes.data.filter((d) => isDealOrderableToday(d)));
      }

      // Order recovery: this phone previously ordered at this table → let them
      // jump straight back to live tracking.
      const mine = getRecentDineOrders().filter((o) => o.tableToken === token);
      if (mine.length > 0) {
        const active: RecentDineOrder[] = [];
        for (const rec of mine) {
          const tracked = await trackDineOrder(rec.orderId, token);
          const st = tracked.success ? tracked.data?.dine_status : "Served";
          if (st && st !== "Served" && st !== "Cancelled") active.push(rec);
          else removeRecentDineOrder(rec.orderId);
        }
        if (!cancelled) setRecentOrders(active);
      }
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

  function bump(productId: string, delta: number, name?: string) {
    setCart((prev) => {
      const next = { ...prev };
      const current = next[productId]?.qty ?? 0;
      const qty = current + delta;
      if (qty <= 0) delete next[productId];
      else next[productId] = { ...next[productId], qty, ...(name ? { name } : {}) };
      return next;
    });
  }

  /** Add a standalone deal line to the cart. */
  function addDeal(deal: ShopDeal) {
    setCart((prev) => {
      const key = `${deal.id}::deal`;
      const existing = prev[key];
      return {
        ...prev,
        [key]: existing
          ? { ...existing, qty: existing.qty + 1 }
          : { qty: 1, unitPrice: deal.price ?? 0, name: deal.title, isDeal: true },
      };
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
      bump(product.id, 1, product.name);
    }
  }

  /** Unit price incl. selected variant adjustments. */
  function unitPriceFor(product: Product, selection: SelectedVariant[]): number {
    return computeVariantPrice(
      product.price ?? 0,
      (product.variants as VariantGroup[] | null) ?? [],
      selection.map((s) => `${s.groupName}: ${s.optionLabel}`).join(" · "),
    );
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
        name: variantProduct.name,
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
      const p = products.find((x) => x.id === id);
      return {
        productId: id,
        name: line.name || p?.name || "Item",
        price: line.unitPrice ?? p?.price ?? 0,
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
      saveRecentDineOrder({
        orderId: res.data.id,
        tableToken: token,
        tableName: table.table_name,
        shopName: table.shop_name,
        createdAt: Date.now(),
      });
      setCheckoutOpen(false);
      setCart({});
      setNotes("");
      setRecentOrders([]);
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
        {/* TrendsMart brand pill — trust signal on every scanned QR */}
        <div className="mx-auto flex max-w-md items-center justify-center bg-gradient-to-r from-emerald-600 to-teal-600 py-1">
          <span className="flex items-center gap-1 text-[0.6rem] font-bold uppercase tracking-widest text-white">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 9l1.12-5.6A1 1 0 0 1 5.1 3h13.8a1 1 0 0 1 .98.8L21 9" />
              <path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" />
              <path d="M9 21V9h6v12" />
            </svg>
            TrendsMart · QR Dine-in
          </span>
        </div>

        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          {table.shop_logo_url ? (
            <Image
              src={table.shop_logo_url}
              alt={table.shop_name}
              width={44}
              height={44}
              className="h-11 w-11 rounded-full object-cover ring-2 ring-emerald-100 dark:ring-emerald-900/40"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <StoreIcon />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {table.shop_name}
            </p>
            <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              📍 {table.shop_location || "Welcome!"}
            </p>
            {table.shop_whatsapp ? (
              <a
                href={`https://wa.me/${table.shop_whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                <WhatsAppIcon /> {table.shop_whatsapp}
              </a>
            ) : null}
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm"
            style={{
              backgroundColor:
                table.shop_accent_color || "#10b981",
            }}
          >
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
        {/* Order recovery — active orders from this phone/table */}
        {recentOrders.length > 0 && (
          <div className="mb-4 space-y-2">
            {recentOrders.map((rec) => (
              <div
                key={rec.orderId}
                className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-900/10"
              >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Active order — {rec.tableName}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                    {rec.shopName} · Track your order live
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPlacedOrderId(rec.orderId)}
                  className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Track
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Today's deals */}
        {deals.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Today&apos;s Deals
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {deals.map((deal) => {
                const key = `${deal.id}::deal`;
                const qty = cart[key]?.qty ?? 0;
                return (
                  <div
                    key={deal.id}
                    className="flex w-36 shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]"
                  >
                    {deal.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getSafeImageUrl(deal.image_url, "product")}
                        alt={deal.title}
                        className="h-24 w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-24 w-full items-center justify-center bg-emerald-50 text-2xl dark:bg-emerald-900/20">
                        🏷️
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-2.5">
                      <p className="line-clamp-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {deal.title}
                      </p>
                      <p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {formatRupees(deal.price ?? 0)}
                      </p>
                      {qty === 0 ? (
                        <button
                          type="button"
                          onClick={() => addDeal(deal)}
                          className="mt-2 flex h-8 w-full items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          Add
                        </button>
                      ) : (
                        <div className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-1 text-white">
                          <button type="button" onClick={() => bump(key, -1, deal.title)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-emerald-700" aria-label="Remove deal">
                            <MinusIcon />
                          </button>
                          <span className="text-sm font-bold">{qty}</span>
                          <button type="button" onClick={() => bump(key, 1, deal.title)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-emerald-700" aria-label="Add deal">
                            <PlusIcon />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

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
                      <div className="flex items-start gap-1.5">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {p.name}
                        </p>
                        {getProductDiscount(p).hasDiscount && (
                          <span className="mt-0.5 shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                            -{getProductDiscount(p).discountPercent}%
                          </span>
                        )}
                      </div>
                      {p.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {p.description}
                        </p>
                      ) : null}
                      <p className="mt-1 flex flex-wrap items-baseline gap-1.5">
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {hasVariants
                            ? (() => {
                                const { min, max } = variantPriceRange(
                                  p.price ?? 0,
                                  (p.variants as VariantGroup[] | null) ?? [],
                                );
                                return min === max
                                  ? formatRupees(min)
                                  : `${formatRupees(min)} – ${formatRupees(max)}`;
                              })()
                            : formatRupees(p.price)}
                        </span>
                        {getProductDiscount(p).hasDiscount && (
                          <span className="text-[11px] text-zinc-400 line-through">
                            {formatRupees(getProductDiscount(p).originalPrice ?? p.price)}
                          </span>
                        )}
                        {hasVariants ? (
                          <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
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
                              bump(p.id, -1, p.name);
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
                const unit = line.unitPrice ?? p?.price ?? 0;
                return (
                  <div key={key} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                      {p?.image_url && !imgErrors[id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getSafeImageUrl(p.image_url, "product")} alt={line.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {line.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {line.name} <span className="text-zinc-400">× {line.qty}</span>
                        {line.isDeal ? <span className="ml-1 rounded bg-rose-100 px-1 text-[9px] font-bold text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">DEAL</span> : null}
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
