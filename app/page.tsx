"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import type { Shop, ShopCategory, Story } from "@/types";
import { SHOP_CATEGORIES } from "@/types";
import {
  isStoryViewed,
  sortStoriesUnseenFirst,
} from "@/lib/storyViewed";
import { toggleFavorite as toggleFav } from "@/services/wishlistService";
import { useToast } from "@/components/Toast";
import { useMerchantQuickAdd } from "@/context/MerchantQuickAddContext";
import { getSafeImageUrl } from "@/services/storageService";
import { filterShopsByProximity } from "@/services/geoRadiusService";
import type { ShopWithDistance } from "@/services/geoRadiusService";
import { useLocation } from "@/context/LocationContext";
import ShopCard from "@/components/ShopCard";
import SubCategoryPills from "@/components/SubCategoryPills";
import OfferDaysStrip from "@/components/OfferDaysStrip";
import GeoRadiusFilter, { type GeoFilterState } from "@/components/GeoRadiusFilter";
import { fetchShopIdsBySubCategory } from "@/services/productService";
import { type Coupon } from "@/services/couponService";
import { shopIdsWithDealOnDate, type ShopDeal } from "@/lib/dealSchedule";
import { useQueryClient } from "@tanstack/react-query";
import { useShops, useStories, useDeals, useShopCoupons, useMyShop } from "@/lib/queries";
import { fuzzyFilterAndRank, FUZZY_MIN_SCORE } from "@/lib/fuzzySearch";
import { buildShopTickerTags } from "@/lib/shopOfferLabels";

const StoriesViewer = dynamic(() => import("@/components/StoriesViewer"), {
  ssr: false,
});
const FeaturedDealsStrip = dynamic(() => import("@/components/FeaturedDealsStrip"), {
  loading: () => <div className="h-40 w-full animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/50" aria-hidden />,
});
const PromoAdsCarousel = dynamic(() => import("@/components/PromoAdsCarousel"), {
  loading: () => null,
});

/* Stable empty fallbacks so derived memos don't change identity every render. */
const EMPTY_SHOPS: Shop[] = [];
const EMPTY_DEALS: ShopDeal[] = [];
const EMPTY_STORIES: Story[] = [];
const EMPTY_COUPONS: Record<string, Coupon[]> = {};

