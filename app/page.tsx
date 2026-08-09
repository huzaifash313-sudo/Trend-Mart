"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import type { Shop, ShopCategory } from "@/types";
import { SHOP_CATEGORIES } from "@/types";
import { fetchShops } from "@/services/shopService";
import { fetchActiveStories } from "@/services/storyService";
import type { Story } from "@/types";
import StoriesViewer from "@/components/StoriesViewer";
import { toggleFavorite as toggleFav } from "@/services/wishlistService";
import { useToast } from "@/components/Toast";
import { fetchCategoryCounts, getCategoryMeta, type CategoryWithCount } from "@/services/categoryService";
import { getSafeImageUrl } from "@/services/storageService";
import { filterShopsByProximity } from "@/services/geoRadiusService";
import type { ShopWithDistance } from "@/services/geoRadiusService";
import { useLocation } from "@/context/LocationContext";
import PromoAdsCarousel from "@/components/PromoAdsCarousel";
import ShopCard from "@/components/ShopCard";
import SubCategoryPills from "@/components/SubCategoryPills";
import GeoRadiusFilter, { type GeoFilterState } from "@/components/GeoRadiusFilter";
import { fetchShopIdsBySubCategory } from "@/services/productService";

/* -------------------------------------------------------------------------- */
/*  HomeInner Component                                                        */
/* -------------------------------------------------------------------------- */

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategory = (searchParams.get("category") as ShopCategory) ?? "All";

  const [shops, setShops] = useState<Shop[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const [categoryCounts, setCategoryCounts] = useState<CategoryWithCount[]>([]);
  const [brokenImgs, setBrokenImgs] = useState<Set<string>>(new Set());
  const [brokenStoryImgs, setBrokenStoryImgs] = useState<Set<string>>(new Set());
  const { addToast } = useToast();

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
    scope: "pakistan",
  });

  /* Fetch shops once on mount */
  useEffect(() => {
    let cancelled = false;
    const LOADING_TIMEOUT_MS = 15_000;

    async function loadData() {
      try {
        setLoading(true); setError(null);
        const result = await Promise.race([
          Promise.all([fetchShops({ publicOnly: true }), fetchActiveStories()]),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Request timed out.")), LOADING_TIMEOUT_MS)),
        ]);
        const [shopsResult, storiesResult] = result;
        if (!cancelled) {
          if (shopsResult.success) setShops(shopsResult.data);
          else setError(shopsResult.error);
          if (storiesResult.success) setStories(storiesResult.data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load data.");
      } finally { if (!cancelled) setLoading(false); }
    }

    loadData();
    const catTimeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), LOADING_TIMEOUT_MS));
    Promise.race([fetchCategoryCounts(), catTimeout])
      .then((r) => { if (!cancelled && r && typeof r === "object" && "success" in r && r.success) setCategoryCounts(r.data.categories); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, []);

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
    return shops.filter((shop) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || shop.name.toLowerCase().includes(query) || shop.category.toLowerCase().includes(query);
      const matchesCategory = activeCategory === "All" || shop.category === activeCategory;
      const matchesSub =
        !activeSubCategoryId ||
        !subCategoryShopIds ||
        subCategoryShopIds.has(shop.id);
      return matchesSearch && matchesCategory && matchesSub;
    });
  }, [shops, searchQuery, activeCategory, activeSubCategoryId, subCategoryShopIds]);

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
      {/* ── Category Pills ────────────────────────────────────────── */}
      <section aria-label="Category filters">
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 scrollbar-none">
          {SHOP_CATEGORIES.map((category) => {
            const isActive = activeCategory === category;
            const catCount = categoryCounts.find((c) => c.key === category)?.count;
            const meta = getCategoryMeta(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => handleCategoryChange(category)}
                className={`chip inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[0.68rem] font-medium leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:px-3 sm:text-[0.7rem] ${
                  isActive
                    ? "border-emerald-600 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)] dark:text-[color:var(--tm-muted)] dark:hover:bg-[color:var(--tm-elevated)]"
                }`}
                aria-label={`${category}${catCount !== undefined ? ` — ${catCount} shop${catCount !== 1 ? "s" : ""}` : ""}`}
                aria-pressed={isActive}
              >
                <span aria-hidden="true">{meta.icon}</span>
                <span>{category}</span>
                {catCount !== undefined && (
                  <span className={`ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[0.58rem] font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-400 dark:bg-[color:var(--tm-elevated)] dark:text-[color:var(--tm-muted)]"
                  }`}>{catCount}</span>
                )}
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

      {/* ── Stories Section ───────────────────────────────────────── */}
      <section aria-label="Merchant stories">
        <h2 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Stories</h2>
        <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1">
          {stories.length === 0 ? (
            <p className="px-3 text-xs text-zinc-400 dark:text-zinc-500">No active stories right now.</p>
          ) : (
            stories.map((story, i) => (
              <button key={story.id} type="button" onClick={() => { setSelectedStoryIndex(i); setStoryViewerOpen(true); }} className="flex shrink-0 flex-col items-center gap-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <div className="relative h-14 w-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 p-[2px]">
                  {story.image_url && !brokenStoryImgs.has(story.id) ? (
                    <Image src={getSafeImageUrl(story.image_url, "product")} alt="" fill className="rounded-full object-cover" sizes="3.5rem" onError={() => setBrokenStoryImgs((prev) => new Set(prev).add(story.id))} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-base font-bold text-emerald-600 dark:bg-zinc-800 dark:text-emerald-400">{story.caption?.charAt(0) ?? "?"}</div>
                  )}
                </div>
                <span className="max-w-[60px] truncate text-center text-[0.6rem] text-zinc-500 dark:text-zinc-400">{story.caption || "Story"}</span>
              </button>
            ))
          )}
        </div>
      </section>

      {/* ── Stories Viewer ────────────────────────────────────────── */}
      {storyViewerOpen && (<StoriesViewer initialIndex={selectedStoryIndex} onClose={() => setStoryViewerOpen(false)} />)}

      {/* ── Sponsored / Promotional Ads Carousel ───────────────────── */}
      <PromoAdsCarousel placement="homepage_top" />

      {geoFiltering && (
        <p className="animate-pulse text-xs text-teal-600/80 dark:text-teal-400/80">
          Updating shops for your area…
        </p>
      )}

      {/* ── Live Shops Grid ───────────────────────────────────────── */}
      <section aria-label="Live shops">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-[1.05rem]">
              Live Shops
            </h2>
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
          <GeoRadiusFilter
            onFilterChange={setGeoFilter}
            isDetecting={geoDetecting}
            onDetectStart={() => setGeoDetecting(true)}
            onDetectEnd={() => setGeoDetecting(false)}
          />
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
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
          <div className="py-12 text-center">
            <p className="text-sm text-zinc-400 dark:text-zinc-500">
              {searchQuery || activeCategory !== "All" ? "No shops match your filters." : "No shops are live right now. Check back soon!"}
            </p>
          </div>
        )}

        {/* Shop cards — 2 mobile / 3 tablet / 4 laptop (readable width, less truncation) */}
        {!loading && !error && displayShops.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {displayShops.map((shop) => {
              const bannerBroken = brokenImgs.has(`banner:${shop.id}`);
              const logoBroken = brokenImgs.has(`logo:${shop.id}`);
              const withDistance = shop as ShopWithDistance;
              return (
                <ShopCard
                  key={shop.id}
                  shop={{
                    id: shop.id,
                    name: shop.name,
                    category: shop.category,
                    location: shop.location,
                    logo_url: shop.logo_url,
                    banner_url: shop.banner_url,
                    is_live: shop.is_live,
                    distance_km: withDistance.distance_km,
                    business_hours: shop.business_hours,
                    operating_status: shop.operating_status,
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