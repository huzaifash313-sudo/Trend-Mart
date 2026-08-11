"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import DealCard from "@/components/DealCard";
import {
  formatOfferDayLabel,
  isDealActiveOnDate,
  listOfferDayKeys,
  toPkDateKey,
  type ShopDeal,
} from "@/lib/dealSchedule";
import { fetchActiveDeals } from "@/services/dealService";
import { fetchActiveCouponsForShops, type Coupon } from "@/services/couponService";
import { fetchShopDeliveryMetaForIds, type ShopDeliveryMeta } from "@/services/shopDeliveryMeta";
import { buildShopTickerTags } from "@/lib/shopOfferLabels";
import { fuzzyFilterAndRank, FUZZY_MIN_SCORE, suggestSearchCorrections } from "@/lib/fuzzySearch";

type FilterMode = "today" | "featured" | "upcoming" | "all";

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function DealsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qParam = searchParams.get("q") ?? "";
  const filterParam = (searchParams.get("filter") as FilterMode | null) ?? "today";

  const [deals, setDeals] = useState<ShopDeal[]>([]);
  const [shopCoupons, setShopCoupons] = useState<Record<string, Coupon[]>>({});
  const [shopDelivery, setShopDelivery] = useState<Record<string, ShopDeliveryMeta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(qParam);
  const [filter, setFilter] = useState<FilterMode>(
    ["today", "featured", "upcoming", "all"].includes(filterParam) ? filterParam : "today",
  );
  const [dayKey, setDayKey] = useState<string | null>(null);

  const todayKey = toPkDateKey();

  const loadOffersForShops = useCallback(async (shopIds: string[]) => {
    const unique = [...new Set(shopIds.filter(Boolean))];
    if (!unique.length) {
      setShopCoupons({});
      setShopDelivery({});
      return;
    }
    const [cRes, dRes] = await Promise.all([
      fetchActiveCouponsForShops(unique),
      fetchShopDeliveryMetaForIds(unique),
    ]);
    if (cRes.success) setShopCoupons(cRes.data);
    if (dRes.success) setShopDelivery(dRes.data);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchActiveDeals();
    if (result.success) {
      setDeals(result.data);
      void loadOffersForShops(result.data.map((d) => d.shop_id));
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [loadOffersForShops]);

  useEffect(() => {
    void load();
    const onDeals = () => void load();
    window.addEventListener("trendmart:deals-updated", onDeals);
    return () => window.removeEventListener("trendmart:deals-updated", onDeals);
  }, [load]);

  useEffect(() => {
    const shopIds = deals.map((d) => d.shop_id);
    const onCoupons = () => void loadOffersForShops(shopIds);
    window.addEventListener("trendmart:coupons-updated", onCoupons);
    return () => window.removeEventListener("trendmart:coupons-updated", onCoupons);
  }, [deals, loadOffersForShops]);

  useEffect(() => {
    setQuery(qParam);
    setFilter(
      ["today", "featured", "upcoming", "all"].includes(filterParam) ? filterParam : "today",
    );
  }, [qParam, filterParam]);

  const syncUrl = useCallback(
    (next: { q?: string; filter?: FilterMode }) => {
      const params = new URLSearchParams();
      const q = next.q !== undefined ? next.q : query;
      const f = next.filter !== undefined ? next.filter : filter;
      if (q.trim()) params.set("q", q.trim());
      if (f && f !== "today") params.set("filter", f);
      const qs = params.toString();
      router.replace(qs ? `/deals?${qs}` : "/deals", { scroll: false });
    },
    [router, query, filter],
  );

  const offerDays = useMemo(() => listOfferDayKeys(deals, 14, todayKey), [deals, todayKey]);

  const filtered = useMemo(() => {
    let list = deals.filter((d) => d.is_active);

    if (dayKey) {
      list = list.filter((d) => isDealActiveOnDate(d, dayKey));
    } else if (filter === "today") {
      list = list.filter((d) => isDealActiveOnDate(d, todayKey));
    } else if (filter === "featured") {
      list = list.filter((d) => d.is_featured && isDealActiveOnDate(d, todayKey));
    } else if (filter === "upcoming") {
      list = list.filter((d) => {
        if (isDealActiveOnDate(d, todayKey)) return false;
        return offerDays.some((k) => k !== todayKey && isDealActiveOnDate(d, k));
      });
    }

    const q = query.trim();
    if (q) {
      list = fuzzyFilterAndRank(
        list,
        q,
        (d) => [d.title, d.badge_text, d.description, d.shop_name],
        { minScore: FUZZY_MIN_SCORE, weights: [1, 0.9, 0.7, 0.75] },
      ).map((r) => r.item);
    } else {
      list = list.slice().sort((a, b) => {
        const af = a.is_featured ? 1 : 0;
        const bf = b.is_featured ? 1 : 0;
        if (bf !== af) return bf - af;
        const ai = a.image_url ? 1 : 0;
        const bi = b.image_url ? 1 : 0;
        if (bi !== ai) return bi - ai;
        return (b.created_at || "").localeCompare(a.created_at || "");
      });
    }

    return list;
  }, [deals, query, filter, dayKey, todayKey, offerDays]);

  const getOfferTags = useCallback(
    (shopId: string) => {
      const meta = shopDelivery[shopId];
      return buildShopTickerTags({
        coupons: shopCoupons[shopId] ?? [],
        freeDeliveryThreshold: meta?.free_delivery_threshold,
        deliveryFeeFlat: meta?.delivery_fee_flat,
        deliveryFeePerKm: meta?.delivery_fee_per_km,
      });
    },
    [shopCoupons, shopDelivery],
  );

  const searchSuggestions = useMemo(() => {
    if (!query.trim() || filtered.length > 0) return [];
    return suggestSearchCorrections(query, 4);
  }, [query, filtered.length]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setDayKey(null);
    syncUrl({ q: query });
  };

  const FILTERS: { value: FilterMode; label: string }[] = [
    { value: "today", label: "Live today" },
    { value: "featured", label: "Featured" },
    { value: "upcoming", label: "Upcoming" },
    { value: "all", label: "All active" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 page-stack px-3 py-3 pb-28 md:px-4 md:py-5 md:pb-10">
      <header className="mb-3">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          Marketplace deals
        </p>
        <div className="mt-0.5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
              Deals for you
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Same browse as products — every card is a store <span className="font-semibold text-amber-700 dark:text-amber-300">Deal</span>
              , with coupons &amp; delivery from that shop.
            </p>
          </div>
          <Link
            href="/products?sort=for_you"
            className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
          >
            Products →
          </Link>
        </div>
      </header>

      <form onSubmit={handleSearch} className="mb-3">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search deals (typos OK)…"
            className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-20 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Search deals"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Search
          </button>
        </label>
      </form>

      <div className="sticky top-[var(--tm-navbar-sticky-offset,4.35rem)] z-30 -mx-3 mb-3 border-b border-zinc-100/80 bg-white/95 px-3 py-2 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none dark:sm:bg-transparent">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {FILTERS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setFilter(opt.value);
                setDayKey(null);
                syncUrl({ filter: opt.value });
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                filter === opt.value && !dayKey
                  ? "bg-amber-500 text-zinc-900 shadow-sm shadow-amber-500/30"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {offerDays.length > 0 ? (
        <section aria-label="Offer days" className="tm-cat-bar mb-3 -mx-3 sm:-mx-4">
          <div className="mb-1 flex items-center justify-between px-2 sm:px-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Jump to day
            </p>
            {dayKey ? (
              <button
                type="button"
                onClick={() => setDayKey(null)}
                className="text-[0.65rem] font-semibold text-zinc-500"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="tm-cat-scroll px-2 scrollbar-none sm:px-3">
            {offerDays.map((key) => {
              const active = dayKey === key;
              const count = deals.filter((d) => isDealActiveOnDate(d, key)).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDayKey(active ? null : key)}
                  className={`tm-cat-tab${active ? " is-active" : ""}`}
                  aria-pressed={active}
                >
                  <span className="tm-cat-tab-label">{formatOfferDayLabel(key, todayKey)}</span>
                  <span className="tm-cat-tab-count">{count}</span>
                  <span className="tm-cat-tab-line" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <p className="mb-2 text-[11px] text-zinc-400 dark:text-zinc-500">
        {loading ? "Loading deals…" : `${filtered.length} deal${filtered.length === 1 ? "" : "s"}`}
      </p>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="tm-product-card flex h-full flex-col overflow-hidden">
              <div className="tm-product-media animate-pulse bg-amber-50 dark:bg-amber-950/20" />
              <div className="tm-product-body flex flex-col gap-0.5">
                <div className="h-3.5 w-[88%] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-3 w-[55%] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-auto max-w-md py-14 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-emerald-600 shadow-lg shadow-amber-500/20">
            <span className="text-lg font-extrabold text-white">%</span>
          </div>
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">No matching deals</h3>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Try another filter, clear search, or browse products instead.
          </p>
          {searchSuggestions.length > 0 ? (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              <span className="w-full text-[0.7rem] font-medium text-zinc-400">Did you mean?</span>
              {searchSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setQuery(s);
                    syncUrl({ q: s });
                  }}
                  className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("today");
                setDayKey(null);
                syncUrl({ q: "", filter: "today" });
              }}
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Clear filters
            </button>
            <Link
              href="/products"
              className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200"
            >
              Browse products
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5">
          {filtered.map((deal, i) => (
            <DealCard
              key={deal.id}
              deal={deal}
              priority={i < 4}
              offerTags={getOfferTags(deal.shop_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DealsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-3 py-8 text-sm text-zinc-400">Loading deals…</div>
      }
    >
      <DealsInner />
    </Suspense>
  );
}
