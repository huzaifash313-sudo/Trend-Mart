"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
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
  formatStoryViewCount,
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
import GeoRadiusFilter, { type GeoFilterState } from "@/components/GeoRadiusFilter";
import { type Coupon } from "@/services/couponService";
import { type ShopDeal } from "@/lib/dealSchedule";
import { useQueryClient } from "@tanstack/react-query";
import { useShopsInfinite, useStories, useDeals, useShopCoupons, useMyShop } from "@/lib/queries";
import { useConnection } from "@/lib/connection";
import { fuzzyFilterAndRank, FUZZY_MIN_SCORE } from "@/lib/fuzzySearch";
import { getTopAffinityCategories } from "@/lib/behavior";
import VirtualizedGrid from "@/components/VirtualizedGrid";
import HomeCategories from "@/components/HomeCategories";
import { DealsRail, ProductsRail, SponsoredRail } from "@/components/HomeFeedRails";
import { PUBLIC_SHOP_PAGE_SIZE } from "@/lib/mobilePerf";
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
            <stop offset="0%" stopColor="var(--tm-brand-400)" />
            <stop offset="50%" stopColor="var(--tm-sea-400)" />
            <stop offset="100%" stopColor="var(--tm-brand-600)" />
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

/** Merchant "Your story" ring — sticky first in tray so own stories stay easy to open. */
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
  const hasLiveStories = stories.length > 0;
  const lead = stories[0];
  const storyThumb =
    lead?.image_url && !brokenStoryImgs.has(lead.id) ? lead.image_url : null;
  // Empty "Add story": never show shop logo / banner as a fake story preview.
  // Only show media once this shop actually has a live story.
  const thumbUrl = hasLiveStories
    ? storyThumb || shop.logo_url || lead?.shop_logo_url || null
    : null;
  const initial = shop.name?.trim()?.charAt(0).toUpperCase() || "S";
  const totalViews = stories.reduce(
    (sum, s) => sum + Math.max(0, Number(s.view_count) || 0),
    0,
  );

  const avatar = thumbUrl ? (
    <Image
      src={getSafeImageUrl(thumbUrl, "shop", "thumb")}
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
  ) : hasLiveStories ? (
    <div className="tm-avatar-fallback h-full w-full text-base font-bold">
      {initial}
    </div>
  ) : null;

  return (
    <div className="tm-story-item tm-story-item--mine">
      <div className="tm-story-item-frame">
        {hasLiveStories ? (
          <>
            {/* Tap the ring → watch your live stories */}
            <button
              type="button"
              onClick={onView}
              className="tm-story-item-hit"
              aria-label={`Preview your live stor${stories.length === 1 ? "y" : "ies"}${totalViews > 0 ? `, ${totalViews} views` : ""}`}
              title="View your stories"
            >
              <StoryRing total={stories.length} seen={0} gradId="tmStoryGradMine">
                {avatar}
              </StoryRing>
            </button>

            {stories.length > 1 ? (
              <span className="tm-story-count tm-story-count--mine" aria-hidden>
                {stories.length}
              </span>
            ) : null}

            {/* Tiny corner + → add one more story */}
            <button
              type="button"
              onClick={onAdd}
              className="tm-story-add-btn icon-only"
              aria-label="Add another story"
              title="Add another story"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </>
        ) : (
          /* Empty → one clean "add first story" ring — single tap, no clutter */
          <button
            type="button"
            onClick={onAdd}
            className="tm-story-item-hit"
            aria-label="Add your store story"
            title="Add your store story"
          >
            <span className="tm-story-ring tm-story-ring--add">
              <span className="tm-story-ring-avatar">
                <svg
                  className="tm-story-add-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </span>
          </button>
        )}
      </div>
      <span className="tm-story-ring-label tm-story-ring-label--mine">
        {hasLiveStories ? "Your story" : "Add story"}
      </span>
      {hasLiveStories ? (
        <span className="tm-story-views-label" aria-hidden>
          {formatStoryViewCount(totalViews)}{" "}
          {totalViews === 1 ? "view" : "views"}
        </span>
      ) : null}
    </div>
  );
}

