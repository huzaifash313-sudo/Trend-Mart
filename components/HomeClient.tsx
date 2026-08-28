"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  memo,
  type Dispatch,
  type SetStateAction,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Shop, ShopCategory, Story } from "@/types";
import { SHOP_CATEGORIES } from "@/types";
import {
  sortStoriesUnseenFirst,
  getViewedStoryIds,
} from "@/lib/storyViewed";
import { toggleFavorite as toggleFav, getAllFavorites } from "@/services/wishlistService";
import { useToast } from "@/components/Toast";
import { useMerchantQuickAdd } from "@/context/MerchantQuickAddContext";
import { getSafeImageUrl } from "@/services/storageService";
import { filterShopsByProximity, getCustomerArea } from "@/services/geoRadiusService";
import type { ShopWithDistance } from "@/services/geoRadiusService";
import { useLocation } from "@/context/LocationContext";
import ShopCard from "@/components/ShopCard";
import GeoRadiusFilter, { type GeoFilterState } from "@/components/GeoRadiusFilter";
import { type Coupon } from "@/services/couponService";
import { type ShopDeal } from "@/lib/dealSchedule";
import { useQueryClient } from "@tanstack/react-query";
import { useShops, useStories, useDeals, useShopCoupons, useMyShop } from "@/lib/queries";
import { fuzzyFilterAndRank, FUZZY_MIN_SCORE } from "@/lib/fuzzySearch";
import { getTopAffinityCategories } from "@/lib/behavior";
import RecentlyViewedStrip from "@/components/RecentlyViewedStrip";

const StoriesViewer = dynamic(() => import("@/components/StoriesViewer"), {
  ssr: false,
});
const PromoAdsCarousel = dynamic(() => import("@/components/PromoAdsCarousel"), {
  loading: () => null,
});

/* Stable empty fallbacks so derived memos don't change identity every render. */
const EMPTY_SHOPS: Shop[] = [];
const EMPTY_DEALS: ShopDeal[] = [];
const EMPTY_STORIES: Story[] = [];
const EMPTY_COUPONS: Record<string, Coupon[]> = {};

/** Shops rendered initially; "Show more" grows the grid without loading 300
 *  cards into the DOM on first paint (major Android perf win). */
const PAGE_SIZE = 24;

/* -------------------------------------------------------------------------- */
/*  Memoized shop-card row                                                     */
/* -------------------------------------------------------------------------- */

interface ShopCardRowProps {
  shop: ShopWithDistance;
  favorited: boolean;
  showDistance: boolean;
  bannerBroken: boolean;
  logoBroken: boolean;
  priority: boolean;
  coupons?: Coupon[];
  activeDeals: ShopDeal[];
  setBrokenImgs: Dispatch<SetStateAction<Set<string>>>;
  setFavorites: Dispatch<SetStateAction<Set<string>>>;
}

const ShopCardRow = memo(function ShopCardRow({
  shop,
  favorited,
  showDistance,
  bannerBroken,
  logoBroken,
  priority,
  coupons,
  activeDeals,
  setBrokenImgs,
  setFavorites,
}: ShopCardRowProps) {
  const { addToast } = useToast();
  const deals = useMemo(
    () => activeDeals.filter((d) => d.shop_id === shop.id),
    [activeDeals, shop.id],
  );

  const onBannerError = useCallback(() => {
    setBrokenImgs((prev) => new Set(prev).add(`banner:${shop.id}`));
  }, [setBrokenImgs, shop.id]);

  const onLogoError = useCallback(() => {
    setBrokenImgs((prev) => new Set(prev).add(`logo:${shop.id}`));
  }, [setBrokenImgs, shop.id]);

  const onToggleFavorite = useCallback(async () => {
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
    addToast(nowFav ? "Added to wishlist" : "Removed from wishlist", "info");
  }, [setFavorites, addToast, shop.id, shop.name, shop.logo_url]);

  return (
    <ShopCard
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
        distance_km: shop.distance_km,
        business_hours: shop.business_hours,
        operating_status: shop.operating_status,
        announcement: shop.announcement,
        announcement_expires_at: shop.announcement_expires_at,
        free_delivery_threshold: shop.free_delivery_threshold,
        avg_rating: shop.avg_rating,
        review_count: shop.review_count,
        coupons,
        deals,
      }}
      favorited={favorited}
      showDistance={showDistance}
      bannerBroken={bannerBroken}
      logoBroken={logoBroken}
      onBannerError={onBannerError}
      onLogoError={onLogoError}
      onToggleFavorite={onToggleFavorite}
      priority={priority}
    />
  );
});

