"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MarketplaceProduct, Shop, ShopCategory } from "@/types";
import { SHOP_CATEGORIES } from "@/types";
import {
  fetchMarketplaceProducts,
  type MarketplaceSort,
} from "@/services/productService";
import ProductGrid from "@/components/ProductGrid";
import QuickViewModal from "@/components/QuickViewModal";
import SubCategoryPills from "@/components/SubCategoryPills";
import OfferDaysStrip from "@/components/OfferDaysStrip";
import FeaturedDealsStrip from "@/components/FeaturedDealsStrip";
import GeoRadiusFilter, { type GeoFilterState } from "@/components/GeoRadiusFilter";
import { useLocation } from "@/context/LocationContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/components/Toast";
import { getAllFavorites, toggleFavorite } from "@/services/wishlistService";
import { haversineDistance } from "@/services/geoRadiusService";
import { diversifyMarketplaceFeed } from "@/lib/marketplaceDiversity";
import { fetchActiveDeals } from "@/services/dealService";
import { fetchActiveCouponsForShops, type Coupon } from "@/services/couponService";
import {
  isDealActiveOnDate,
  shopIdsWithDealOnDate,
  toPkDateKey,
  formatDealDisplayLabel,
  formatDealWhenTag,
  dealSearchHaystack,
  type ShopDeal,
} from "@/lib/dealSchedule";
import { buildShopTickerTags, formatCouponTickerLabels } from "@/lib/shopOfferLabels";
import type { ProductOfferContext } from "@/components/ProductGrid";
import {
  fuzzyFilterAndRank,
  suggestSearchCorrections,
  FUZZY_MIN_SCORE,
} from "@/lib/fuzzySearch";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.29 7 12 12 20.71 7" /><line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  );
}

