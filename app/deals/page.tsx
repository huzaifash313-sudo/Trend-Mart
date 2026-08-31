"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import DealCard from "@/components/DealCard";
import SearchInput from "@/components/SearchInput";
import FadeScrollX from "@/components/FadeScrollX";
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
import {
  fetchAllSubCategoriesGrouped,
  fetchSubCategories,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";

const DealQuickView = dynamic(() => import("@/components/DealQuickView"), {
  ssr: false,
});

const PromoAdsCarousel = dynamic(() => import("@/components/PromoAdsCarousel"), {
  ssr: false,
});

type FilterMode = "today" | "featured" | "upcoming" | "all";

/* Stable empty fallbacks so derived memos don't change identity every render. */
const EMPTY_DEALS: ShopDeal[] = [];
const EMPTY_COUPONS: Record<string, Coupon[]> = {};
const EMPTY_DELIVERY: Record<string, ShopDeliveryMeta> = {};
const EMPTY_SHOPS: Shop[] = [];

function DealsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qParam = searchParams.get("q") ?? "";
  const filterParam = (searchParams.get("filter") as FilterMode | null) ?? "today";
  const dayParam = searchParams.get("day");
  const categoryParam = (searchParams.get("category") as ShopCategory | null) ?? "All";
  const subParam = searchParams.get("sub");

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
  const [activeSubCategoryId, setActiveSubCategoryId] = useState<string | null>(
    subParam && subParam.length <= 64 ? subParam : null,
  );
  const [subs, setSubs] = useState<SubCategoryWithMeta[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  // Full taxonomy (grouped by main category) so the global search box can match
  // sub-category names even before a specific category is selected.
  const [allSubGroups, setAllSubGroups] = useState<Record<string, SubCategoryWithMeta[]>>({});
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

  // Sub-category drill-down — fetch the taxonomy for the selected main category,
  // then derive which sub-categories actually have deals. Deals without a linked
  // product sub-category roll into that category's "Others" entry so nothing is
  // ever hidden by the drill-down.
  useEffect(() => {
    let cancelled = false;
    setSubs([]);
    if (!activeCategory || activeCategory === "All") {
      setSubsLoading(false);
      return;
    }
    setSubsLoading(true);
    fetchSubCategories(activeCategory)
      .then((res) => {
        if (cancelled) return;
        const next = res.success ? res.data : [];
        setSubs(next);
        setSubsLoading(false);
        const ids = new Set(next.map((s) => s.id));
        setActiveSubCategoryId((prev) => (prev && ids.has(prev) ? prev : null));
      })
      .catch(() => {
        if (!cancelled) {
          setSubs([]);
          setSubsLoading(false);
          setActiveSubCategoryId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

  const knownSubIds = useMemo(() => new Set(subs.map((s) => s.id)), [subs]);
  const othersSub = useMemo(() => subs.find((s) => s.is_others) ?? null, [subs]);
  const othersSubId = othersSub?.id ?? null;
  const subNameById = useMemo(() => new Map(subs.map((s) => [s.id, s.name])), [subs]);

  // One-time fetch of the full taxonomy for global search-by-sub-category.
  useEffect(() => {
    let cancelled = false;
    fetchAllSubCategoriesGrouped()
      .then((res) => {
        if (!cancelled && res.success) setAllSubGroups(res.data);
      })
      .catch(() => {
        /* taxonomy is optional for search — deals still work without it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allSubNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const list of Object.values(allSubGroups)) {
      for (const s of list) m.set(s.id, s.name);
    }
    return m;
  }, [allSubGroups]);

  // Which sub-categories (by id) have deals inside the selected main category.
  const subCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of deals) {
      const cat = shopCategoryById.get(d.shop_id) ?? "Others / Universal";
      if (cat !== activeCategory) continue;
      const subId =
        d.sub_category_id && knownSubIds.has(d.sub_category_id)
          ? d.sub_category_id
          : othersSubId;
      if (!subId) continue;
      counts.set(subId, (counts.get(subId) ?? 0) + 1);
    }
    return counts;
  }, [deals, activeCategory, shopCategoryById, knownSubIds, othersSubId]);

  const visibleSubs = useMemo(
    () => subs.filter((s) => (subCounts.get(s.id) ?? 0) > 0),
    [subs, subCounts],
  );

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

      // All Pakistan never narrows by location — show every shop's deals.
      if (scope === "pakistan") {
        setGeoVisibleShopIds(null);
        return;
      }
      // No pin + city browse → no location restriction on deals.
      if (scope === "city" && !coords) {
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
    setActiveSubCategoryId(subParam && subParam.length <= 64 ? subParam : null);
  }, [qParam, filterParam, dayParam, categoryParam, subParam]);

  // Invalidate cached queries when merchants publish/update in other tabs.
  useEffect(() => {
    const onDeals = () => queryClient.invalidateQueries({ queryKey: ["deals"] });
    const onCoupons = () => queryClient.invalidateQueries({ queryKey: ["coupons"] });
    window.addEventListener("trendsmart:deals-updated", onDeals);
    window.addEventListener("trendsmart:coupons-updated", onCoupons);
    return () => {
      window.removeEventListener("trendsmart:deals-updated", onDeals);
      window.removeEventListener("trendsmart:coupons-updated", onCoupons);
    };
  }, [queryClient]);

  const todayKey = toPkDateKey();

  const syncUrl = useCallback(
    (next: {
      q?: string;
      filter?: FilterMode;
      day?: string | null;
      category?: ShopCategory;
      sub?: string | null;
    }) => {
      const params = new URLSearchParams();
      const q = next.q !== undefined ? next.q : query;
      const f = next.filter !== undefined ? next.filter : filter;
      const day = next.day !== undefined ? next.day : dayKey;
      const cat = next.category !== undefined ? next.category : activeCategory;
      const sub = next.sub !== undefined ? next.sub : activeSubCategoryId;
      if (q.trim()) params.set("q", q.trim());
      if (f && f !== "today") params.set("filter", f);
      if (day) params.set("day", day);
      if (cat && cat !== "All") params.set("category", cat);
      if (sub) params.set("sub", sub);
      const qs = params.toString();
      router.replace(qs ? `/deals?${qs}` : "/deals", { scroll: false });
    },
    [router, query, filter, dayKey, activeCategory, activeSubCategoryId],
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
      setActiveSubCategoryId(null);
      syncUrl({ category, sub: null });
    },
    [syncUrl],
  );

  const handleSubCategoryChange = useCallback(
    (subId: string | null) => {
      setActiveSubCategoryId(subId);
      syncUrl({ sub: subId });
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

    // Sub-category drill-down — deals without a linked product sub-category roll
    // into this category's "Others" entry so no deal is ever missed.
    if (activeCategory !== "All" && activeSubCategoryId && subs.length > 0) {
      const target = activeSubCategoryId;
      list = list.filter((d) => {
        const cat = shopCategoryById.get(d.shop_id) ?? "Others / Universal";
        if (cat !== activeCategory) return false;
        const subId =
          d.sub_category_id && knownSubIds.has(d.sub_category_id)
            ? d.sub_category_id
            : othersSubId;
        return subId === target;
      });
    }

    const q = query.trim();
    if (q) {
      const subNameOf = (d: ShopDeal): string => {
        if (d.sub_category_id) {
          return (
            subNameById.get(d.sub_category_id) ??
            allSubNameById.get(d.sub_category_id) ??
            ""
          );
        }
        if (othersSub && (shopCategoryById.get(d.shop_id) ?? "") === activeCategory) {
          return othersSub.name;
        }
        return "";
      };
      list = fuzzyFilterAndRank(
        list,
        q,
        (d) => [
          dealSearchHaystack(d),
          formatDealWhenTag(d),
          d.title,
          d.badge_text,
          d.shop_name,
          shopCategoryById.get(d.shop_id) ?? "",
          subNameOf(d),
        ],
        { minScore: FUZZY_MIN_SCORE, weights: [1, 1, 0.95, 0.9, 0.75, 0.6, 0.6] },
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
    activeSubCategoryId,
    subs,
    knownSubIds,
    othersSub,
    othersSubId,
    subNameById,
    allSubNameById,
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

  const subLabel = activeSubCategoryId
    ? (subNameById.get(activeSubCategoryId) ?? "selected sub-category")
    : null;

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
    subLabel ? `· ${subLabel}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 page-stack px-3 py-3 pb-3 md:px-4 md:py-5 md:pb-8">
      <header className="mb-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-[1.65rem]">
          Deals for you
        </h1>
      </header>

      <SearchInput
        value={query}
        onChange={setQuery}
        onSubmit={handleSearch}
        placeholder="Search deals"
        ariaLabel="Search deals"
        className="mb-3"
      />

      <PromoAdsCarousel placement="deals_top" className="mb-3" />

      {/* Single-tap category filter — only categories that actually have deals. */}
      {availableCategories.length > 0 ? (
        <section aria-label="Filter deals by category" className="tm-cat-bar -mx-3 sm:-mx-4">
          <FadeScrollX className="tm-cat-scroll px-2 sm:px-3">
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
          </FadeScrollX>
        </section>
      ) : null}

      {/* Sub-category drill-down for the selected main category. */}
      {activeCategory !== "All" && (subsLoading || visibleSubs.length > 0) ? (
        <section
          aria-label={`Filter deals by sub-category in ${activeCategory}`}
          className="tm-cat-bar tm-cat-bar--sub -mx-3 sm:-mx-4"
        >
          <FadeScrollX fadeColor="var(--tm-bg)" className="tm-cat-scroll px-2 sm:px-3">
            <button
              type="button"
              onClick={() => handleSubCategoryChange(null)}
              className={`tm-cat-tab${!activeSubCategoryId ? " is-active" : ""}`}
              aria-pressed={!activeSubCategoryId}
            >
              <span className="tm-cat-tab-label">All</span>
              <span className="tm-cat-tab-line" aria-hidden="true" />
            </button>
            {visibleSubs.map((sub) => {
              const count = subCounts.get(sub.id) ?? 0;
              const active = activeSubCategoryId === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => handleSubCategoryChange(active ? null : sub.id)}
                  className={`tm-cat-tab${active ? " is-active" : ""}`}
                  aria-pressed={active}
                >
                  <span className="tm-cat-tab-label">{sub.is_others ? "Others" : sub.name}</span>
                  {count > 0 ? <span className="tm-cat-tab-count">{count}</span> : null}
                  <span className="tm-cat-tab-line" aria-hidden="true" />
                </button>
              );
            })}
            {subsLoading ? (
              <span className="shrink-0 self-center px-2 text-[0.65rem] text-zinc-400 animate-pulse">
                Loading…
              </span>
            ) : null}
          </FadeScrollX>
        </section>
      ) : null}

      <DealDayDateFilter
        selectedDateKey={dayKey}
        onSelectDate={selectDay}
        daysAhead={14}
      />

      <div className="sticky top-[var(--tm-navbar-sticky-offset,4.35rem)] z-30 -mx-3 mb-2 border-b border-zinc-100/80 bg-white/95 px-3 py-1.5 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/95 sm:static sm:mx-0 sm:mb-2 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none dark:sm:bg-transparent">
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
              ? `No ${activeCategory !== "All" ? `${activeCategory.toLowerCase()} ` : ""}${subLabel ? `${subLabel.toLowerCase()} ` : ""}deals on ${formatOfferDayLabel(dayKey, todayKey)}. Try another day or date.`
              : activeCategory !== "All"
                ? `No ${activeCategory.toLowerCase()}${subLabel ? ` ${subLabel.toLowerCase()}` : ""} deals right now. Try another sub-category or browse products instead.`
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
                setActiveSubCategoryId(null);
                syncUrl({ q: "", filter: "today", day: null, category: "All", sub: null });
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