/* -------------------------------------------------------------------------- */
/*  HomeClient — server-seeded, content-first homepage                         */
/* -------------------------------------------------------------------------- */

interface HomeClientProps {
  initialShops: Shop[];
  initialStories: Story[];
  /** Merchant's own shop id resolved on the server (avoids a flash of the
   *  merchant's own store before the client auth query resolves). */
  initialMyShopId: string | null;
  initialCategory: ShopCategory;
  initialQuery: string;
}

function HomeClient({
  initialShops,
  initialStories,
  initialMyShopId,
  initialCategory,
  initialQuery,
}: HomeClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // A merchant must never see (or order from) their own store in the public
  // marketplace — shops, deals, and stories are all filtered by owner id.
  const myShopQuery = useMyShop();
  const myShopId = myShopQuery.data?.id ?? initialMyShopId ?? null;
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

  const shopsQuery = useShops(initialShops.length > 0 ? { initialData: initialShops } : undefined);
  const shops = useMemo(() => {
    const all = shopsQuery.data ?? EMPTY_SHOPS;
    return myShopId ? all.filter((s) => s.id !== myShopId) : all;
  }, [shopsQuery.data, myShopId]);
  const loading = shopsQuery.isLoading;
  const error = shopsQuery.error ? shopsQuery.error.message : null;

  const dealsQuery = useDeals(48);
  const activeDeals = useMemo(() => {
    const all = dealsQuery.data ?? EMPTY_DEALS;
    return myShopId ? all.filter((d) => d.shop_id !== myShopId) : all;
  }, [dealsQuery.data, myShopId]);

  const storiesQuery = useStories(initialStories.length > 0 ? { initialData: initialStories } : undefined);
  const [storiesVersion, setStoriesVersion] = useState(0);
  const [geoVisibleShopIds, setGeoVisibleShopIds] = useState<Set<string> | null>(null);
  // Hydration-safe viewed tracking: SSR + first client render agree on "all
  // unseen", then the effect fills real seen state from localStorage.
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setViewedStoryIds(getViewedStoryIds());
    const onUpdate = () => setViewedStoryIds(getViewedStoryIds());
    window.addEventListener("storiesViewedUpdated", onUpdate);
    return () => window.removeEventListener("storiesViewedUpdated", onUpdate);
  }, []);
  const stories = useMemo(() => {
    void storiesVersion; // re-sort when a story gets marked as seen
    let base = sortStoriesUnseenFirst(storiesQuery.data ?? EMPTY_STORIES, viewedStoryIds);
    if (myShopId) base = base.filter((s) => s.shop_id !== myShopId);
    if (!geoVisibleShopIds) return base;
    return base.filter((s) => geoVisibleShopIds.has(s.shop_id));
  }, [storiesQuery.data, storiesVersion, geoVisibleShopIds, myShopId, viewedStoryIds]);

  /**
   * Instagram-style story tray: group every shop's active stories under ONE ring
   * (with a count badge) instead of one ring per story, so shops can now post
   * unlimited stories without flooding the tray. Shops with unseen stories come
   * first; within a shop, newest story leads the sequence.
   */
  const storyGroups = useMemo(() => {
    const byShop = new Map<string, Story[]>();
    for (const s of stories) {
      const list = byShop.get(s.shop_id);
      if (list) list.push(s);
      else byShop.set(s.shop_id, [s]);
    }
    const groups = Array.from(byShop.values());
    for (const g of groups) {
      g.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    }
    const unseenScore = (g: Story[]) => (g.some((s) => !viewedStoryIds.has(s.id)) ? 0 : 1);
    groups.sort(
      (a, b) =>
        unseenScore(a) - unseenScore(b) ||
        (b[0]?.created_at ?? "").localeCompare(a[0]?.created_at ?? ""),
    );
    return groups;
  }, [stories, viewedStoryIds]);

  /** Flat list for the viewer — same order as the grouped tray. */
  const storyViewerList = useMemo(() => storyGroups.flat(), [storyGroups]);

  const shopIds = useMemo(
    () => shops.map((s) => s.id).filter(Boolean),
    [shops],
  );
  const couponsQuery = useShopCoupons(shopIds);
  const shopCoupons: Record<string, Coupon[]> = couponsQuery.data ?? EMPTY_COUPONS;

  const [searchQuery] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState<ShopCategory>(
    SHOP_CATEGORIES.includes(initialCategory) ? initialCategory : "All",
  );
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);
  // Empty on both server + first client render — hearts are hydrated from
  // localStorage / DB in the effect below (reading localStorage in a useState
  // initializer would break SSR hydration).
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());

  // Keep the shop hearts in sync with the real wishlist (DB for signed-in
  // users, localStorage for guests) and refresh whenever it changes.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getAllFavorites()
        .then((items) => {
          if (cancelled) return;
          setFavorites(new Set(items.filter((i) => i.type === "shop").map((i) => i.id)));
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener("favoritesUpdated", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("favoritesUpdated", refresh);
    };
  }, []);

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

  // Personalisation: reorder the category pills so the categories a customer
  // actually browses / wishes / searches appear first (after "All"). Read from
  // localStorage AFTER mount (client-only) to avoid a hydration mismatch — the
  // server always renders the static order.
  const [orderedCategories, setOrderedCategories] = useState<ShopCategory[]>(SHOP_CATEGORIES.slice());
  useEffect(() => {
    const affinity = getTopAffinityCategories(10);
    if (affinity.length === 0) return;
    const ordered = SHOP_CATEGORIES.filter((c) => c !== "All").slice();
    for (const cat of [...affinity].reverse()) {
      const idx = ordered.findIndex((c) => c === cat);
      if (idx > 0) {
        const [moved] = ordered.splice(idx, 1);
        ordered.unshift(moved);
      }
    }
    setOrderedCategories(["All", ...ordered] as ShopCategory[]);
  }, []);

  const [brokenImgs, setBrokenImgs] = useState<Set<string>>(new Set());
  const [brokenStoryImgs, setBrokenStoryImgs] = useState<Set<string>>(new Set());
  const { openQuickAdd } = useMerchantQuickAdd();

  // Header LocationPicker + homepage area filter (Near me / City / All Pakistan)
  const { location: globalLocation, coordinates: globalCoords } = useLocation();

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

  /* Client-side filtering */
  const filteredShops = useMemo(() => {
    const base = shops.filter((shop) => {
      const matchesCategory = activeCategory === "All" || shop.category === activeCategory;
      return matchesCategory;
    });

    const query = searchQuery.trim();
    if (!query) return base;

    return fuzzyFilterAndRank(
      base,
      query,
      (shop) => [shop.name, shop.category, shop.location, shop.store_bio],
      { minScore: FUZZY_MIN_SCORE, weights: [1, 0.7, 0.55, 0.45] },
    ).map((r) => r.item);
  }, [shops, searchQuery, activeCategory]);

  /* Geo filter — Near me (range) / This city / All Pakistan */
  useEffect(() => {
    let cancelled = false;
    async function applyGeoFilter() {
      const scope = geoFilter.scope;
      const coords = geoFilter.coordinates ?? globalCoords ?? null;

      // All Pakistan always shows every category-filtered shop — pin or no pin.
      if (scope === "pakistan") {
        setProximityActive(false);
        setGeoFilteredShops([]);
        return;
      }

      // Radius mode needs a pin; otherwise fall back to unfiltered list
      if (scope === "radius" && !coords) {
        setProximityActive(false);
        setGeoFilteredShops([]);
        return;
      }

      try {
        const result = await filterShopsByProximity(filteredShops, {
          coordinates: coords,
          maxDistanceKm: scope === "radius" ? geoFilter.maxDistanceKm : 0,
          enforceServiceRadius: true,
          sortByProximity: true,
          scope,
          deliveryZone: globalLocation?.deliveryZone ?? undefined,
          customerCity: globalLocation?.city ?? undefined,
          customerArea: getCustomerArea(globalLocation),
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
    }
    applyGeoFilter();
    return () => {
      cancelled = true;
    };
  }, [filteredShops, geoFilter, globalCoords, globalLocation]);

  /* Geo filter — compute location-visible shop IDs (location-only) for stories. */
  useEffect(() => {
    let cancelled = false;
    async function computeVisibleShopIds() {
      const scope = geoFilter.scope;
      const coords = geoFilter.coordinates ?? globalCoords ?? null;

      // Shops not loaded yet → don't compute an (empty) visible set, otherwise
      // every story would be filtered out and the tray would vanish until the
      // shops query resolves. `null` means "no restriction" so stories show.
      if (!shops || shops.length === 0) {
        setGeoVisibleShopIds(null);
        return;
      }

      // No pin + nationwide/city browse → no location restriction on stories.
      if ((scope === "pakistan" || scope === "city") && !coords) {
        setGeoVisibleShopIds(null);
        return;
      }
      if (scope === "radius" && !coords) {
        setGeoVisibleShopIds(null);
        return;
      }

      try {
        const result = await filterShopsByProximity(shops, {
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
    computeVisibleShopIds();
    return () => {
      cancelled = true;
    };
  }, [shops, geoFilter, globalCoords, globalLocation]);

  const displayShops = proximityActive ? geoFilteredShops : filteredShops;
  const showProximityBadges =
    proximityActive &&
    (geoFilter.scope === "radius"
      ? !!globalCoords || !!geoFilter.coordinates
      : geoFilter.scope === "city" || geoFilter.scope === "pakistan");
  const pickedArea = getCustomerArea(globalLocation);
  const areaBadgeLabel =
    geoFilter.scope === "pakistan"
      ? "All Pakistan"
      : geoFilter.scope === "city"
        ? globalLocation?.city
          ? `${globalLocation.city}`
          : "This city"
        : pickedArea
          ? `${pickedArea} · ${geoFilter.maxDistanceKm || 10} km`
          : geoFilter.maxDistanceKm > 0
            ? `Within ${geoFilter.maxDistanceKm} km`
            : "Near you first";

  const handleCategoryChange = useCallback((category: ShopCategory) => {
    setActiveCategory(category);
    const params = new URLSearchParams();
    if (category !== "All") params.set("category", category);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [searchQuery, router]);

  /* Reset the visible grid when filters change so the user sees the new set. */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const filterSignature = `${activeCategory}|${searchQuery}|${proximityActive}|${geoFilter.scope}|${geoFilter.maxDistanceKm}`;
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterSignature]);

  const visibleShops = displayShops.slice(0, visibleCount);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 page-stack px-3 py-2.5 pb-3 md:px-4 md:py-4 md:pb-6">
      {/* ── Categories (Daraz-style tabs, polished) ───────────────── */}
      <section aria-label="Category filters" className="tm-cat-bar -mx-3 sm:-mx-4">
        <div className="tm-cat-scroll px-2 scrollbar-none sm:px-3">
          {orderedCategories.map((category) => {
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

      {/* Stories — first content under category tabs */}
      <section aria-label="Merchant stories">
        <div className="-mx-3 flex gap-3.5 overflow-x-auto px-3 pb-0 scrollbar-none">
          {myShop ? (
            <button
              type="button"
              onClick={() =>
                openQuickAdd({ shopId: myShop.id, shopCategory: myShop.category, tab: "story" })
              }
              className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
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

          {storiesQuery.isLoading ? (
            <div className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1">
              <div className="h-[3.35rem] w-[3.35rem] animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ) : stories.length === 0 && !myShop ? (
            <p className="px-3 text-xs text-zinc-400 dark:text-zinc-500">No active stories right now.</p>
          ) : (
            storyGroups.map((group, gIdx) => {
              const first = group[0];
              const allSeen = group.every((s) => viewedStoryIds.has(s.id));
              const label =
                first.shop_name?.trim() ||
                first.caption?.trim() ||
                "Store";
              const initial = label.charAt(0).toUpperCase() || "?";
              const startIndex = storyGroups.slice(0, gIdx).reduce((n, g) => n + g.length, 0);
              return (
                <button
                  key={first.id}
                  type="button"
                  onClick={() => {
                    setSelectedStoryIndex(startIndex);
                    setStoryViewerOpen(true);
                  }}
                  className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  aria-label={`${label}${group.length > 1 ? `, ${group.length} stories` : " story"}${allSeen ? " (viewed)" : ""}`}
                >
                  <div
                    className={`relative rounded-full p-[2.5px] ${
                      allSeen
                        ? "bg-zinc-300 dark:bg-zinc-600"
                        : "bg-gradient-to-tr from-emerald-500 via-teal-400 to-emerald-600"
                    }`}
                  >
                    <div className="relative h-[3.35rem] w-[3.35rem] overflow-hidden rounded-full bg-white ring-2 ring-white dark:bg-zinc-900 dark:ring-zinc-950">
                      {first.image_url && !brokenStoryImgs.has(first.id) ? (
                        <Image
                          src={getSafeImageUrl(first.image_url, "product")}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="3.35rem"
                          onError={() =>
                            setBrokenStoryImgs((prev) => new Set(prev).add(first.id))
                          }
                        />
                      ) : (
                        <div className="tm-avatar-fallback h-full w-full text-base font-bold">
                          {initial}
                        </div>
                      )}
                    </div>
                    {group.length > 1 ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[0.6rem] font-bold leading-none text-white ring-2 ring-white dark:ring-zinc-950">
                        {group.length}
                      </span>
                    ) : null}
                  </div>
                  <span className="w-full truncate text-center text-[0.62rem] font-medium leading-tight text-zinc-600 dark:text-zinc-300">
                    {label}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <p className="mt-0.5 px-0.5 text-[0.55rem] font-medium uppercase tracking-wider text-zinc-400/80 dark:text-zinc-500">
          Stories
        </p>
      </section>

      {storyViewerOpen && (
        <StoriesViewer
          stories={storyViewerList}
          initialIndex={selectedStoryIndex}
          onClose={() => {
            setStoryViewerOpen(false);
            setStoriesVersion((v) => v + 1);
          }}
        />
      )}

      {/* ── Sponsored / Promotional Ads (platform placements) ───────────── */}
      <PromoAdsCarousel placement="homepage_top" />

      {/* ── Recently viewed (personal: pick up where you left off) ───── */}
      <RecentlyViewedStrip />

      {/* ── Live Shops Grid ───────────────────────────────────────── */}
      <section aria-label="Live shops">
        <div className="tm-section-header flex-wrap">
          <div className="min-w-0">
            <h2 className="tm-section-title">Live Shops</h2>
            {!loading && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {displayShops.length} shop{displayShops.length !== 1 && "s"}
                {showProximityBadges && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 px-2 py-0.5 text-[0.65rem] font-semibold text-teal-700 dark:from-emerald-950/50 dark:to-teal-950/40 dark:text-teal-300">
                    {areaBadgeLabel}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/products" className="tm-chip tm-chip--green">
              Browse products →
            </Link>
            <Link href="/deals" className="tm-chip tm-chip--amber">
              All deals →
            </Link>
          </div>
        </div>
        <div className="mb-3">
          <GeoRadiusFilter
            onFilterChange={setGeoFilter}
            isDetecting={geoDetecting}
            onDetectStart={() => setGeoDetecting(true)}
            onDetectEnd={() => setGeoDetecting(false)}
          />
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
                  }}
                  className="tm-btn-primary rounded-full px-4 py-2 text-xs font-semibold"
                >
                  Clear filters
                </button>
              )}
              <Link
                href="/products"
                className="tm-btn-primary rounded-full px-4 py-2 text-xs font-semibold"
              >
                Browse products
              </Link>
              <Link
                href="/deals"
                className="tm-btn-secondary rounded-full px-4 py-2 text-xs font-semibold"
              >
                See deals
              </Link>
            </div>
          </div>
        )}

        {/* Shop cards — 2 mobile / 3 tablet / 4 laptop / 5 wide desktop */}
        {!loading && !error && displayShops.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visibleShops.map((shop, index) => {
                const withDistance = shop as ShopWithDistance;
                return (
                  <ShopCardRow
                    key={shop.id}
                    shop={withDistance}
                    priority={index < 2}
                    favorited={favorites.has(shop.id)}
                    showDistance={showProximityBadges}
                    bannerBroken={brokenImgs.has(`banner:${shop.id}`)}
                    logoBroken={brokenImgs.has(`logo:${shop.id}`)}
                    coupons={shopCoupons[shop.id]}
                    activeDeals={activeDeals}
                    setBrokenImgs={setBrokenImgs}
                    setFavorites={setFavorites}
                  />
                );
              })}
            </div>

            {displayShops.length > visibleCount && (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="tm-btn-secondary rounded-full px-6 py-2 text-xs font-semibold"
                >
                  Show more shops ({displayShops.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default HomeClient;
