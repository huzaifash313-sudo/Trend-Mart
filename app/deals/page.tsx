"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import DealCard from "@/components/DealCard";
import { dealToProduct } from "@/lib/dealCommerce";
import {
  formatOfferDayLabel,
  isDealActiveOnDate,
  listOfferDayKeys,
  toPkDateKey,
  dealSearchHaystack,
  formatDealWhenTag,
  type ShopDeal,
} from "@/lib/dealSchedule";
import { type Coupon } from "@/services/couponService";
import { type ShopDeliveryMeta } from "@/services/shopDeliveryMeta";
import { SHOP_CATEGORIES, type Shop, type ShopCategory } from "@/types";
import {
  useDeals,
  useShops,
  useShopCoupons,
  useShopDeliveryMeta,
  useMyShop,
} from "@/lib/queries";
import { filterShopsByProximity, getCustomerArea } from "@/services/geoRadiusService";
import GeoRadiusFilter, { type GeoFilterState } from "@/components/GeoRadiusFilter";
import { useLocation } from "@/context/LocationContext";
import { useQueryClient } from "@tanstack/react-query";
import { buildShopTickerTags } from "@/lib/shopOfferLabels";
import { fuzzyFilterAndRank, FUZZY_MIN_SCORE, suggestSearchCorrections } from "@/lib/fuzzySearch";
import { trackProductView } from "@/lib/behavior";
import DealDayDateFilter from "@/components/DealDayDateFilter";

const DealQuickView = dynamic(() => import("@/components/DealQuickView"), {
  ssr: false,
});

type FilterMode = "today" | "featured" | "upcoming" | "all";

