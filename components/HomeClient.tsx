"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  memo,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
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
import {
  filterShopsByProximity,
  filterStoriesByCoverage,
  getCustomerArea,
} from "@/services/geoRadiusService";
import type { ShopWithDistance } from "@/services/geoRadiusService";
import { useLocation } from "@/context/LocationContext";
import ShopCard from "@/components/ShopCard";
import FadeScrollX from "@/components/FadeScrollX";
import GeoRadiusFilter, { type GeoFilterState } from "@/components/GeoRadiusFilter";
import { type Coupon } from "@/services/couponService";
import { type ShopDeal } from "@/lib/dealSchedule";
import { useQueryClient } from "@tanstack/react-query";
import { useShops, useStories, useDeals, useShopCoupons, useMyShop } from "@/lib/queries";
import { fuzzyFilterAndRank, FUZZY_MIN_SCORE } from "@/lib/fuzzySearch";
import { getTopAffinityCategories } from "@/lib/behavior";
const StoriesViewer = dynamic(() => import("@/components/StoriesViewer"), {
  ssr: false,
});
const PromoAdsCarousel = dynamic(() => import("@/components/PromoAdsCarousel"), {
  loading: () => null,
});
const BrandMediaShowcase = dynamic(() => import("@/components/BrandMediaShowcase"), {
  loading: () => null,
});

/* Stable empty fallbacks so derived memos don't change identity every render. */
const EMPTY_SHOPS: Shop[] = [];
const EMPTY_DEALS: ShopDeal[] = [];
const EMPTY_STORIES: Story[] = [];
const EMPTY_COUPONS: Record<string, Coupon[]> = {};

/**
 * WhatsApp/Instagram-style partial story ring. The gradient arc shrinks as more
 * of the shop's stories are viewed; the gray ring underneath shows the seen
 * portion. All-seen → fully gray, nothing-seen → full gradient.
 *
 * Gradient defs live INSIDE this SVG — external <defs> in a 0×0 svg break on
 * mobile Safari. Ring geometry is CSS-locked so global svg { height:auto }
 * and button { min:44px } cannot collapse or balloon the tray.
 */
function StoryRing({
  total,
  seen,
  children,
  gradId,
}: {
  total: number;
  seen: number;
  children: ReactNode;
  /** Unique per-mount id so multiple rings don't clash gradient urls. */
  gradId: string;
}) {
  const SIZE = 60;
  const STROKE = 2.5;
  const r = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * r;
  const seenFrac = total > 0 ? Math.max(0, Math.min(seen / total, 1)) : 0;
  const unseenFrac = 1 - seenFrac;
  return (
    <div className="tm-story-ring">
      <svg
        className="tm-story-ring-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="50%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          strokeWidth={STROKE}
          className="tm-story-ring-track"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          stroke={unseenFrac > 0 ? `url(#${gradId})` : "none"}
          strokeDasharray={`${Math.max(unseenFrac * C - 1, 0)} ${C}`}
          style={{ opacity: unseenFrac > 0 ? 1 : 0 }}
        />
      </svg>
      <div className="tm-story-ring-avatar">{children}</div>
    </div>
  );
}