/* -------------------------------------------------------------------------- */
/*  HomeInner Component                                                        */
/* -------------------------------------------------------------------------- */

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategory = (searchParams.get("category") as ShopCategory) ?? "All";

  const queryClient = useQueryClient();

  const shopsQuery = useShops();
  const shops = shopsQuery.data ?? EMPTY_SHOPS;
  const loading = shopsQuery.isLoading;
  const error = shopsQuery.error ? shopsQuery.error.message : null;

  const dealsQuery = useDeals(48);
  const activeDeals = dealsQuery.data ?? EMPTY_DEALS;

  const storiesQuery = useStories();
  const [storiesVersion, setStoriesVersion] = useState(0);
  const stories = useMemo(() => {
    void storiesVersion; // re-sort when a story gets marked as seen
    return sortStoriesUnseenFirst(storiesQuery.data ?? EMPTY_STORIES);
  }, [storiesQuery.data, storiesVersion]);

  const myShopQuery = useMyShop();
  const myShop = useMemo(
    () =>
      myShopQuery.data
        ? {
            id: myShopQuery.data.id,
            category: myShopQuery.data.category,
            name: myShopQuery.data.name,
          }
        : null,
    [myShopQuery.data],
  );

  const shopIds = useMemo(
    () => shops.map((s) => s.id).filter(Boolean),
    [shops],
  );
  const couponsQuery = useShopCoupons(shopIds);
  const shopCoupons: Record<string, Coupon[]> = couponsQuery.data ?? EMPTY_COUPONS;

  const [offerDateKey, setOfferDateKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const [activeCategory, setActiveCategory] = useState<ShopCategory>(SHOP_CATEGORIES.includes(initialCategory) ? initialCategory : "All");
  const [activeSubCategoryId, setActiveSubCategoryId] = useState<string | null>(
    () => searchParams.get("sub") || null,
  );
  const [subCategoryShopIds, setSubCategoryShopIds] = useState<Set<string> | null>(null);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      if (typeof window === "undefined") return new Set();
      const raw = localStorage.getItem("trendmart_favorites");
      if (raw) {
        const all = JSON.parse(raw) as { id: string }[];
        return new Set(all.map((f) => f.id));
      }
    } catch { /* ignore */ }
    return new Set();
  });

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of shops) {
      const key = s.category || "Other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([key, count]) => ({
      key: key as ShopCategory,
      count,
    }));
  }, [shops]);

  const [brokenImgs, setBrokenImgs] = useState<Set<string>>(new Set());
  const [brokenStoryImgs, setBrokenStoryImgs] = useState<Set<string>>(new Set());
  const { addToast } = useToast();
  const { openQuickAdd } = useMerchantQuickAdd();

  // Header LocationPicker + homepage area filter (Near me / City / All Pakistan)
  const { location: globalLocation, coordinates: globalCoords } = useLocation();

  const [geoFiltering, setGeoFiltering] = useState(false);
  const [geoDetecting, setGeoDetecting] = useState(false);
  const [geoFilteredShops, setGeoFilteredShops] = useState<ShopWithDistance[]>([]);
  const [proximityActive, setProximityActive] = useState(false);
  const [geoFilter, setGeoFilter] = useState<GeoFilterState>({
    coordinates: null,
    maxDistanceKm: 0,
    locationAvailable: false,
    scope: "radius",
  });

  /* Invalidate cached queries when merchants publish/update in other tabs. */
  useEffect(() => {
    const onStoriesUpdated = () =>
      queryClient.invalidateQueries({ queryKey: ["stories"] });
    const onDealsUpdated = () =>
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    window.addEventListener("trendmart:stories-updated", onStoriesUpdated);
    window.addEventListener("trendmart:deals-updated", onDealsUpdated);
    return () => {
      window.removeEventListener("trendmart:stories-updated", onStoriesUpdated);
      window.removeEventListener("trendmart:deals-updated", onDealsUpdated);
    };
  }, [queryClient]);

  /* Load shop IDs that have products in the selected sub-category */
  useEffect(() => {
    let cancelled = false;
    if (!activeSubCategoryId) {
      setSubCategoryShopIds(null);
      return;
    }
    fetchShopIdsBySubCategory(activeSubCategoryId).then((result) => {
      if (cancelled) return;
      if (result.success) setSubCategoryShopIds(new Set(result.data));
      else setSubCategoryShopIds(new Set());
    });
    return () => {
      cancelled = true;
    };
  }, [activeSubCategoryId]);

  /* Client-side filtering */
  const filteredShops = useMemo(() => {
    const dealShopIds = offerDateKey ? shopIdsWithDealOnDate(activeDeals, offerDateKey) : null;
    const base = shops.filter((shop) => {
      const matchesCategory = activeCategory === "All" || shop.category === activeCategory;
      const matchesSub =
        !activeSubCategoryId ||
        !subCategoryShopIds ||
        subCategoryShopIds.has(shop.id);
      const matchesOffer = !dealShopIds || dealShopIds.has(shop.id);
      return matchesCategory && matchesSub && matchesOffer;
    });

    const query = searchQuery.trim();
    if (!query) return base;

    return fuzzyFilterAndRank(
      base,
      query,
      (shop) => [shop.name, shop.category, shop.location, shop.store_bio],
      { minScore: FUZZY_MIN_SCORE, weights: [1, 0.7, 0.55, 0.45] },
    ).map((r) => r.item);
  }, [shops, searchQuery, activeCategory, activeSubCategoryId, subCategoryShopIds, offerDateKey, activeDeals]);

  const getDealStripOfferTags = useCallback(
    (shopId: string) => {
      const shop = shops.find((s) => s.id === shopId);
      return buildShopTickerTags({
        coupons: shopCoupons[shopId] ?? [],
        freeDeliveryThreshold: shop?.free_delivery_threshold,
        deliveryFeeFlat: shop?.delivery_fee_flat,
        deliveryFeePerKm: shop?.delivery_fee_per_km,
      });
    },
    [shops, shopCoupons],
  );

  /* Geo filter — Near me (range) / This city / All Pakistan */
  useEffect(() => {
    let cancelled = false;
    async function applyGeoFilter() {
      const scope = geoFilter.scope;
      const coords = geoFilter.coordinates ?? globalCoords ?? null;

      // Default nationwide browse with no pin: show all category-filtered shops
      if (scope === "pakistan" && !coords) {
        setProximityActive(false);
        setGeoFilteredShops([]);
        setGeoFiltering(false);
        return;
      }

      // Radius mode needs a pin; otherwise fall back to unfiltered list
      if (scope === "radius" && !coords) {
        setProximityActive(false);
        setGeoFilteredShops([]);
        setGeoFiltering(false);
        return;
      }

      setGeoFiltering(true);
      try {
        const result = await filterShopsByProximity(filteredShops, {
          coordinates: coords,
          maxDistanceKm: scope === "radius" ? geoFilter.maxDistanceKm : 0,
          enforceServiceRadius: scope === "radius",
          sortByProximity: true,
          scope,
          deliveryZone: globalLocation?.deliveryZone ?? undefined,
          customerCity: globalLocation?.city ?? undefined,
        });
        if (!cancelled) {
          setGeoFilteredShops(result.shops);
          setProximityActive(true);
        }
      } catch {
        if (!cancelled) {
          setGeoFilteredShops([]);
          setProximityActive(false);
        }
      }
      if (!cancelled) setGeoFiltering(false);
    }
    applyGeoFilter();
    return () => {
      cancelled = true;
    };
  }, [filteredShops, geoFilter, globalCoords, globalLocation]);

  const displayShops = proximityActive ? geoFilteredShops : filteredShops;
  const showProximityBadges =
    proximityActive &&
    (geoFilter.scope === "radius"
      ? !!globalCoords || !!geoFilter.coordinates
      : geoFilter.scope === "city" || geoFilter.scope === "pakistan");
  const areaBadgeLabel =
    geoFilter.scope === "pakistan"
      ? "All Pakistan"
      : geoFilter.scope === "city"
        ? globalLocation?.city
          ? `${globalLocation.city}`
          : "This city"
        : geoFilter.maxDistanceKm > 0
          ? `Within ${geoFilter.maxDistanceKm} km`
          : "Near you first";

  const handleCategoryChange = useCallback((category: ShopCategory) => {
    setActiveCategory(category);
    setActiveSubCategoryId(null);
    const params = new URLSearchParams(searchParams.toString());
    if (category === "All") params.delete("category");
    else params.set("category", category);
    params.delete("sub");
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    else params.delete("q");
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [searchParams, searchQuery, router]);

  const handleSubCategoryChange = useCallback(
    (subId: string | null) => {
      setActiveSubCategoryId(subId);
      const params = new URLSearchParams(searchParams.toString());
      if (subId) params.set("sub", subId);
      else params.delete("sub");
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 page-stack px-3 py-3 pb-24 md:px-4 md:py-5 md:pb-8">
      {/* ── Categories (Daraz-style tabs, polished) ───────────────── */}
      <section aria-label="Category filters" className="tm-cat-bar -mx-3 sm:-mx-4">
        <div className="tm-cat-scroll px-2 scrollbar-none sm:px-3">
          {SHOP_CATEGORIES.map((category) => {
            const isActive = activeCategory === category;
            const catCount = categoryCounts.find((c) => c.key === category)?.count;
            return (
              <button
                key={category}
                type="button"
                onClick={() => handleCategoryChange(category)}
                className={`tm-cat-tab${isActive ? " is-active" : ""}`}
                aria-label={`${category}${catCount !== undefined ? ` — ${catCount} shop${catCount !== 1 ? "s" : ""}` : ""}`}
                aria-pressed={isActive}
              >
                <span className="tm-cat-tab-label">{category}</span>
                {catCount !== undefined ? (
                  <span className="tm-cat-tab-count">{catCount}</span>
                ) : null}
                <span className="tm-cat-tab-line" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      {activeCategory !== "All" && (
        <SubCategoryPills
          mainCategory={activeCategory}
          selectedId={activeSubCategoryId}
          onSelect={(id) => handleSubCategoryChange(id)}
          label="Filter by sub-category"
        />
      )}

      {/* Stories — first content under category tabs */}
      <section aria-label="Merchant stories" className="mt-1 mb-3">
        <h2 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Stories</h2>
        <div className="-mx-3 flex gap-3.5 overflow-x-auto px-3 pb-1 scrollbar-none">
          {myShop ? (
            <button
              type="button"
              onClick={() =>
                openQuickAdd({ shopId: myShop.id, shopCategory: myShop.category, tab: "story" })
              }
              className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="Add your store story"
            >
              <div className="rounded-full bg-gradient-to-tr from-emerald-500 via-teal-400 to-emerald-600 p-[2.5px]">
                <div className="relative flex h-[3.35rem] w-[3.35rem] items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-white dark:bg-zinc-900 dark:ring-zinc-950">
                  <span className="text-2xl font-bold leading-none text-emerald-600 dark:text-emerald-400">+</span>
                </div>
              </div>
              <span className="w-full truncate text-center text-[0.62rem] font-medium leading-tight text-zinc-600 dark:text-zinc-300">
                Your story
              </span>
            </button>
          ) : null}

          {stories.length === 0 && !myShop ? (
            <p className="px-3 text-xs text-zinc-400 dark:text-zinc-500">No active stories right now.</p>
          ) : (
            stories.map((story, i) => {
              const seen = isStoryViewed(story.id);
              const label =
                story.shop_name?.trim() ||
                story.caption?.trim() ||
                "Store";
              const initial = label.charAt(0).toUpperCase() || "?";
              return (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => {
                    setSelectedStoryIndex(i);
                    setStoryViewerOpen(true);
                  }}
                  className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  aria-label={`${label} story${seen ? " (viewed)" : ""}`}
                >
                  <div
                    className={`rounded-full p-[2.5px] ${
                      seen
                        ? "bg-zinc-300 dark:bg-zinc-600"
                        : "bg-gradient-to-tr from-emerald-500 via-teal-400 to-emerald-600"
                    }`}
                  >
                    <div className="relative h-[3.35rem] w-[3.35rem] overflow-hidden rounded-full bg-white ring-2 ring-white dark:bg-zinc-900 dark:ring-zinc-950">
                      {story.image_url && !brokenStoryImgs.has(story.id) ? (
                        <Image
                          src={getSafeImageUrl(story.image_url, "product")}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="3.35rem"
                          onError={() =>
                            setBrokenStoryImgs((prev) => new Set(prev).add(story.id))
                          }
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-base font-bold text-emerald-600 dark:text-emerald-400">
                          {initial}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="w-full truncate text-center text-[0.62rem] font-medium leading-tight text-zinc-600 dark:text-zinc-300">
                    {label}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>

      {storyViewerOpen && (
        <StoriesViewer
          stories={stories}
          initialIndex={selectedStoryIndex}
          onClose={() => {
            setStoryViewerOpen(false);
            setStoriesVersion((v) => v + 1);
          }}
        />
      )}

      {/* Deals block — day chips + cards together (not split by Stories) */}
      <section aria-label="Featured deals" className="mb-5 space-y-2 sm:mb-6">
        <OfferDaysStrip
          deals={activeDeals}
          selectedDateKey={offerDateKey}
          onSelect={setOfferDateKey}
          variant="pills"
        />
        <FeaturedDealsStrip
          deals={activeDeals}
          dateKey={offerDateKey}
          title="Featured deals"
          seeAllHref="/deals"
          variant="home"
          getOfferTags={getDealStripOfferTags}
        />
      </section>

      {/* ── Sponsored / Promotional Ads Carousel ───────────────────── */}
      <PromoAdsCarousel placement="homepage_top" />

      {geoFiltering && (
        <p className="animate-pulse text-xs text-teal-600/80 dark:text-teal-400/80">
          Updating shops for your area…
        </p>
      )}

      {/* ── Live Shops Grid ───────────────────────────────────────── */}
      <section aria-label="Live shops">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-[1.05rem]">
                Live Shops
              </h2>
              <Link
                href="/products"
                className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
              >
                Browse products →
              </Link>
              <Link
                href="/deals"
                className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
              >
                All deals →
              </Link>
            </div>
            {!loading && (
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {displayShops.length} shop{displayShops.length !== 1 && "s"}
                {showProximityBadges && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 px-2 py-0.5 text-[0.65rem] font-semibold text-teal-700 dark:from-emerald-950/50 dark:to-teal-950/40 dark:text-teal-300">
                    {areaBadgeLabel}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="w-full sm:w-auto">
            <GeoRadiusFilter
              onFilterChange={setGeoFilter}
              isDetecting={geoDetecting}
              onDetectStart={() => setGeoDetecting(true)}
              onDetectEnd={() => setGeoDetecting(false)}
            />
          </div>
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="aspect-[16/10] bg-zinc-200 dark:bg-zinc-800" />
                <div className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-3 flex-1 rounded bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                  <div className="h-2.5 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-8 w-full rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="py-12 text-center">
            <p className="mb-1 text-sm text-red-600 dark:text-red-400">{error}</p>
            <button type="button" onClick={() => window.location.reload()} className="text-xs font-medium text-emerald-600 underline underline-offset-2 dark:text-emerald-400">Retry</button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && displayShops.length === 0 && (
          <div className="mx-auto max-w-md py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-600/20">
              <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M3 9l1.12-5.6A1 1 0 0 1 5.1 3h13.8a1 1 0 0 1 .98.8L21 9" strokeLinecap="round" />
                <path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" strokeLinecap="round" />
                <path d="M9 21V9h6v12" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
              {searchQuery || activeCategory !== "All" ? "No shops match" : "No shops nearby yet"}
            </h3>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              {searchQuery || activeCategory !== "All"
                ? "Try another category, clear search, or widen your area filter."
                : "Browse products and deals while local stores come online. You can shop freely — checkout uses a verified email."}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {(searchQuery || activeCategory !== "All") && (
                <button
                  type="button"
                  onClick={() => {
                    handleCategoryChange("All");
                    handleSubCategoryChange(null);
                  }}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Clear filters
                </button>
              )}
              <Link
                href="/products"
                className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Browse products
              </Link>
              <Link
                href="/deals"
                className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                See deals
              </Link>
            </div>
          </div>
        )}

        {/* Shop cards — 2 mobile / 3 tablet / 4 laptop / 5 wide desktop */}
        {!loading && !error && displayShops.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {displayShops.map((shop, index) => {
              const bannerBroken = brokenImgs.has(`banner:${shop.id}`);
              const logoBroken = brokenImgs.has(`logo:${shop.id}`);
              const withDistance = shop as ShopWithDistance;
              return (
                <ShopCard
                  key={shop.id}
                  priority={index < 2}
                  shop={{
                    id: shop.id,
                    name: shop.name,
                    slug: shop.slug,
                    category: shop.category,
                    location: shop.location,
                    logo_url: shop.logo_url,
                    banner_url: shop.banner_url,
                    is_live: shop.is_live,
                    verification_status: shop.verification_status,
                    distance_km: withDistance.distance_km,
                    business_hours: shop.business_hours,
                    operating_status: shop.operating_status,
                    announcement: shop.announcement,
                    announcement_expires_at: shop.announcement_expires_at,
                    free_delivery_threshold: shop.free_delivery_threshold,
                    avg_rating: shop.avg_rating,
                    review_count: shop.review_count,
                    coupons: shopCoupons[shop.id],
                    deals: activeDeals.filter((d) => d.shop_id === shop.id),
                  }}
                  favorited={favorites.has(shop.id)}
                  showDistance={showProximityBadges}
                  bannerBroken={bannerBroken}
                  logoBroken={logoBroken}
                  onBannerError={() =>
                    setBrokenImgs((prev) => new Set(prev).add(`banner:${shop.id}`))
                  }
                  onLogoError={() =>
                    setBrokenImgs((prev) => new Set(prev).add(`logo:${shop.id}`))
                  }
                  onToggleFavorite={async () => {
                    const nowFav = await toggleFav(
                      shop.id,
                      "shop",
                      shop.name,
                      shop.logo_url ?? undefined,
                    );
                    setFavorites((prev) => {
                      const next = new Set(prev);
                      if (nowFav) next.add(shop.id);
                      else next.delete(shop.id);
                      return next;
                    });
                    addToast(
                      nowFav ? "Added to wishlist" : "Removed from wishlist",
                      "info",
                    );
                  }}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Exported Page                                                              */
/* -------------------------------------------------------------------------- */

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--tm-bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    }>
      <HomeInner />
    </Suspense>
  );
}