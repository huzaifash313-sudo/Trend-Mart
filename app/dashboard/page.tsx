"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Merchant Overview (Dashboard home)                            */
/*                                                                             */
/*  A glanceable, merchant-friendly hub. The two hero cards — Products and     */
/*  Deals — show live counts + photo previews and deep-link straight into the  */
/*  storefront owner sections (#products / #deals) where the merchant can      */
/*  edit, pin, pause, or delete anything. Everything else (orders, analytics,  */
/*  settings, finances, ads…) is one tap away.                                 */
/* -------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { scopedKey } from "@/lib/clientScope";
import type { Shop, Order, AnalyticsSummary, Product } from "@/types";
import { isShopPubliclyVisible, isDineInCategory } from "@/types";
import type { ShopDeal } from "@/lib/dealSchedule";
import { fetchMyShops } from "@/services/shopService";
import { fetchProductsByShopId } from "@/services/productService";
import { fetchDealsByShopId } from "@/services/dealService";
import { fetchOrdersByShopId } from "@/services/orderService";
import { fetchAnalyticsSummary } from "@/services/analyticsService";
import { getStatusLabel } from "@/services/notificationService";
import { formatRupees } from "@/lib/formatters";
import { getProductImages, getDealImages } from "@/lib/productImages";
import { getSafeImageUrl } from "@/services/storageService";
import { useToast } from "@/components/Toast";
import CustomSelect from "@/components/CustomSelect";

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

type QuickAction = {
  id: string;
  label: string;
  description: string;
  href?: string;
  tone: string;
  icon: string;
  badge?: number;
};

function statusTone(status: string): string {
  switch (status) {
    case "Pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "Processing":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "Dispatched":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300";
    case "Delivered":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "Cancelled":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

/** Compact large numbers — 1200 → "1.2k", 34000 → "34k", under 1000 verbatim. */
function compactCount(n: number): string {
  if (n < 1000) return n.toLocaleString();
  if (n < 1_000_000) {
    const v = n / 1000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}k`;
  }
  const v = n / 1_000_000;
  return `${v.toFixed(1).replace(/\.0$/, "")}M`;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function DashboardOverviewPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { addToast } = useToast();

  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [deals, setDeals] = useState<ShopDeal[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  const activeShop = shops.find((s) => s.id === activeShopId) ?? null;

  /* Auth check */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace("/auth");
        return;
      }
      setUserId(data.user.id);
      setAuthLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase.auth, router]);

  /* Load shops */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const result = await fetchMyShops();
      if (cancelled) return;
      if (result.success) {
        setShops(result.data);
        if (result.data.length > 0 && !activeShopId) {
          const saved =
            typeof window !== "undefined"
              ? localStorage.getItem(scopedKey("trendmart_active_shop"))
              : null;
          const match = saved ? result.data.find((s) => s.id === saved) : null;
          setActiveShopId(match?.id ?? result.data[0].id);
        }
      } else {
        addToast(result.error ?? "Could not load your shops.", "error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /* Load shop data */
  useEffect(() => {
    if (!activeShopId) return;
    let cancelled = false;
    setDataLoading(true);
    (async () => {
      const [productResult, dealResult, orderResult, analyticsResult] =
        await Promise.all([
          fetchProductsByShopId(activeShopId),
          fetchDealsByShopId(activeShopId),
          fetchOrdersByShopId(activeShopId),
          fetchAnalyticsSummary(activeShopId),
        ]);
      if (cancelled) return;
      if (productResult.success) setProducts(productResult.data);
      if (dealResult.success) setDeals(dealResult.data);
      if (orderResult.success) setOrders(orderResult.data);
      if (analyticsResult.success) setAnalytics(analyticsResult.data);
      setDataLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeShopId]);

  const selectShop = useCallback((id: string) => {
    setActiveShopId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(scopedKey("trendmart_active_shop"), id);
    }
  }, []);

  /* Derived KPIs */
  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === "Pending" || o.status === "Processing"),
    [orders],
  );
  const availableCount = products.filter((p) => p.is_available).length;
  const soldOutCount = products.length - availableCount;
  const activeDeals = deals.filter((d) => d.is_active).length;
  const featuredDeals = deals.filter((d) => d.is_featured).length;
  const revenue = useMemo(
    () =>
      orders
        .filter((o) => o.status === "Delivered" || o.status === "Dispatched")
        .reduce((sum, o) => sum + (o.total_amount || 0), 0),
    [orders],
  );

  /* Preview images for the two hero cards. */
  const productPreviews = useMemo(
    () => products.map((p) => getProductImages(p)[0]).filter(Boolean).slice(0, 4) as string[],
    [products],
  );
  const dealPreviews = useMemo(
    () => deals.map((d) => getDealImages(d)[0]).filter(Boolean).slice(0, 4) as string[],
    [deals],
  );

  const storefrontUrl = activeShop ? `/shop/${activeShop.id}` : "#";

  const quickActions = useMemo<QuickAction[]>(() => {
    if (!activeShop) return [];
    const base: QuickAction[] = [
      {
        id: "orders",
        label: "Orders",
        description: "Fulfil & update status",
        href: "/dashboard/orders",
        tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
        icon: "🧾",
        badge: pendingOrders.length,
      },
      {
        id: "bulk",
        label: "Bulk add",
        description: "Upload many at once",
        href: "/dashboard/products/new",
        tone: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
        icon: "🗂️",
      },
      {
        id: "analytics",
        label: "Analytics",
        description: "Views, clicks & sales",
        href: "/dashboard/analytics",
        tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
        icon: "📊",
      },
      {
        id: "settings",
        label: "Store settings",
        description: "Delivery, area, QR & more",
        href: "/dashboard/settings",
        tone: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        icon: "⚙️",
      },
      {
        id: "finances",
        label: "Finances",
        description: "Income & expenses",
        href: "/dashboard/finances",
        tone: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
        icon: "💰",
      },
      {
        id: "ads",
        label: "Ads",
        description: "Promote your store",
        href: "/dashboard/ads",
        tone: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
        icon: "📣",
      },
      {
        id: "inquiries",
        label: "Inquiries",
        description: "Customer questions",
        href: "/dashboard/inquiries",
        tone: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
        icon: "💬",
      },
      {
        id: "leads",
        label: "Leads",
        description: "Potential customers",
        href: "/dashboard/leads",
        tone: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
        icon: "🎯",
      },
    ];

    if (isDineInCategory(activeShop.category)) {
      base.splice(
        2,
        0,
        {
          id: "kitchen",
          label: "Kitchen",
          description: "Live order board",
          href: "/dashboard/kitchen",
          tone: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
          icon: "🍳",
        },
        {
          id: "tables",
          label: "QR tables",
          description: "Dine-in tables",
          href: "/dashboard/tables",
          tone: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",
          icon: "🪑",
        },
      );
    }

    return base;
  }, [activeShop, pendingOrders.length]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  /* No shop yet — guide the merchant to create one. */
  if (!authLoading && shops.length === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-3xl dark:bg-emerald-900/40">
          🏪
        </div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Welcome to your dashboard
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          You don&apos;t have a store yet. Create one to start listing products and
          receiving orders on TrendMart.
        </p>
        <Link
          href="/account/become-merchant"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700"
        >
          Start selling
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      {/* Header */}
      <header className="sticky top-[var(--tm-navbar-sticky-offset)] z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
              Merchant dashboard
            </p>
            <h1 className="tm-font-display truncate text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
              {activeShop?.name ?? "Overview"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {shops.length > 1 && (
              <CustomSelect
                value={activeShopId ?? ""}
                onChange={selectShop}
                options={shops.map((s) => ({ value: s.id, label: s.name }))}
                ariaLabel="Switch shop"
                pill
                size="sm"
                fullWidth={false}
              />
            )}
            {activeShop && (
              <Link
                href={storefrontUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                View store
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {activeShop && (
          <>
            {/* Store status strip */}
            <section
              className={`rounded-2xl border p-4 ${
                isShopPubliclyVisible(activeShop)
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/25"
                  : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/25"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
                    isShopPubliclyVisible(activeShop) ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                    {isShopPubliclyVisible(activeShop)
                      ? "Your store is live and discoverable"
                      : "Your store is hidden"}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                    {isShopPubliclyVisible(activeShop)
                      ? "Customers can browse and place orders right now."
                      : activeShop.is_live
                        ? "Waiting for admin approval before it goes public."
                        : "Turn it on in Store settings when you're ready."}
                  </p>
                </div>
                <Link
                  href="/dashboard/settings"
                  className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Manage
                </Link>
              </div>
            </section>

            {/* ── Hero catalog cards: Products & Deals ─────────────────── */}
            <section aria-label="Your catalog">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Your catalog
                </h2>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Tap a card to manage it on your storefront
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Products card */}
                <a
                  href={`${storefrontUrl}#products`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-700"
                >
                  <div className="flex items-start justify-between p-4 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-lg dark:bg-emerald-900/40">
                          📦
                        </span>
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            Products
                          </p>
                          <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
                            Add, edit, pin &amp; toggle stock
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-end gap-2">
                        <span className="text-4xl font-extrabold leading-none tracking-tight text-zinc-900 dark:text-zinc-100">
                          {compactCount(products.length)}
                        </span>
                        <span className="pb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {products.length === 1 ? "item" : "items"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          {availableCount} available
                        </span>
                        {soldOutCount > 0 && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                            {soldOutCount} sold out
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Photo preview strip — fixed square thumbs (H/V source safe) */}
                  <div className="flex items-center gap-1.5 px-4 pb-3">
                    {productPreviews.length > 0 ? (
                      <>
                        {productPreviews.map((src, i) => (
                          <span key={i} className="tm-thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={getSafeImageUrl(src, "product")}
                              alt=""
                              loading="lazy"
                              decoding="async"
                            />
                          </span>
                        ))}
                        <span className="ml-1 text-xs font-semibold text-zinc-400">
                          +{Math.max(0, products.length - productPreviews.length)} more
                        </span>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        No photos yet — add products to see them here.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      Manage products
                    </span>
                    <span className="text-emerald-600 transition-transform group-hover:translate-x-0.5 dark:text-emerald-400">
                      →
                    </span>
                  </div>
                </a>

                {/* Deals card */}
                <a
                  href={`${storefrontUrl}#deals`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-amber-700"
                >
                  <div className="flex items-start justify-between p-4 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-lg dark:bg-amber-900/40">
                          🏷️
                        </span>
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            Deals
                          </p>
                          <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
                            Pin, edit, pause &amp; schedule offers
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-end gap-2">
                        <span className="text-4xl font-extrabold leading-none tracking-tight text-zinc-900 dark:text-zinc-100">
                          {compactCount(deals.length)}
                        </span>
                        <span className="pb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {deals.length === 1 ? "deal" : "deals"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          {activeDeals} active
                        </span>
                        {featuredDeals > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            {featuredDeals} featured
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Photo preview strip — same square crop as products */}
                  <div className="flex items-center gap-1.5 px-4 pb-3">
                    {dealPreviews.length > 0 ? (
                      <>
                        {dealPreviews.map((src, i) => (
                          <span key={i} className="tm-thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={getSafeImageUrl(src, "product")}
                              alt=""
                              loading="lazy"
                              decoding="async"
                            />
                          </span>
                        ))}
                        <span className="ml-1 text-xs font-semibold text-zinc-400">
                          +{Math.max(0, deals.length - dealPreviews.length)} more
                        </span>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        No deals yet — create your first offer.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Manage deals
                    </span>
                    <span className="text-amber-600 transition-transform group-hover:translate-x-0.5 dark:text-amber-400">
                      →
                    </span>
                  </div>
                </a>
              </div>
            </section>

            {/* ── KPI cards ────────────────────────────────────────────── */}
            <section aria-label="Store overview">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Link
                  href="/dashboard/orders"
                  className={`tm-panel p-4 text-center transition-shadow hover:shadow-sm ${
                    pendingOrders.length > 0 ? "border-amber-300 dark:border-amber-700" : ""
                  }`}
                >
                  <p className={`text-2xl font-bold ${pendingOrders.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-zinc-900 dark:text-zinc-100"}`}>
                    {pendingOrders.length}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Pending orders</p>
                </Link>
                <div className="tm-panel p-4 text-center">
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {formatRupees(revenue)}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Revenue</p>
                </div>
                <div className="tm-panel p-3 text-center">
                  <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {analytics?.total_views ?? "—"}
                  </p>
                  <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">Store views</p>
                </div>
                <div className="tm-panel p-3 text-center">
                  <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {analytics?.total_product_clicks ?? "—"}
                  </p>
                  <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">Product clicks</p>
                </div>
              </div>
            </section>

            {/* ── Quick actions ─────────────────────────────────────────── */}
            <section aria-label="Quick actions">
              <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Everything else
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {quickActions.map((action) => (
                  <Link
                    key={action.id}
                    href={action.href ?? "#"}
                    className="tm-panel flex items-center gap-3 px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${action.tone}`}>
                      {action.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                        {action.label}
                        {action.badge ? (
                          <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[0.6rem] font-bold leading-none text-white">
                            {action.badge}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.7rem] text-zinc-500 dark:text-zinc-400">
                        {action.description}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            {/* ── Recent orders ─────────────────────────────────────────── */}
            <section aria-label="Recent orders">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Recent orders
                </h2>
                <Link
                  href="/dashboard/orders"
                  className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  View all →
                </Link>
              </div>

              {dataLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="tm-panel animate-pulse px-4 py-3">
                      <div className="h-10 rounded bg-zinc-200 dark:bg-zinc-800" />
                    </div>
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <div className="tm-panel rounded-2xl border border-dashed border-zinc-300 py-10 text-center dark:border-zinc-700">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No orders yet. Orders placed via WhatsApp checkout will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.slice(0, 5).map((order) => (
                    <div key={order.id} className="tm-panel flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {order.customer_name || "Customer"}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {order.items_json?.length ?? 0} item
                          {(order.items_json?.length ?? 0) !== 1 ? "s" : ""} ·{" "}
                          {new Date(order.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {formatRupees(order.total_amount)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${statusTone(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