/** Shops rendered per infinite-scroll page (server + client aligned). */
const PAGE_SIZE = PUBLIC_SHOP_PAGE_SIZE;

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
  shopDeals: ShopDeal[];
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
  shopDeals,
  setBrokenImgs,
  setFavorites,
}: ShopCardRowProps) {
  const { addToast } = useToast();
  const deals = shopDeals;

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

  const shopsQuery = useShopsInfinite(
    initialShops.length > 0 ? { initialData: initialShops, pageSize: PAGE_SIZE } : { pageSize: PAGE_SIZE },
  );
  const shops = useMemo(() => {
    const all = shopsQuery.data?.pages.flat() ?? EMPTY_SHOPS;
    return myShopId ? all.filter((s) => s.id !== myShopId) : all;
  }, [shopsQuery.data, myShopId]);
  const loading = shopsQuery.isLoading;
  const error = shopsQuery.error ? shopsQuery.error.message : null;
  const hasMoreShops = Boolean(shopsQuery.hasNextPage);
  const loadingMoreShops = shopsQuery.isFetchingNextPage;

  /* Connection awareness — offline users keep browsing the cached page while a
     pill + notices explain why content can't refresh. */
  const connection = useConnection();
  const offline = connection === "offline";

  /* When the network comes back (browser event OR the SW stops serving from
     cache), quietly refresh the home datasets in the background. */
  const prevConnectionRef = useRef(connection);
  useEffect(() => {
    const prev = prevConnectionRef.current;
    prevConnectionRef.current = connection;
    if (prev === "offline" && connection === "online") {
      queryClient.invalidateQueries({ queryKey: ["shops"] });
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    }
  }, [connection, queryClient]);

  const savedContent = shops.length > 0;
  // A refetch failed, but we still have saved/SSR content worth showing.
  const softFail = Boolean(error) && savedContent && !loading;
  // Nothing to show at all and the fetch failed — real error / offline empty.
  const hardFail = Boolean(error) && !savedContent && !loading;

  /* Blurred reveal loader: only when this visit has no content yet (SSR seeds
     missing and the client is fetching). Once anything settles — data or a
     hard error — the veil fades out to reveal the page underneath. When the
     server shipped seeds this whole path is skipped (no artificial delay). */
  const [veilGone, setVeilGone] = useState(() => initialShops.length > 0);
  const [veilExiting, setVeilExiting] = useState(false);
  useEffect(() => {
    if (veilGone) return;
    if (shopsQuery.isLoading) return;
    setVeilExiting(true);
    const t = window.setTimeout(() => setVeilGone(true), 700);
    return () => window.clearTimeout(t);
  }, [veilGone, shopsQuery.isLoading]);
  // Safety net: never trap the user behind the veil on a hung request.
  useEffect(() => {
    if (veilGone) return;
    const hard = window.setTimeout(() => {
      setVeilExiting(true);
      window.setTimeout(() => setVeilGone(true), 700);
    }, 9000);
    return () => window.clearTimeout(hard);
  }, [veilGone]);

  const dealsQuery = useDeals(48);
  const activeDeals = useMemo(() => {
    const all = dealsQuery.data ?? EMPTY_DEALS;
    return myShopId ? all.filter((d) => d.shop_id !== myShopId) : all;
  }, [dealsQuery.data, myShopId]);

  const dealsByShopId = useMemo(() => {
    const map = new Map<string, ShopDeal[]>();
    for (const d of activeDeals) {
      const list = map.get(d.shop_id);
      if (list) list.push(d);
      else map.set(d.shop_id, [d]);
    }
    return map;
  }, [activeDeals]);

  const storiesQuery = useStories(initialStories.length > 0 ? { initialData: initialStories } : undefined);
  const [storiesVersion, setStoriesVersion] = useState(0);
  /** Merchant's own active stories — always first in the tray (sticky ring).
   *  Newest first so the latest post is the ring thumbnail. */
  const myStories = useMemo(() => {
    if (!myShopId) return EMPTY_STORIES;
    return (storiesQuery.data ?? EMPTY_STORIES)
      .filter((s) => s.shop_id === myShopId)
      .slice()
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }, [storiesQuery.data, myShopId]);
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

  /** Map form of the counts (plus the "All" total) for the category tiles. */
  const categoryCountsMap = useMemo(() => {
    const map = new Map<string, number>(categoryCounts.map((c) => [c.key, c.count]));
    map.set("All", shops.length);
    return map;
  }, [categoryCounts, shops.length]);

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
    const timer = window.setTimeout(() => {
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
      void applyGeoFilter();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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

  /* Reset filter-local windowing is no longer needed — server pages accumulate. */
  const visibleShops = displayShops;

  /* Feed rhythm: chunks of ~24 live shops (one infinite-scroll page) with a
     compact deals/products/sponsored rail inserted after every chunk so the
     page keeps surprising the shopper as they scroll (marketplace flow). */
  const shopChunks = useMemo(() => {
    const chunks: ShopWithDistance[][] = [];
    for (let i = 0; i < visibleShops.length; i += PAGE_SIZE) {
      chunks.push(visibleShops.slice(i, i + PAGE_SIZE) as ShopWithDistance[]);
    }
    return chunks;
  }, [visibleShops]);

  const feedRails = useMemo<ReactNode[]>(() => {
    const first: ReactNode = (
      <DealsRail key="rail-0" deals={activeDeals} />
    );
    const second: ReactNode = <ProductsRail key="rail-1" myShopId={myShopId} />;
    const third: ReactNode = <SponsoredRail key="rail-2" />;
    // Deals → products → sponsored → deals → … (rails repeat as pages load)
    return [first, second, third];
  }, [activeDeals, myShopId]);

  /* Auto-load the next page of shops when the sentinel scrolls into view —
     infinite marketplace scroll instead of clicking "Show more". */
  const feedSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = feedSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          hasMoreShops &&
          !loadingMoreShops &&
          !offline
        ) {
          void shopsQuery.fetchNextPage();
        }
      },
      { rootMargin: "900px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreShops, loadingMoreShops, offline, shopsQuery]);

  // Coupons only for shops currently on screen — first paint set, grows with pages.
  const couponShopIds = useMemo(
    () => visibleShops.slice(0, 48).map((s) => s.id).filter(Boolean),
    [visibleShops],
  );
  const couponsQuery = useShopCoupons(couponShopIds);
  const shopCoupons: Record<string, Coupon[]> = couponsQuery.data ?? EMPTY_COUPONS;

  return (
    <>
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
              const groupViews = group.reduce(
                (sum, s) => sum + Math.max(0, Number(s.view_count) || 0),
                0,
              );
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
                  aria-label={`${label}${group.length > 1 ? `, ${group.length} stories` : " story"}${allSeen ? " (viewed)" : `, ${group.length - seenCount} unviewed`}, ${groupViews} views`}
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
                  <span className="tm-story-views-label" aria-hidden>
                    {formatStoryViewCount(groupViews)}{" "}
                    {groupViews === 1 ? "view" : "views"}
                  </span>
                </button>
              );
            })
          ) : !myShop ? (
            /* Viewer-only empty state — customers/guests never get an "add
               story" affordance, just a quiet "nothing to watch yet" hint. */
            <div className="tm-story-item tm-story-slot-empty" role="status">
              <div className="tm-story-ring tm-story-ring--empty">
                <svg
                  className="tm-story-empty-eye"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <span className="tm-story-ring-label">No stories yet</span>
            </div>
          ) : null}
        </div>
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

      {/* ── Colourful category tiles (icons + gradients, under the video) ── */}
      {!loading && displayShops.length > 0 && (
        <HomeCategories
          categories={orderedCategories}
          counts={categoryCountsMap}
          activeCategory={activeCategory}
          onSelect={handleCategoryChange}
        />
      )}

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

        {/* Hard error — nothing to show at all */}
        {hardFail && (
          <div className="py-12 text-center">
            {offline ? (
              <>
                <p className="text-4xl" aria-hidden="true">📡</p>
                <p className="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  You&apos;re offline
                </p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                  Nothing is saved for this page yet. Connect to the internet and
                  try again — shops you visit will then open instantly, even offline.
                </p>
              </>
            ) : (
              <>
                <p className="mb-1 text-sm text-red-600 dark:text-red-400">{error}</p>
              </>
            )}
            <button type="button" onClick={() => void shopsQuery.refetch()} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700">
              Retry
            </button>
          </div>
        )}

        {/* Soft failure — refresh failed but saved content is still on screen */}
        {softFail && (
          <div className="tm-home-refresh-note" role="status">
            <span className="tm-home-refresh-dot" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              {offline
                ? "You're offline — showing saved shops from your last visit."
                : "Couldn't refresh — showing saved shops."}
            </span>
            <button
              type="button"
              onClick={() => void shopsQuery.refetch()}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-600/10 dark:text-emerald-400"
            >
              Retry
            </button>
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

        {/* Shop feed — 2 mobile / 3 tablet / 4 laptop / 5 wide desktop.
            Shops arrive in chunks; after every chunk a compact rail (deals /
            products / sponsored) is woven in so the page keeps a marketplace
            rhythm instead of one endless grid. */}
        {!loading && !hardFail && displayShops.length > 0 && (
          <>
            {shopChunks.map((chunk, ci) => {
              const rail = feedRails[ci % feedRails.length];
              return (
                <div key={`shop-chunk-${ci}`} className={ci > 0 ? "mt-2 sm:mt-4" : ""}>
                  <VirtualizedGrid
                    items={chunk}
                    getKey={(shop) => shop.id}
                    estimateRowHeight={260}
                    gapClassName="gap-2 sm:gap-4"
                    columnBreakpoints={{ base: 2, md: 3, lg: 4, xl: 5 }}
                    renderItem={(shop, index) => {
                      const withDistance = shop as ShopWithDistance;
                      return (
                        <ShopCardRow
                          shop={withDistance}
                          priority={ci === 0 && index < 2}
                          favorited={favorites.has(shop.id)}
                          showDistance={showProximityBadges}
                          bannerBroken={brokenImgs.has(`banner:${shop.id}`)}
                          logoBroken={brokenImgs.has(`logo:${shop.id}`)}
                          coupons={shopCoupons[shop.id]}
                          shopDeals={dealsByShopId.get(shop.id) ?? EMPTY_DEALS}
                          setBrokenImgs={setBrokenImgs}
                          setFavorites={setFavorites}
                        />
                      );
                    }}
                  />
                  {/* Compact rail — one after every shop chunk, cycling
                      deals → products → sponsored. Even on a short feed (a
                      single chunk) the rails still show, so the page never
                      ends as a bare grid. */}
                  {rail}
                </div>
              );
            })}

            {/* Infinite-scroll sentinel — pulls the next 24 shops automatically.
                The button below doubles as a manual fallback. */}
            <div
              ref={feedSentinelRef}
              className="mt-6 flex min-h-[3rem] items-center justify-center"
            >
              {loadingMoreShops ? (
                <span className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  Loading more shops…
                </span>
              ) : hasMoreShops ? (
                <button
                  type="button"
                  onClick={() => void shopsQuery.fetchNextPage()}
                  className="tm-btn-secondary rounded-full px-6 py-2 text-xs font-semibold disabled:opacity-60"
                  disabled={offline || loadingMoreShops || !hasMoreShops}
                >
                  Show more shops
                </button>
              ) : null}
            </div>
          </>
        )}
      </section>

      {/* Blurred reveal loader — first paint without content warms up behind a
          soft blur, then fades away so nothing "pops" into place. */}
      {!veilGone && (
        <div
          className={`tm-reveal-veil${veilExiting ? " is-exit" : ""}`}
          role="status"
          aria-live="polite"
        >
          <div className="tm-reveal-veil-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/trendsmart-mark.png?v=16"
              alt=""
              width={44}
              height={44}
              decoding="async"
              className="tm-reveal-veil-logo"
            />
            <span className="tm-reveal-veil-spinner" aria-hidden="true" />
            <span className="tm-reveal-veil-text">
              Warming up your local shops…
            </span>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

export default HomeClient;