/** Merchant "Your story" ring — Instagram-style: avatar/story thumb + tiny add. */
function MyStoryRingButton({
  shop,
  stories,
  brokenStoryImgs,
  onBrokenStory,
  onView,
  onAdd,
}: {
  shop: { id: string; name: string; category: string; logo_url?: string | null };
  stories: Story[];
  brokenStoryImgs: Set<string>;
  onBrokenStory: (id: string) => void;
  onView: () => void;
  onAdd: () => void;
}) {
  const lead = stories[0];
  const storyThumb =
    lead?.image_url && !brokenStoryImgs.has(lead.id) ? lead.image_url : null;
  const thumbUrl =
    storyThumb || shop.logo_url || lead?.shop_logo_url || null;
  const initial = shop.name?.trim()?.charAt(0).toUpperCase() || "S";
  const hasLiveStories = stories.length > 0;

  const avatar = thumbUrl ? (
    <Image
      src={getSafeImageUrl(thumbUrl, "shop")}
      alt=""
      fill
      className="object-cover"
      sizes="3.5rem"
      onError={() => {
        if (lead?.id && storyThumb && thumbUrl === storyThumb) {
          onBrokenStory(lead.id);
        }
      }}
    />
  ) : (
    <div className="tm-avatar-fallback h-full w-full text-base font-bold">
      {initial}
    </div>
  );

  return (
    <div className="tm-story-item">
      <div className="tm-story-item-frame">
        <button
          type="button"
          onClick={() => (hasLiveStories ? onView() : onAdd())}
          className="tm-story-item-hit"
          aria-label={
            hasLiveStories ? "Preview your live story" : "Add your store story"
          }
        >
          {hasLiveStories ? (
            <StoryRing total={stories.length} seen={0} gradId="tmStoryGradMine">
              {avatar}
            </StoryRing>
          ) : (
            <div className="tm-story-ring tm-story-ring--add">
              <div className="tm-story-ring-avatar">{avatar}</div>
            </div>
          )}
        </button>

        {stories.length > 1 ? (
          <span className="tm-story-count tm-story-count--mine" aria-hidden>
            {stories.length}
          </span>
        ) : null}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="tm-story-add-btn icon-only"
          aria-label="Add story"
          title="Add story"
        >
          +
        </button>
      </div>
      <span className="tm-story-ring-label">Your story</span>
    </div>
  );
}

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
            logo_url: myShopQuery.data.logo_url ?? null,
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
  /** Merchant's own active stories — shown in the "Your story" ring so they
   *  can confirm a posted story is live (their stories are hidden from the
   *  public tray by design). */
  const myStories = useMemo(
    () => (storiesQuery.data ?? EMPTY_STORIES).filter((s) => s.shop_id === myShopId),
    [storiesQuery.data, myShopId],
  );
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
  const [myStoryViewerOpen, setMyStoryViewerOpen] = useState(false);
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
  const { location: globalLocation, coordinates: globalCoords, detectLocation } = useLocation();

  const [geoDetecting, setGeoDetecting] = useState(false);
  const [geoFilteredShops, setGeoFilteredShops] = useState<ShopWithDistance[]>([]);

  /** Let the story tray resolve a location so it can show hyper-local stories. */
  const handleDetectForStories = useCallback(async () => {
    setGeoDetecting(true);
    try {
      await detectLocation();
    } finally {
      setGeoDetecting(false);
    }
  }, [detectLocation]);
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
    window.addEventListener("trendsmart:stories-updated", onStoriesUpdated);
    window.addEventListener("trendsmart:deals-updated", onDealsUpdated);
    return () => {
      window.removeEventListener("trendsmart:stories-updated", onStoriesUpdated);
      window.removeEventListener("trendsmart:deals-updated", onDealsUpdated);
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

  /* Hyper-local story gating: only shops whose delivery coverage includes the
     customer appear in the story tray — driven by the customer's saved location,
     independent of the shop grid's browse scope. `null` means "no location yet",
     so the tray shows a locate prompt instead of flooding every shop's story. */
  useEffect(() => {
    if (!globalCoords) {
      setGeoVisibleShopIds(null);
      return;
    }
    const customer = {
      latitude: globalCoords.latitude,
      longitude: globalCoords.longitude,
      city: globalLocation?.city ?? null,
      area: getCustomerArea(globalLocation) ?? undefined,
    };
    const visible = filterStoriesByCoverage(
      storiesQuery.data ?? EMPTY_STORIES,
      customer,
    );
    setGeoVisibleShopIds(new Set(visible.map((s) => s.shop_id)));
  }, [
    globalCoords,
    globalLocation?.city,
    globalLocation?.deliveryZone,
    storiesQuery.data,
  ]);

  const displayShops = proximityActive ? geoFilteredShops : filteredShops;
  const showProximityBadges =
    proximityActive &&
    (geoFilter.scope === "radius"
      ? !!globalCoords || !!geoFilter.coordinates
      : geoFilter.scope === "city" || geoFilter.scope === "pakistan");
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
    <div className="mx-auto w-full max-w-6xl flex-1 page-stack px-3 py-2 pb-3 md:px-4 md:py-3 md:pb-6">
      {/* Stories tray — top of homepage, always reserved */}
      <section aria-label="Merchant stories" className="tm-stories-tray">
        <div className="tm-stories-tray-head">
          <h2 className="tm-stories-tray-title">Stories</h2>
        </div>
        <div className="tm-stories-tray-scroll">
          {myShop ? (
            <MyStoryRingButton
              shop={myShop}
              stories={myStories}
              brokenStoryImgs={brokenStoryImgs}
              onBrokenStory={(id) =>
                setBrokenStoryImgs((prev) => new Set(prev).add(id))
              }
              onView={() => setMyStoryViewerOpen(true)}
              onAdd={() =>
                openQuickAdd({
                  shopId: myShop.id,
                  shopCategory: myShop.category,
                  tab: "story",
                })
              }
            />
          ) : null}

          {storiesQuery.isLoading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="tm-story-item" aria-hidden>
                  <div className="tm-story-skel" />
                  <div className="tm-story-skel-label" />
                </div>
              ))}
            </>
          ) : !globalCoords ? (
            <button
              type="button"
              onClick={handleDetectForStories}
              disabled={geoDetecting}
              className="tm-story-item"
              aria-label="Detect location to see nearby store stories"
            >
              <div className="tm-story-ring tm-story-ring--nearby">
                <svg className="tm-story-nearby-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
                </svg>
              </div>
              <span className="tm-story-ring-label">
                {geoDetecting ? "Detecting…" : "Nearby"}
              </span>
            </button>
          ) : storyGroups.length > 0 ? (
            storyGroups.map((group, gIdx) => {
              const first = group[0];
              const seenCount = group.filter((s) => viewedStoryIds.has(s.id)).length;
              const allSeen = seenCount >= group.length;
              const label =
                first.shop_name?.trim() ||
                first.caption?.trim() ||
                "Store";
              const initial = label.charAt(0).toUpperCase() || "?";
              const startIndex = storyGroups.slice(0, gIdx).reduce((n, g) => n + g.length, 0);
              const firstUnseenInGroup = group.findIndex((s) => !viewedStoryIds.has(s.id));
              return (
                <button
                  key={first.id}
                  type="button"
                  onClick={() => {
                    setSelectedStoryIndex(
                      startIndex + (firstUnseenInGroup === -1 ? 0 : firstUnseenInGroup),
                    );
                    setStoryViewerOpen(true);
                  }}
                  className="tm-story-item"
                  aria-label={`${label}${group.length > 1 ? `, ${group.length} stories` : " story"}${allSeen ? " (viewed)" : `, ${group.length - seenCount} unviewed`}`}
                >
                  <div className="tm-story-item-frame">
                    <StoryRing
                      total={group.length}
                      seen={seenCount}
                      gradId={`tmStoryGrad-${first.id}`}
                    >
                      {first.image_url && !brokenStoryImgs.has(first.id) ? (
                        <Image
                          src={getSafeImageUrl(first.image_url, "product")}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="3.5rem"
                          onError={() =>
                            setBrokenStoryImgs((prev) => new Set(prev).add(first.id))
                          }
                        />
                      ) : (
                        <div className="tm-avatar-fallback h-full w-full text-base font-bold">
                          {initial}
                        </div>
                      )}
                    </StoryRing>
                    {group.length > 1 ? (
                      <span className="tm-story-count" aria-hidden>
                        {group.length}
                      </span>
                    ) : null}
                  </div>
                  <span className="tm-story-ring-label">{label}</span>
                </button>
              );
            })
          ) : !myShop ? (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="tm-story-item tm-story-slot-empty"
                  aria-hidden={i > 0}
                >
                  <div className="tm-story-ring tm-story-ring--empty">
                    {i === 0 ? (
                      <span className="tm-story-empty-plus" aria-hidden>+</span>
                    ) : null}
                  </div>
                  <span className="tm-story-ring-label">
                    {i === 0 ? "Add story" : "\u00a0"}
                  </span>
                </div>
              ))}
            </>
          ) : null}
        </div>
      </section>

      {/* ── Categories (Daraz-style tabs, polished) ───────────────── */}
      <section aria-label="Category filters" className="tm-cat-bar -mx-3 sm:-mx-4">
        <FadeScrollX className="tm-cat-scroll px-2 sm:px-3">
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
        </FadeScrollX>
      </section>

      {storyViewerOpen && (
        <StoriesViewer
          stories={storyViewerList}
          initialIndex={selectedStoryIndex}
          myShopId={myShopId}
          onClose={() => {
            setStoryViewerOpen(false);
            setStoriesVersion((v) => v + 1);
          }}
        />
      )}

      {myStoryViewerOpen && (
        <StoriesViewer
          stories={myStories}
          initialIndex={0}
          myShopId={myShopId}
          onClose={() => {
            setMyStoryViewerOpen(false);
            setStoriesVersion((v) => v + 1);
          }}
        />
      )}

      {/* ── Brand video + sponsored (original size, ~3% shorter on homepage) ── */}
      <div className="tm-home-hero-compact">
        <BrandMediaShowcase />
        <PromoAdsCarousel placement="homepage_top" />
      </div>

      {/* ── Live Shops Grid ───────────────────────────────────────── */}
      <section aria-label="Live shops">
        <div className="tm-live-shops-heading mb-1">
          <div className="tm-live-shops-heading-main min-w-0">
            <h2 className="tm-live-shops-title">
              <span className="tm-live-shops-indicator" aria-hidden="true">
                <span className="tm-live-shops-indicator-ping" />
                <span className="tm-live-shops-indicator-dot" />
              </span>
              Live Shops
            </h2>
            {!loading && (
              <p className="tm-live-shops-count">
                {displayShops.length} shop{displayShops.length !== 1 && "s"}
              </p>
            )}
          </div>
          <Link href="/recently-viewed" className="tm-live-shops-recent">
            Recently viewed
            <svg
              className="tm-live-shops-recent-arrow"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
        <div className="tm-live-shops-geo mb-2.5">
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