const SORT_OPTIONS: { value: MarketplaceSort; label: string }[] = [
  { value: "for_you", label: "For You" },
  { value: "newest", label: "Newest" },
  { value: "discount", label: "Best deals" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
];

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

function ProductsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const { addItem } = useCart();
  const { coordinates: globalCoords } = useLocation();

  const qParam = searchParams.get("q") ?? "";
  const categoryParam = (searchParams.get("category") as ShopCategory | null) ?? "All";
  const subParam = searchParams.get("sub");
  const sortParam = (searchParams.get("sort") as MarketplaceSort | null) ?? "for_you";
  const productParam = searchParams.get("product");

  const [query, setQuery] = useState(qParam);
  const [activeCategory, setActiveCategory] = useState<ShopCategory>(
    SHOP_CATEGORIES.includes(categoryParam) ? categoryParam : "All",
  );
  const [activeSubCategoryId, setActiveSubCategoryId] = useState<string | null>(subParam);
  const [sort, setSort] = useState<MarketplaceSort>(
    SORT_OPTIONS.some((s) => s.value === sortParam) ? sortParam : "for_you",
  );
  const [geoDetecting, setGeoDetecting] = useState(false);
  const [geoFilter, setGeoFilter] = useState<GeoFilterState>({
    coordinates: null,
    maxDistanceKm: 0,
    locationAvailable: false,
    scope: "radius",
  });
  const [areaOpen, setAreaOpen] = useState(false);

  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [activeDeals, setActiveDeals] = useState<ShopDeal[]>([]);
  const [shopCoupons, setShopCoupons] = useState<Record<string, Coupon[]>>({});
  const [offerDateKey, setOfferDateKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [quickView, setQuickView] = useState<MarketplaceProduct | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);

  const syncUrl = useCallback(
    (next: {
      q?: string;
      category?: ShopCategory;
      sub?: string | null;
      sort?: MarketplaceSort;
      product?: string | null;
    }) => {
      const params = new URLSearchParams();
      const q = next.q ?? query;
      const cat = next.category ?? activeCategory;
      const sub = next.sub !== undefined ? next.sub : activeSubCategoryId;
      const s = next.sort ?? sort;
      const prod = next.product !== undefined ? next.product : productParam;

      if (q.trim()) params.set("q", q.trim());
      if (cat && cat !== "All") params.set("category", cat);
      if (sub) params.set("sub", sub);
      if (s && s !== "for_you") params.set("sort", s);
      if (prod) params.set("product", prod);

      const qs = params.toString();
      router.replace(qs ? `/products?${qs}` : "/products", { scroll: false });
    },
    [query, activeCategory, activeSubCategoryId, sort, productParam, router],
  );

  // Keep local state in sync when URL changes (back/forward)
  useEffect(() => {
    setQuery(qParam);
    setActiveCategory(SHOP_CATEGORIES.includes(categoryParam) ? categoryParam : "All");
    setActiveSubCategoryId(subParam);
    setSort(SORT_OPTIONS.some((s) => s.value === sortParam) ? sortParam : "for_you");
  }, [qParam, categoryParam, subParam, sortParam]);

  // Load products
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const result = await fetchMarketplaceProducts({
        query: qParam,
        category: categoryParam === "All" ? undefined : categoryParam,
        subCategoryId: subParam,
        sort: SORT_OPTIONS.some((s) => s.value === sortParam) ? sortParam : "for_you",
        limit: 72,
      });
      if (cancelled) return;
      if (result.success) {
        setProducts(result.data);
        setVisibleCount(24);
        const shopIds = [...new Set(result.data.map((p) => p.shop_id).filter(Boolean))];
        void fetchActiveCouponsForShops(shopIds).then((cRes) => {
          if (!cancelled && cRes.success) setShopCoupons(cRes.data);
        });
        if (productParam) {
          const match = result.data.find((p) => p.id === productParam);
          if (match) setQuickView(match);
        }
      } else {
        setError(result.error);
        setProducts([]);
      }
      setLoading(false);
    }, qParam ? 220 : 0);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [qParam, categoryParam, subParam, sortParam, productParam]);

  useEffect(() => {
    let cancelled = false;
    void fetchActiveDeals(80).then((result) => {
      if (!cancelled && result.success) setActiveDeals(result.data);
    });
    const onDeals = () => {
      void fetchActiveDeals(80).then((result) => {
        if (!cancelled && result.success) setActiveDeals(result.data);
      });
    };
    window.addEventListener("trendmart:deals-updated", onDeals);
    return () => {
      cancelled = true;
      window.removeEventListener("trendmart:deals-updated", onDeals);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const shopIds = [...new Set(products.map((p) => p.shop_id).filter(Boolean))];
    const onCoupons = () => {
      if (!shopIds.length) return;
      void fetchActiveCouponsForShops(shopIds).then((cRes) => {
        if (!cancelled && cRes.success) setShopCoupons(cRes.data);
      });
    };
    window.addEventListener("trendmart:coupons-updated", onCoupons);
    return () => {
      cancelled = true;
      window.removeEventListener("trendmart:coupons-updated", onCoupons);
    };
  }, [products]);

  // Favorites
  useEffect(() => {
    let cancelled = false;
    getAllFavorites().then((items) => {
      if (cancelled) return;
      setFavorites(new Set(items.filter((i) => i.type === "product").map((i) => i.id)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const getOfferContext = useCallback(
    (product: {
      shop_id?: string;
      shop_free_delivery_threshold?: number | null;
      shop_delivery_fee_flat?: number | null;
      shop_delivery_fee_per_km?: number | null;
    }): ProductOfferContext => {
      const shopId = product.shop_id || "";
      const today = toPkDateKey();
      const dealLabels = activeDeals
        .filter((d) => d.shop_id === shopId && isDealActiveOnDate(d, today))
        .map((d) => formatDealDisplayLabel(d));
      const couponLabels = formatCouponTickerLabels(shopCoupons[shopId] ?? []);
      // Coupons + delivery always — even when this product isn't part of a deal.
      return {
        freeDeliveryThreshold: product.shop_free_delivery_threshold,
        deliveryFeeFlat: product.shop_delivery_fee_flat,
        deliveryFeePerKm: product.shop_delivery_fee_per_km,
        dealLabels,
        couponLabels,
      };
    },
    [activeDeals, shopCoupons],
  );

  const getDealStripOfferTags = useCallback(
    (shopId: string) => {
      const sample = products.find((p) => p.shop_id === shopId);
      const today = toPkDateKey();
      const dealLabels = activeDeals
        .filter((d) => d.shop_id === shopId && isDealActiveOnDate(d, today))
        .map((d) => formatDealDisplayLabel(d));
      return buildShopTickerTags({
        coupons: shopCoupons[shopId] ?? [],
        dealLabels,
        freeDeliveryThreshold: sample?.shop_free_delivery_threshold,
        deliveryFeeFlat: sample?.shop_delivery_fee_flat,
        deliveryFeePerKm: sample?.shop_delivery_fee_per_km,
      });
    },
    [products, shopCoupons, activeDeals],
  );

  /** Deals matching the current search (when-tag / title / shop). */
  const searchMatchedDeals = useMemo(() => {
    const q = query.trim();
    if (!q) return activeDeals;
    const ranked = fuzzyFilterAndRank(
      activeDeals.filter((d) => d.is_active),
      q,
      (d) => [dealSearchHaystack(d), formatDealWhenTag(d)],
      { minScore: FUZZY_MIN_SCORE },
    );
    return ranked.length ? ranked.map((r) => r.item) : [];
  }, [activeDeals, query]);

  const displayProducts = useMemo(() => {
    const coords = geoFilter.coordinates ?? globalCoords;
    const radiusActive =
      geoFilter.scope === "radius" && !!coords && geoFilter.maxDistanceKm > 0;

    let list = products;

    if (radiusActive && coords) {
      const radius = geoFilter.maxDistanceKm;
      const nearby: MarketplaceProduct[] = [];
      const unpinned: MarketplaceProduct[] = [];

      for (const p of products) {
        if (p.shop_latitude == null || p.shop_longitude == null) {
          unpinned.push(p);
          continue;
        }
        const km = haversineDistance(
          coords.latitude,
          coords.longitude,
          p.shop_latitude,
          p.shop_longitude,
        );
        if (km != null && km <= radius) nearby.push(p);
      }

      list = [
        ...diversifyMarketplaceFeed(nearby, sort),
        ...diversifyMarketplaceFeed(unpinned, sort),
      ];
    }

    if (offerDateKey) {
      const dealShopIds = shopIdsWithDealOnDate(activeDeals, offerDateKey);
      list = list.filter((p) => dealShopIds.has(p.shop_id));
    }

    // Search: boost products from shops whose deals match ("Monday deal", "14 August", …)
    const q = query.trim();
    if (q && searchMatchedDeals.length > 0) {
      const boostIds = new Set(searchMatchedDeals.map((d) => d.shop_id));
      const boosted = list.filter((p) => boostIds.has(p.shop_id));
      const rest = list.filter((p) => !boostIds.has(p.shop_id));
      list = [...boosted, ...rest];
    }

    return list;
  }, [
    products,
    geoFilter,
    globalCoords,
    sort,
    offerDateKey,
    activeDeals,
    query,
    searchMatchedDeals,
  ]);

  const matchingDealCount = useMemo(() => {
    const q = query.trim();
    if (!q) return 0;
    const today = toPkDateKey();
    const live = activeDeals.filter((d) => d.is_active && isDealActiveOnDate(d, today));
    return fuzzyFilterAndRank(
      live,
      q,
      (d) => [dealSearchHaystack(d), formatDealWhenTag(d), d.title],
      { minScore: FUZZY_MIN_SCORE },
    ).length;
  }, [activeDeals, query]);

  const searchSuggestions = useMemo(() => {
    if (!qParam.trim() || displayProducts.length > 0) return [];
    return suggestSearchCorrections(qParam, 4);
  }, [qParam, displayProducts.length]);

  const visibleProducts = useMemo(
    () => displayProducts.slice(0, visibleCount),
    [displayProducts, visibleCount],
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

  const handleSortChange = useCallback(
    (value: MarketplaceSort) => {
      setSort(value);
      syncUrl({ sort: value });
    },
    [syncUrl],
  );

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      syncUrl({ q: query });
    },
    [query, syncUrl],
  );

  const handleProductClick = useCallback(
    (product: MarketplaceProduct | { id: string }) => {
      const full = products.find((p) => p.id === product.id) ?? (product as MarketplaceProduct);
      setQuickView(full);
      syncUrl({ product: full.id });
    },
    [products, syncUrl],
  );

  const handleCloseQuickView = useCallback(() => {
    setQuickView(null);
    syncUrl({ product: null });
  }, [syncUrl]);

  const handleAddToCart = useCallback(
    (product: MarketplaceProduct | { id: string; shop_id?: string; name?: string }) => {
      const full =
        "shop_name" in product
          ? (product as MarketplaceProduct)
          : products.find((p) => p.id === product.id);
      if (!full || !full.is_available) {
        addToast("This product is unavailable.", "error");
        return;
      }
      const shop: Pick<Shop, "id" | "name" | "whatsapp_number"> = {
        id: full.shop_id,
        name: full.shop_name || "Store",
        whatsapp_number: full.shop_whatsapp || "",
      };
      addItem(full, shop, 1);
      addToast(`“${full.name}” added to cart`, "success");
    },
    [products, addItem, addToast],
  );

  const handleFavorite = useCallback(
    async (
      product: {
        id: string;
        name?: string;
        image_url?: string | null;
        shop_id?: string;
        shop_name?: string | null;
      },
      next: boolean,
    ) => {
      setFavorites((prev) => {
        const n = new Set(prev);
        if (next) n.add(product.id);
        else n.delete(product.id);
        return n;
      });
      const ok = await toggleFavorite(
        product.id,
        "product",
        product.name || "Product",
        product.image_url ?? undefined,
        product.shop_id,
        product.shop_name ?? undefined,
      );
      if (!ok) {
        setFavorites((prev) => {
          const n = new Set(prev);
          if (next) n.delete(product.id);
          else n.add(product.id);
          return n;
        });
        addToast("Could not update wishlist", "error");
      }
    },
    [addToast],
  );

  const handleShopClick = useCallback(
    (product: { shop_id?: string }) => {
      if (product.shop_id) router.push(`/shop/${product.shop_id}`);
    },
    [router],
  );

  const quickViewShop: Pick<Shop, "id" | "name" | "whatsapp_number"> | null = quickView
    ? {
        id: quickView.shop_id,
        name: quickView.shop_name || "Store",
        whatsapp_number: quickView.shop_whatsapp || "",
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 page-stack px-3 py-3 pb-28 md:px-4 md:py-5 md:pb-10">
      {/* Header */}
      <header className="mb-3">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Marketplace
        </p>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
          Products for you
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Items from local stores — tap to add to cart or visit the shop
          </p>
          <Link
            href="/deals"
            className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          >
            Browse deals →
          </Link>
        </div>
      </header>

      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="mb-3">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products (typos OK)…"
            className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-20 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Search products"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Search
          </button>
        </label>
      </form>

      {matchingDealCount > 0 ? (
        <Link
          href={`/deals?q=${encodeURIComponent(query.trim())}`}
          className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-emerald-50 px-3 py-2.5 text-sm dark:border-amber-900/40 dark:from-amber-950/40 dark:to-emerald-950/30"
        >
          <span className="font-semibold text-amber-900 dark:text-amber-100">
            {matchingDealCount} deal{matchingDealCount === 1 ? "" : "s"} match “{query.trim()}”
          </span>
          <span className="shrink-0 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            View deals →
          </span>
        </Link>
      ) : null}

      {/* Categories */}
      <section aria-label="Category filters" className="tm-cat-bar -mx-3 sm:-mx-4">
        <div className="tm-cat-scroll px-2 scrollbar-none sm:px-3">
          {SHOP_CATEGORIES.map((category) => {
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

      {activeCategory !== "All" && (
        <SubCategoryPills
          mainCategory={activeCategory}
          selectedId={activeSubCategoryId}
          onSelect={handleSubCategoryChange}
          label="Filter by sub-category"
        />
      )}

      <OfferDaysStrip
        deals={activeDeals}
        selectedDateKey={offerDateKey}
        onSelect={setOfferDateKey}
        variant="pills"
        className="mb-1.5"
      />

      <FeaturedDealsStrip
        deals={query.trim() ? (searchMatchedDeals.length ? searchMatchedDeals : activeDeals) : activeDeals}
        dateKey={offerDateKey}
        title={
          query.trim() && searchMatchedDeals.length
            ? "Matching deals"
            : sort === "for_you" || sort === "discount"
              ? "For You · deals"
              : "Live deals"
        }
        seeAllHref={query.trim() ? `/deals?q=${encodeURIComponent(query.trim())}` : "/deals"}
        className="mb-3"
        getOfferTags={getDealStripOfferTags}
      />

      {/* Sticky mobile filter strip */}
      <div className="sticky top-[var(--tm-navbar-sticky-offset,4.35rem)] z-30 -mx-3 mb-3 border-b border-zinc-100/80 bg-white/95 px-3 py-2 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none dark:sm:bg-transparent">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSortChange(opt.value)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                  sort === opt.value
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAreaOpen((v) => !v)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
              areaOpen || (geoFilter.scope === "radius" && geoFilter.maxDistanceKm > 0)
                ? "bg-teal-600 text-white"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
            aria-expanded={areaOpen}
          >
            Area
          </button>
        </div>
        {areaOpen && (
          <div className="mt-2 rounded-2xl border border-zinc-100 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
            <GeoRadiusFilter
              onFilterChange={setGeoFilter}
              isDetecting={geoDetecting}
              onDetectStart={() => setGeoDetecting(true)}
              onDetectEnd={() => setGeoDetecting(false)}
            />
          </div>
        )}
      </div>

      <p className="mb-2 text-[11px] text-zinc-400 dark:text-zinc-500">
        {loading
          ? "Loading products…"
          : `Showing ${Math.min(visibleCount, displayProducts.length)} of ${displayProducts.length}`}
      </p>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
          <button
            type="button"
            className="ml-2 font-semibold underline"
            onClick={() => router.refresh()}
          >
            Retry
          </button>
        </div>
      )}

      <ProductGrid
        products={visibleProducts}
        loading={loading}
        columns="auto"
        compact
        showShopMeta
        favorites={favorites}
        getOfferContext={getOfferContext}
        onProductClick={(p) => handleProductClick(p as MarketplaceProduct)}
        onAddToCart={(p) => handleAddToCart(p as MarketplaceProduct)}
        onFavoriteToggle={(p, next) => handleFavorite(p, next)}
        onShopClick={handleShopClick}
        emptyState={
          <div className="mx-auto max-w-md py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-600/20">
              <PackageIcon />
            </div>
            <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
              {qParam || activeCategory !== "All" ? "No matching products" : "No products yet"}
            </h3>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              {qParam || activeCategory !== "All"
                ? "Try another search, category, or widen your area filter."
                : "When merchants list items, they’ll show up here across every store."}
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
              {(qParam || activeCategory !== "All") && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    handleCategoryChange("All");
                    syncUrl({ q: "", category: "All", sub: null });
                  }}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Clear filters
                </button>
              )}
              <Link
                href="/"
                className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Browse shops
              </Link>
            </div>
          </div>
        }
      />

      {!loading && visibleCount < displayProducts.length && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + 24)}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 active:scale-95 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
          >
            Load more
          </button>
        </div>
      )}

      {quickView && quickViewShop && (
        <QuickViewModal
          product={quickView}
          shop={quickViewShop}
          onClose={handleCloseQuickView}
          isWishlisted={favorites.has(quickView.id)}
          onWishlistToggle={() =>
            handleFavorite(quickView, !favorites.has(quickView.id))
          }
        />
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center px-4">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      }
    >
      <ProductsPageInner />
    </Suspense>
  );
}