/* Stable empty fallbacks so derived memos don't change identity every render. */
const EMPTY_DEALS: ShopDeal[] = [];
const EMPTY_COUPONS: Record<string, Coupon[]> = {};
const EMPTY_DELIVERY: Record<string, ShopDeliveryMeta> = {};
const EMPTY_SHOPS: Shop[] = [];

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
  const dayParam = searchParams.get("day");
  const categoryParam = (searchParams.get("category") as ShopCategory | null) ?? "All";

  const [query, setQuery] = useState(qParam);
  const [filter, setFilter] = useState<FilterMode>(
    ["today", "featured", "upcoming", "all"].includes(filterParam) ? filterParam : "today",
  );
  const [dayKey, setDayKey] = useState<string | null>(
    dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : null,
  );
  const [activeCategory, setActiveCategory] = useState<ShopCategory>(
    SHOP_CATEGORIES.includes(categoryParam) ? categoryParam : "All",
  );
  const [quickViewDeal, setQuickViewDeal] = useState<ShopDeal | null>(null);

  const queryClient = useQueryClient();

  // Merchants never see their own deals in the marketplace feed.
  const myShopQuery = useMyShop();
  const myShopId = myShopQuery.data?.id ?? null;

  const { coordinates: globalCoords, location: globalLocation } = useLocation();
  const [geoDetecting, setGeoDetecting] = useState(false);
  const [geoFilter, setGeoFilter] = useState<GeoFilterState>({
    coordinates: null,
    maxDistanceKm: 0,
    locationAvailable: false,
    scope: "radius",
  });
  const [geoVisibleShopIds, setGeoVisibleShopIds] = useState<Set<string> | null>(null);

  const dealsQuery = useDeals(100);
  const deals = useMemo(() => {
    const all = dealsQuery.data ?? EMPTY_DEALS;
    return myShopId ? all.filter((d) => d.shop_id !== myShopId) : all;
  }, [dealsQuery.data, myShopId]);
  const loading = dealsQuery.isLoading;
  const error = dealsQuery.error ? dealsQuery.error.message : null;

  // Real shop rows (with coordinates) to reuse the proximity engine for deals.
  const shopsQuery = useShops();
  const shops = shopsQuery.data ?? EMPTY_SHOPS;

  const dealShopIds = useMemo(
    () => [...new Set(deals.map((d) => d.shop_id).filter(Boolean))],
    [deals],
  );
  const couponsQuery = useShopCoupons(dealShopIds);
  const shopCoupons: Record<string, Coupon[]> = couponsQuery.data ?? EMPTY_COUPONS;
  const deliveryQuery = useShopDeliveryMeta(dealShopIds);
  const shopDelivery: Record<string, ShopDeliveryMeta> = deliveryQuery.data ?? EMPTY_DELIVERY;

  // Pseudo-shops for the deal feed (joined with real shop coordinates).
  const dealShops = useMemo(() => {
    const shopById = new Map(shops.map((s) => [s.id, s]));
    const map = new Map<string, Shop>();
    for (const d of deals) {
      if (!d.shop_id || map.has(d.shop_id)) continue;
      const s = shopById.get(d.shop_id);
      map.set(d.shop_id, {
        id: d.shop_id,
        name: s?.name ?? d.shop_name ?? "",
        category: s?.category ?? "",
        location: s?.location ?? "",
        whatsapp_number: s?.whatsapp_number ?? d.shop_whatsapp ?? "",
        is_live: true,
        latitude: s?.latitude ?? null,
        longitude: s?.longitude ?? null,
        service_radius_km: s?.service_radius_km ?? null,
        delivery_zones: s?.delivery_zones ?? null,
      });
    }
    return [...map.values()];
  }, [deals, shops]);

  // Deal → shop category, so customers can single-tap a category (Food, etc.)
  // and see only deals from shops in that category.
  const shopCategoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shops) map.set(s.id, s.category);
    return map;
  }, [shops]);

  const availableCategories = useMemo(() => {
    const present = new Set<string>();
    for (const d of deals) {
      present.add(shopCategoryById.get(d.shop_id) ?? "Others / Universal");
    }
    return SHOP_CATEGORIES.filter((c) => c !== "All" && present.has(c));
  }, [deals, shopCategoryById]);

  // Geo filter — hide deals from shops outside the selected area / radius.
  useEffect(() => {
    let cancelled = false;
    async function compute() {
      if (dealShops.length === 0) {
        setGeoVisibleShopIds(null);
        return;
      }
      const scope = geoFilter.scope;
      const coords = geoFilter.coordinates ?? globalCoords ?? null;

      if ((scope === "pakistan" || scope === "city") && !coords) {
        setGeoVisibleShopIds(null);
        return;
      }
      if (scope === "radius" && !coords) {
        setGeoVisibleShopIds(null);
        return;
      }

      try {
        const result = await filterShopsByProximity(dealShops, {
          coordinates: coords,
          maxDistanceKm: scope === "radius" ? geoFilter.maxDistanceKm : 0,
          enforceServiceRadius: true,
          sortByProximity: false,
          scope,
          deliveryZone: globalLocation?.deliveryZone ?? undefined,
          customerCity: globalLocation?.city ?? undefined,
          customerArea: getCustomerArea(globalLocation),
        });
        if (!cancelled) {
          setGeoVisibleShopIds(new Set(result.shops.map((s) => s.id)));
        }
      } catch {
        if (!cancelled) setGeoVisibleShopIds(null);
      }
    }
    compute();
    return () => {
      cancelled = true;
    };
  }, [dealShops, geoFilter, globalCoords, globalLocation]);

  // Re-sync local state when URL changes (back/forward).
  useEffect(() => {
    setQuery(qParam);
    setFilter(
      ["today", "featured", "upcoming", "all"].includes(filterParam) ? filterParam : "today",
    );
    setDayKey(dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : null);
    setActiveCategory(SHOP_CATEGORIES.includes(categoryParam) ? categoryParam : "All");
  }, [qParam, filterParam, dayParam, categoryParam]);

  // Invalidate cached queries when merchants publish/update in other tabs.
  useEffect(() => {
    const onDeals = () => queryClient.invalidateQueries({ queryKey: ["deals"] });
    const onCoupons = () => queryClient.invalidateQueries({ queryKey: ["coupons"] });
    window.addEventListener("trendmart:deals-updated", onDeals);
    window.addEventListener("trendmart:coupons-updated", onCoupons);
    return () => {
      window.removeEventListener("trendmart:deals-updated", onDeals);
      window.removeEventListener("trendmart:coupons-updated", onCoupons);
    };
  }, [queryClient]);

  const todayKey = toPkDateKey();

  const syncUrl = useCallback(
    (next: {
      q?: string;
      filter?: FilterMode;
      day?: string | null;
      category?: ShopCategory;
    }) => {
      const params = new URLSearchParams();
      const q = next.q !== undefined ? next.q : query;
      const f = next.filter !== undefined ? next.filter : filter;
      const day = next.day !== undefined ? next.day : dayKey;
      const cat = next.category !== undefined ? next.category : activeCategory;
      if (q.trim()) params.set("q", q.trim());
      if (f && f !== "today") params.set("filter", f);
      if (day) params.set("day", day);
      if (cat && cat !== "All") params.set("category", cat);
      const qs = params.toString();
      router.replace(qs ? `/deals?${qs}` : "/deals", { scroll: false });
    },
    [router, query, filter, dayKey, activeCategory],
  );

  const selectDay = useCallback(
    (key: string | null) => {
      setDayKey(key);
      // Day pick overrides quick chips — keep filter as "all" for clarity
      if (key) {
        setFilter("all");
        syncUrl({ day: key, filter: "all" });
      } else {
        syncUrl({ day: null });
      }
    },
    [syncUrl, setDayKey, setFilter],
  );

  const handleCategoryChange = useCallback(
    (category: ShopCategory) => {
      setActiveCategory(category);
      syncUrl({ category });
    },
    [syncUrl],
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

    // Single-tap category filter — e.g. "Fast Food & Restaurants" shows only
    // deals from shops in that category (derived from the shop row).
    if (activeCategory !== "All") {
      const target = activeCategory;
      list = list.filter(
        (d) => (shopCategoryById.get(d.shop_id) ?? "Others / Universal") === target,
      );
    }

    const q = query.trim();
    if (q) {
      list = fuzzyFilterAndRank(
        list,
        q,
        (d) => [dealSearchHaystack(d), formatDealWhenTag(d), d.title, d.badge_text, d.shop_name],
        { minScore: FUZZY_MIN_SCORE, weights: [1, 1, 0.95, 0.9, 0.75] },
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

    // Area filter: only keep deals from shops in the selected ilaqa / radius.
    if (geoVisibleShopIds) {
      list = list.filter((d) => geoVisibleShopIds.has(d.shop_id));
    }

    return list;
  }, [
    deals,
    query,
    filter,
    dayKey,
    todayKey,
    offerDays,
    geoVisibleShopIds,
    activeCategory,
    shopCategoryById,
  ]);

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
    syncUrl({ q: query });
  };

  const FILTERS: { value: FilterMode; label: string }[] = [
    { value: "today", label: "Live today" },
    { value: "featured", label: "Featured" },
    { value: "upcoming", label: "Upcoming" },
    { value: "all", label: "All active" },
  ];

  const resultHint = [
    dayKey
      ? `on ${formatOfferDayLabel(dayKey, todayKey)}`
      : filter === "today"
        ? "live today"
        : filter === "featured"
          ? "featured today"
          : filter === "upcoming"
            ? "upcoming"
            : "active",
    activeCategory !== "All" ? `in ${activeCategory}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 page-stack px-3 py-3 pb-3 md:px-4 md:py-5 md:pb-8">
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
              Filter by weekday or date — see which stores have deals that day.
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
            placeholder="Search deals"
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

      {/* Single-tap category filter — only categories that actually have deals. */}
      {availableCategories.length > 0 ? (
        <section aria-label="Filter deals by category" className="tm-cat-bar -mx-3 sm:-mx-4">
          <div className="tm-cat-scroll px-2 scrollbar-none sm:px-3">
            <button
              type="button"
              onClick={() => handleCategoryChange("All")}
              className={`tm-cat-tab${activeCategory === "All" ? " is-active" : ""}`}
              aria-pressed={activeCategory === "All"}
            >
              <span className="tm-cat-tab-label">All deals</span>
              <span className="tm-cat-tab-line" aria-hidden="true" />
            </button>
            {availableCategories.map((category) => {
              const isActive = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => handleCategoryChange(category)}
                  className={`tm-cat-tab${isActive ? " is-active" : ""}`}
                  aria-pressed={isActive}
                >
                  <span className="tm-cat-tab-label">{category}</span>
                  <span className="tm-cat-tab-line" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <DealDayDateFilter
        deals={deals}
        selectedDateKey={dayKey}
        onSelectDate={selectDay}
        daysAhead={14}
      />

      <div className="sticky top-[var(--tm-navbar-sticky-offset,4.35rem)] z-30 -mx-3 mb-3 border-b border-zinc-100/80 bg-white/95 px-3 py-2 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none dark:sm:bg-transparent">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none">
            {FILTERS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setFilter(opt.value);
                  setDayKey(null);
                  syncUrl({ filter: opt.value, day: null });
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
          <GeoRadiusFilter
            onFilterChange={setGeoFilter}
            isDetecting={geoDetecting}
            onDetectStart={() => setGeoDetecting(true)}
            onDetectEnd={() => setGeoDetecting(false)}
          />
        </div>
      </div>

      <p className="mb-2 text-[11px] text-zinc-400 dark:text-zinc-500">
        {loading
          ? "Loading deals…"
          : `${filtered.length} deal${filtered.length === 1 ? "" : "s"} ${resultHint}`}
      </p>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => dealsQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="tm-product-card flex flex-col overflow-hidden">
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
            {dayKey
              ? `No ${activeCategory !== "All" ? `${activeCategory.toLowerCase()} ` : ""}deals on ${formatOfferDayLabel(dayKey, todayKey)}. Try another day or date.`
              : activeCategory !== "All"
                ? `No ${activeCategory.toLowerCase()} deals right now. Try another category or browse products instead.`
                : "Try another day, date, filter, or browse products instead."}
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
                setActiveCategory("All");
                syncUrl({ q: "", filter: "today", day: null, category: "All" });
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
              priority={i < 2}
              offerTags={getOfferTags(deal.shop_id)}
              onOpen={() => {
                setQuickViewDeal(deal);
                const p = dealToProduct(deal);
                trackProductView({
                  id: p.id,
                  name: deal.title,
                  price: Number(deal.price) || 0,
                  imageUrl: deal.image_url,
                  shopId: deal.shop_id,
                  shopName: deal.shop_name,
                  category: null,
                });
              }}
            />
          ))}
        </div>
      )}

      {quickViewDeal && (
        <DealQuickView deal={quickViewDeal} onClose={() => setQuickViewDeal(null)} />
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
