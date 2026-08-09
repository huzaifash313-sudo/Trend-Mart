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
import GeoRadiusFilter, { type GeoFilterState } from "@/components/GeoRadiusFilter";
import { filterShopsByProximity, formatDistance } from "@/services/geoRadiusService";
import type { ShopWithDistance } from "@/services/geoRadiusService";
import { useLocation } from "@/context/LocationContext";
import PromoAdsCarousel from "@/components/PromoAdsCarousel";
import ShopMediaHeader, { ShopLogoAvatar } from "@/components/ShopMediaHeader";
import SubCategoryPills from "@/components/SubCategoryPills";
import { fetchShopIdsBySubCategory } from "@/services/productService";

/* -------------------------------------------------------------------------- */
/*  Icons (inline SVGs)                                                        */
/* -------------------------------------------------------------------------- */

function SearchIcon() {
  return (
    <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

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

  // Global location from LocationContext (persisted across visits)
  const { location: globalLocation, coordinates: globalCoords } = useLocation();

  // Geo-radius filter state (supplements the global location with radius control)
  const [geoFilter, setGeoFilter] = useState<GeoFilterState>({
    coordinates: null,
    maxDistanceKm: 0,
    locationAvailable: false,
    scope: "radius",
  });
  const [geoFiltering, setGeoFiltering] = useState(false);
  const [geoDetecting, setGeoDetecting] = useState(false);
  const [geoFilteredShops, setGeoFilteredShops] = useState<ShopWithDistance[]>([]);
  const [proximityActive, setProximityActive] = useState(false);

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

  /* Geo proximity filtering — always nearest-first when we have a pin / city / Pakistan scope */
  useEffect(() => {
    let cancelled = false;
    async function applyGeoFilter() {
      const scope = geoFilter.scope ?? "radius";
      const coords =
        geoFilter.coordinates ??
        globalCoords ??
        null;

      // Pakistan / city scopes can run without coords; radius needs a pin for distance.
      if (!coords && scope === "radius") {
        setProximityActive(false);
        setGeoFilteredShops([]);
        return;
      }

      setGeoFiltering(true);
      try {
        const result = await filterShopsByProximity(filteredShops, {
          coordinates: coords,
          maxDistanceKm:
            scope === "radius" && geoFilter.maxDistanceKm > 0
              ? geoFilter.maxDistanceKm
              : 0,
          enforceServiceRadius: scope !== "pakistan",
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
          setProximityActive(Boolean(coords) || scope !== "radius");
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
  const showProximityBadges = proximityActive && !!globalCoords;

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

  const handleWhatsAppOrder = useCallback((shop: Shop) => {
    const message = encodeURIComponent(`Hi ${shop.name}! I'd like to place an order.`);
    const phone = shop.whatsapp_number?.replace(/\D/g, "") ?? "";
    if (!phone) return;
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  }, []);

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
                className={`chip shrink-0 rounded-full border px-3 text-[0.7rem] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  isActive
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)] dark:text-[color:var(--tm-muted)] dark:hover:bg-[color:var(--tm-elevated)]"
                }`}
                aria-label={`${category}${catCount !== undefined ? ` — ${catCount} shop${catCount !== 1 ? "s" : ""}` : ""}`}
                aria-pressed={isActive}
              >
                <span className="mr-1" aria-hidden="true">{meta.icon}</span>
                {category}
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

      {/* ── Geo-Radius Filter ─────────────────────────────────────── */}
      <section className="flex items-center gap-2 flex-wrap">
        {/* Global location badge */}
        {globalLocation && (
          <span className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            📍{" "}
            <span className="truncate">
              {globalLocation.address?.split(",")[0] ??
                globalLocation.deliveryZone ??
                globalLocation.city ??
                "Nearby"}
            </span>
            {globalLocation.source === "gps"
              ? " (GPS)"
              : globalLocation.source === "manual"
                ? " (City)"
                : ""}
          </span>
        )}
        <GeoRadiusFilter
          onFilterChange={setGeoFilter}
          isDetecting={geoDetecting}
          onDetectStart={() => setGeoDetecting(true)}
          onDetectEnd={() => setGeoDetecting(false)}
        />
        {geoFiltering && (
          <span className="text-xs text-zinc-400 animate-pulse">Filtering...</span>
        )}
      </section>

      {/* ── Live Shops Grid ───────────────────────────────────────── */}
      <section aria-label="Live shops">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Live Shops</h2>
          {!loading && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {displayShops.length} shop{displayShops.length !== 1 && "s"}
              {showProximityBadges && (
                <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  sorted by proximity
                </span>
              )}
            </span>
          )}
        </div>

        {/* Loading skeletons — scaled for mobile */}
        {loading && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-white p-2 sm:p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-2 h-24 rounded-lg bg-zinc-200 sm:h-32 dark:bg-zinc-800" />
                <div className="mb-1.5 h-3 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="mb-1.5 h-2 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-7 w-full rounded-full bg-zinc-200 sm:h-8 dark:bg-zinc-800" />
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

        {/* Shop cards grid — optimized for mobile with proportional spacing */}
        {!loading && !error && displayShops.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {displayShops.map((shop) => {
              const bannerBroken = brokenImgs.has(`banner:${shop.id}`);
              const logoBroken = brokenImgs.has(`logo:${shop.id}`);
              return (
              <article key={shop.id} className="trend-card overflow-hidden">
                <Link href={`/shop/${shop.id}`} className="block">
                  <ShopMediaHeader
                    shopName={shop.name}
                    bannerUrl={shop.banner_url}
                    logoUrl={shop.logo_url}
                    size="card"
                    bannerBroken={bannerBroken}
                    logoBroken={logoBroken}
                    onBannerError={() =>
                      setBrokenImgs((prev) => new Set(prev).add(`banner:${shop.id}`))
                    }
                    onLogoError={() =>
                      setBrokenImgs((prev) => new Set(prev).add(`logo:${shop.id}`))
                    }
                  >
                    {shop.is_live && (
                      <span className="absolute left-1.5 top-1.5 z-[1] animate-pulse rounded-full bg-red-500 px-1 py-0.5 text-[0.5rem] font-semibold leading-none text-white sm:left-2 sm:px-1.5 sm:text-[0.6rem]">
                        LIVE
                      </span>
                    )}
                    {(shop as ShopWithDistance).distance_km != null && (
                      <span className="absolute right-1.5 top-1.5 z-[1] rounded-full bg-black/60 px-1 py-0.5 text-[0.5rem] font-semibold leading-none text-white backdrop-blur-sm sm:right-2 sm:px-1.5 sm:text-[0.6rem]">
                        📍 {formatDistance((shop as ShopWithDistance).distance_km!)}
                      </span>
                    )}
                  </ShopMediaHeader>
                </Link>

                {/* Info — logo beside name */}
                <div className="space-y-1.5 p-2 sm:p-3">
                  <div className="flex items-start gap-2">
                    <Link href={`/shop/${shop.id}`} className="shrink-0">
                      <ShopLogoAvatar
                        shopName={shop.name}
                        logoUrl={shop.logo_url}
                        logoBroken={logoBroken}
                        onLogoError={() =>
                          setBrokenImgs((prev) => new Set(prev).add(`logo:${shop.id}`))
                        }
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <Link
                          href={`/shop/${shop.id}`}
                          className="block truncate text-[0.7rem] font-semibold leading-snug text-zinc-900 hover:text-emerald-600 sm:text-sm dark:text-zinc-100 dark:hover:text-emerald-400"
                        >
                          {shop.name}
                        </Link>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.preventDefault();
                            const nowFav = await toggleFav(shop.id, "shop", shop.name, shop.logo_url ?? undefined);
                            setFavorites((prev) => {
                              const next = new Set(prev);
                              if (nowFav) next.add(shop.id); else next.delete(shop.id);
                              return next;
                            });
                            addToast(nowFav ? "Added to wishlist ❤️" : "Removed from wishlist", "info");
                          }}
                          className="shrink-0 -mr-1 rounded-full p-1 transition-transform hover:scale-110"
                          aria-label={favorites.has(shop.id) ? "Remove from wishlist" : "Add to wishlist"}
                        >
                          <svg className="h-3 w-3 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill={favorites.has(shop.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                          </svg>
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[0.55rem] font-medium leading-none sm:px-2 sm:text-[0.6rem] dark:bg-zinc-800">{shop.category}</span>
                        <span className="inline-flex items-center gap-0.5 text-[0.55rem] sm:text-xs"><PinIcon />{shop.location}</span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/shop/${shop.id}`}
                    className="btn-compact inline-flex w-full items-center justify-center gap-1 rounded-full bg-emerald-600 px-2 text-[0.65rem] font-semibold text-white transition-colors hover:bg-emerald-700 sm:h-8 sm:px-4 sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-[color:var(--tm-surface)]"
                  >
                    Browse →
                  </Link>
                </div>
              </article>
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