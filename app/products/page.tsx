"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MarketplaceProduct, Product, Shop, ShopCategory } from "@/types";
import { SHOP_CATEGORIES } from "@/types";
import { type MarketplaceSort } from "@/services/productService";
import ProductGrid from "@/components/ProductGrid";
import SubCategoryPills from "@/components/SubCategoryPills";
import GeoRadiusFilter, { type GeoFilterState } from "@/components/GeoRadiusFilter";
import { useLocation } from "@/context/LocationContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/components/Toast";
import ProductOrderModal, { type ProductOrderIntent } from "@/components/ProductOrderModal";
import { fetchShopById } from "@/services/shopService";
import { getAllFavorites, toggleFavorite } from "@/services/wishlistService";
import { filterShopsByProximity, haversineDistance, getCustomerArea } from "@/services/geoRadiusService";
import { diversifyMarketplaceFeed } from "@/lib/marketplaceDiversity";
import { useQueryClient } from "@tanstack/react-query";
import { useMarketplaceProductsInfinite, useDeals, useShopCoupons, useMyShop } from "@/lib/queries";
import { type Coupon } from "@/services/couponService";
import {
  isDealActiveOnDate,
  toPkDateKey,
  formatDealDisplayLabel,
  formatDealWhenTag,
  dealSearchHaystack,
  type ShopDeal,
} from "@/lib/dealSchedule";
import { formatCouponTickerLabels } from "@/lib/shopOfferLabels";
import type { ProductOfferContext } from "@/components/ProductGrid";
import {
  fuzzyFilterAndRank,
  suggestSearchCorrections,
  FUZZY_MIN_SCORE,
} from "@/lib/fuzzySearch";
import {
  trackProductView,
  trackSearch,
  trackCategoryInterest,
} from "@/lib/behavior";
import { logProductClick } from "@/services/analyticsService";

const QuickViewModal = dynamic(() => import("@/components/QuickViewModal"), {
  ssr: false,
});

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
  { value: "nearest", label: "Nearest" },
  { value: "popular", label: "Top rated" },
  { value: "newest", label: "Newest" },
  { value: "discount", label: "Best deals" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
];

/* Stable empty fallbacks so derived memos don't change identity every render. */
const EMPTY_PRODUCTS: MarketplaceProduct[] = [];
const EMPTY_DEALS: ShopDeal[] = [];
const EMPTY_COUPONS: Record<string, Coupon[]> = {};

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

function ProductsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const { addItem } = useCart();
  const { coordinates: globalCoords, location: globalLocation } = useLocation();

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

  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [quickView, setQuickView] = useState<MarketplaceProduct | null>(null);
  // Direct "Order" checkout (single product → WhatsApp, no cart step).
  const [orderIntent, setOrderIntent] = useState<ProductOrderIntent | null>(null);
  const [orderShop, setOrderShop] = useState<Shop | null>(null);
  // Infinite-scroll sentinel element (IntersectionObserver) for auto-load.
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const queryClient = useQueryClient();

  // Merchants never see their own products in the marketplace feed.
  const myShopQuery = useMyShop();
  const myShopId = myShopQuery.data?.id ?? null;

  const productsQuery = useMarketplaceProductsInfinite({
    query: qParam,
    category: categoryParam === "All" ? undefined : categoryParam,
    subCategoryId: subParam,
    sort: SORT_OPTIONS.some((s) => s.value === sortParam) ? sortParam : "for_you",
    limit: 48,
  });
  // Flatten accumulated pages into a single deduped array (stable across renders).
  const products = useMemo(() => {
    const flat = productsQuery.data?.pages.flat() ?? EMPTY_PRODUCTS;
    const seen = new Set<string>();
    return flat.filter((p) => {
      if (seen.has(p.id)) return false;
      if (myShopId && p.shop_id === myShopId) return false;
      seen.add(p.id);
      return true;
    });
  }, [productsQuery.data, myShopId]);
  const loading = productsQuery.isLoading;
  const error = productsQuery.error ? productsQuery.error.message : null;
  const hasNextPage = !!productsQuery.hasNextPage;
  const isFetchingNextPage = productsQuery.isFetchingNextPage;
  const fetchNextPage = productsQuery.fetchNextPage;

  // Keep the latest products + URL-sync fn in refs so the per-card handlers
  // stay stable across re-renders (search typing, sort, infinite-scroll page
  // loads). Without this, memoized ProductCard re-renders the whole grid on
  // every keystroke / new page — the main lag at 8k products.
  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const dealsQuery = useDeals(80);
  const activeDeals = dealsQuery.data ?? EMPTY_DEALS;

  const shopIds = useMemo(
    () => [...new Set(products.map((p) => p.shop_id).filter(Boolean))],
    [products],
  );
  const couponsQuery = useShopCoupons(shopIds);
  const shopCoupons: Record<string, Coupon[]> = couponsQuery.data ?? EMPTY_COUPONS;

  // Infinite scroll: when the sentinel scrolls into view and more pages exist,
  // fetch the next page (server-side cursor pagination).
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Deep-link: open the quick view for a ?product=<id> in the URL.
  useEffect(() => {
    if (!productParam) return;
    const match = products.find((p) => p.id === productParam);
    if (match) {
      if (myShopId && match.shop_id === myShopId) return;
      setQuickView(match);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { fetchMarketplaceProductById } = await import("@/services/productService");
      const res = await fetchMarketplaceProductById(productParam);
      if (cancelled || !res.success || !res.data) return;
      if (myShopId && res.data.shop_id === myShopId) return;
      setQuickView(res.data);
      trackProductView({
        id: res.data.id,
        name: res.data.name,
        price: res.data.price,
        imageUrl: res.data.image_url,
        shopId: res.data.shop_id,
        shopName: res.data.shop_name,
        category: res.data.shop_category ?? res.data.category_id ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [productParam, products, myShopId]);

  // Invalidate cached queries when merchants publish/update in other tabs.
  useEffect(() => {
    const onDeals = () => queryClient.invalidateQueries({ queryKey: ["deals"] });
    window.addEventListener("trendmart:deals-updated", onDeals);
    return () => window.removeEventListener("trendmart:deals-updated", onDeals);
  }, [queryClient]);

  useEffect(() => {
    const onCoupons = () => queryClient.invalidateQueries({ queryKey: ["coupons"] });
    window.addEventListener("trendmart:coupons-updated", onCoupons);
    return () => window.removeEventListener("trendmart:coupons-updated", onCoupons);
  }, [queryClient]);

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

  // Stable reference to the latest syncUrl so product-click handlers don't
  // re-create (and re-render every memoized card) on each keystroke.
  const syncUrlRef = useRef(syncUrl);
  useEffect(() => {
    syncUrlRef.current = syncUrl;
  }, [syncUrl]);

  // Keep local state in sync when URL changes (back/forward)
  useEffect(() => {
    setQuery(qParam);
    setActiveCategory(SHOP_CATEGORIES.includes(categoryParam) ? categoryParam : "All");
    setActiveSubCategoryId(subParam);
    setSort(SORT_OPTIONS.some((s) => s.value === sortParam) ? sortParam : "for_you");
  }, [qParam, categoryParam, subParam, sortParam]);

  // Live search: as the user types, debounce-update the URL so results refresh
  // automatically — no need to press Enter.
  useEffect(() => {
    if (query === qParam) return;
    const t = setTimeout(() => {
      syncUrl({ q: query });
    }, 300);
    return () => clearTimeout(t);
  }, [query, qParam, syncUrl]);

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

  // Precompute offer context ONCE per shop (not per product per render) into a
  // stable Map. This removes the O(products × deals) recompute AND gives every
  // ProductCard a stable `offerContext` object identity, so the memoized cards
  // don't re-render on unrelated parent state changes.
  const offerContextByShop = useMemo(() => {
    const today = toPkDateKey();
    const map = new Map<string, ProductOfferContext>();
    for (const p of products) {
      const shopId = p.shop_id;
      if (!shopId || map.has(shopId)) continue;
      const dealLabels = activeDeals
        .filter((d) => d.shop_id === shopId && isDealActiveOnDate(d, today))
        .map((d) => formatDealDisplayLabel(d));
      map.set(shopId, {
        freeDeliveryThreshold: p.shop_free_delivery_threshold,
        deliveryFeeFlat: p.shop_delivery_fee_flat,
        deliveryFeePerKm: p.shop_delivery_fee_per_km,
        dealLabels,
        couponLabels: formatCouponTickerLabels(shopCoupons[shopId] ?? []),
      });
    }
    return map;
  }, [products, activeDeals, shopCoupons]);

  const getOfferContext = useCallback(
    (product: { shop_id?: string }): ProductOfferContext | null =>
      offerContextByShop.get(product.shop_id || "") ?? null,
    [offerContextByShop],
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

  // Build a deduplicated list of pseudo-shops from the product join so the
  // same proximity / merchant-coverage engine used on the homepage applies here.
  const productShops = useMemo(() => {
    const map = new Map<string, Shop>();
    for (const p of products) {
      if (!p.shop_id || map.has(p.shop_id)) continue;
      map.set(p.shop_id, {
        id: p.shop_id,
        name: p.shop_name ?? "",
        category: p.shop_category ?? "",
        location: p.shop_location ?? "",
        whatsapp_number: p.shop_whatsapp ?? "",
        is_live: true,
        latitude: p.shop_latitude ?? null,
        longitude: p.shop_longitude ?? null,
        service_radius_km: p.shop_service_radius_km ?? null,
        delivery_zones: p.shop_delivery_zones ?? null,
      });
    }
    return [...map.values()];
  }, [products]);

  // Location-visible shop IDs (radius / city / pakistan scope + merchant coverage).
  const [geoVisibleShopIds, setGeoVisibleShopIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function compute() {
      const scope = geoFilter.scope;
      const coords = geoFilter.coordinates ?? globalCoords ?? null;

      // All Pakistan never narrows by location — show every shop's products.
      if (scope === "pakistan") {
        setGeoVisibleShopIds(null);
        return;
      }
      // No pin + city browse → no location restriction on products.
      if (scope === "city" && !coords) {
        setGeoVisibleShopIds(null);
        return;
      }
      if (scope === "radius" && !coords) {
        setGeoVisibleShopIds(null);
        return;
      }

      try {
        const result = await filterShopsByProximity(productShops, {
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
  }, [productShops, geoFilter, globalCoords, globalLocation]);

  const displayProducts = useMemo(() => {
    let list = products;

    if (geoVisibleShopIds) {
      list = diversifyMarketplaceFeed(
        list.filter((p) => geoVisibleShopIds.has(p.shop_id)),
        sort,
      );
    }

    // "Nearest" sort: re-sort by straight-line distance to the customer's pin.
    // Products without a shop pin sink to the bottom (still visible).
    if (sort === "nearest" && globalCoords) {
      const { latitude, longitude } = globalCoords;
      list = [...list].sort((a, b) => {
        const da =
          a.shop_latitude != null && a.shop_longitude != null
            ? haversineDistance(latitude, longitude, a.shop_latitude, a.shop_longitude) ?? Infinity
            : Infinity;
        const db =
          b.shop_latitude != null && b.shop_longitude != null
            ? haversineDistance(latitude, longitude, b.shop_latitude, b.shop_longitude) ?? Infinity
            : Infinity;
        return da - db;
      });
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
    geoVisibleShopIds,
    sort,
    globalCoords,
    activeDeals,
    query,
    searchMatchedDeals,
  ]);

  const searchSuggestions = useMemo(() => {
    if (!qParam.trim() || displayProducts.length > 0) return [];
    return suggestSearchCorrections(qParam, 4);
  }, [qParam, displayProducts.length]);

  // All accumulated + filtered products render directly (infinite scroll pages
  // load lazily via the sentinel below, so we never mount a huge list up front).
  const visibleProducts = displayProducts;

  const handleCategoryChange = useCallback(
    (category: ShopCategory) => {
      setActiveCategory(category);
      setActiveSubCategoryId(null);
      setAreaOpen(false);
      syncUrl({ category, sub: null });
    },
    [syncUrl],
  );

  const handleSubCategoryChange = useCallback(
    (subId: string | null) => {
      setActiveSubCategoryId(subId);
      setAreaOpen(false);
      syncUrl({ sub: subId });
    },
    [syncUrl],
  );

  const handleSortChange = useCallback(
    (value: MarketplaceSort) => {
      setSort(value);
      setAreaOpen(false);
      syncUrl({ sort: value });
    },
    [syncUrl],
  );

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      syncUrl({ q: query });
      trackSearch(query);
    },
    [query, syncUrl],
  );

  const handleProductClick = useCallback(
    (product: MarketplaceProduct | { id: string }) => {
      const full =
        productsRef.current.find((p) => p.id === product.id) ??
        (product as MarketplaceProduct);
      setQuickView(full);
      syncUrlRef.current({ product: full.id });
      // Behaviour memory: recently viewed + category affinity.
      trackProductView({
        id: full.id,
        name: full.name,
        price: full.price,
        imageUrl: full.image_url,
        shopId: full.shop_id,
        shopName: full.shop_name,
        category: full.shop_category ?? full.category_id ?? null,
      });
      trackCategoryInterest(full.shop_category ?? full.category_id, "click");
      // Real click tally → feeds the popularity-based search/feed ranking.
      void logProductClick(full.shop_id, full.id);
    },
    [],
  );

  const handleCloseQuickView = useCallback(() => {
    setQuickView(null);
    syncUrlRef.current({ product: null });
  }, []);

  const handleAddToCart = useCallback(
    (product: MarketplaceProduct | { id: string; shop_id?: string; name?: string }) => {
      const full =
        "shop_name" in product
          ? (product as MarketplaceProduct)
          : productsRef.current.find((p) => p.id === product.id);
      if (!full || !full.is_available) {
        addToast("This product is unavailable.", "error");
        return;
      }
      // Variant products must open the option picker first — otherwise the
      // customer would silently add the base (Size/Flavour) price to cart.
      if (full.variants && full.variants.length > 0) {
        setQuickView(full);
        syncUrlRef.current({ product: full.id });
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
    [addItem, addToast],
  );

  const handleOrder = useCallback(
    async (intent: ProductOrderIntent) => {
      const product = intent.product;
      const full =
        productsRef.current.find((p) => p.id === product.id) ??
        (product as MarketplaceProduct);
      if (!full || !full.is_available) {
        addToast("This product is unavailable.", "error");
        return;
      }
      const shopPick: Pick<Shop, "id" | "name" | "whatsapp_number"> = {
        id: full.shop_id,
        name: full.shop_name || "Store",
        whatsapp_number: full.shop_whatsapp || "",
      };
      if (!shopPick.whatsapp_number) {
        addToast("Store WhatsApp missing — opening store.", "info");
        router.push(`/shop/${full.shop_id}`);
        return;
      }

      // Seed the cart silently (login/verify resumes via CartBar), no toast —
      // "Order" is a direct order action, not "add to cart".
      addItem(product, shopPick, intent.quantity, intent.variant, intent.notes);
      trackProductView({
        id: full.id,
        name: full.name,
        price: full.price,
        imageUrl: full.image_url,
        shopId: full.shop_id,
        shopName: full.shop_name,
        category: full.shop_category ?? full.category_id ?? null,
      });

      // Minimal shop from embedded fields, then enrich with the full shop row
      // (min order, hours, delivery rules) for accurate checkout.
      const fallback: Shop = {
        id: full.shop_id,
        name: shopPick.name,
        whatsapp_number: shopPick.whatsapp_number,
        category: full.shop_category ?? "",
        location: full.shop_location ?? "",
        is_live: true,
        latitude: full.shop_latitude ?? null,
        longitude: full.shop_longitude ?? null,
        service_radius_km: full.shop_service_radius_km ?? null,
        delivery_zones: full.shop_delivery_zones ?? null,
        free_delivery_threshold: full.shop_free_delivery_threshold ?? null,
        delivery_fee_flat: full.shop_delivery_fee_flat ?? null,
        delivery_fee_per_km: full.shop_delivery_fee_per_km ?? null,
      };
      setOrderShop(fallback);
      setOrderIntent(intent);

      try {
        const res = await fetchShopById(full.shop_id);
        if (res.success && res.data.shop) {
          setOrderShop({
            ...res.data.shop,
            whatsapp_number: res.data.shop.whatsapp_number || shopPick.whatsapp_number,
            name: res.data.shop.name || shopPick.name,
          });
        }
      } catch {
        /* keep fallback */
      }
    },
    [addItem, addToast, router],
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
      try {
        // `toggleFavorite` returns the RESULTING favorited state (true = now
        // saved, false = now removed) — NOT a success flag. Treating `false`
        // as an error made every successful REMOVE roll back and show a
        // spurious "Could not update wishlist" toast. Only a thrown error is a
        // real failure; the service already falls back to localStorage on DB
        // errors, so it rarely throws.
        await toggleFavorite(
          product.id,
          "product",
          product.name || "Product",
          product.image_url ?? undefined,
          product.shop_id,
          product.shop_name ?? undefined,
        );
        if (next) {
          // Strong interest signal — wishlist add boosts category affinity.
          const full = productsRef.current.find((p) => p.id === product.id);
          trackCategoryInterest(full?.shop_category ?? full?.category_id, "wishlist");
        }
      } catch {
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

  // Stable per-card handlers so memoized ProductCard actually skips re-renders
  // during search/sort/infinite-scroll. Inline arrows here would otherwise
  // recreate on every parent render and defeat React.memo at 8k products.
  const handleGridOrder = useCallback(
    (product: Product) => {
      // Variant products must open the option picker first so the WhatsApp
      // order carries the selected Size/Flavour and its real price.
      if (product.variants && product.variants.length > 0) {
        const full =
          productsRef.current.find((p) => p.id === product.id) ??
          (product as MarketplaceProduct);
        setQuickView(full);
        syncUrlRef.current({ product: full.id });
        return;
      }
      handleOrder({ product, quantity: 1 });
    },
    [handleOrder],
  );

  const quickViewShop: Pick<Shop, "id" | "name" | "whatsapp_number"> | null = quickView
    ? {
        id: quickView.shop_id,
        name: quickView.shop_name || "Store",
        whatsapp_number: quickView.shop_whatsapp || "",
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 page-stack px-3 py-3 pb-3 md:px-4 md:py-5 md:pb-8">
      {/* Search — products only; no deal-match chrome */}
      <form onSubmit={handleSearchSubmit} className="mb-3">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, shops, categories"
            className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-24 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Search products"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-[4.6rem] top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              aria-label="Clear search"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          ) : null}
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Search
          </button>
        </label>
      </form>

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

      {/* Sticky mobile filter strip */}
      <div className="sticky top-[var(--tm-navbar-sticky-offset,4.35rem)] z-30 -mx-3 mb-3 border-b border-zinc-100/80 bg-white/95 px-3 py-2 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none dark:sm:bg-transparent">
        <div className="flex items-center gap-2">
          <div className="tm-fade-scroll-x flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5 pr-2 scrollbar-none">
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
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
              areaOpen || geoFilter.locationAvailable
                ? "border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                : "border-transparent bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
            aria-expanded={areaOpen}
          >
            Area
          </button>
        </div>
        <div className={areaOpen ? "mt-2" : ""}>
          <GeoRadiusFilter
            onFilterChange={setGeoFilter}
            isDetecting={geoDetecting}
            onDetectStart={() => setGeoDetecting(true)}
            onDetectEnd={() => setGeoDetecting(false)}
            open={areaOpen}
            onDismiss={() => setAreaOpen(false)}
            inline
          />
        </div>
      </div>

      <p className="mb-2 text-[11px] text-zinc-400 dark:text-zinc-500">
        {loading
          ? "Loading products…"
          : isFetchingNextPage
            ? "Loading more…"
            : `Showing ${displayProducts.length} product${displayProducts.length !== 1 ? "s" : ""}`}
      </p>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
          <button
            type="button"
            className="ml-2 font-semibold underline"
            onClick={() => productsQuery.refetch()}
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
        onProductClick={handleProductClick}
        onAddToCart={handleAddToCart}
        onOrder={handleGridOrder}
        onFavoriteToggle={handleFavorite}
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

      {/* Infinite-scroll sentinel + status — auto-loads the next page when it
          scrolls into view (or via the manual button as a fallback). */}
      {!loading && (
        <div ref={loadMoreRef} className="mt-6 flex min-h-[3rem] items-center justify-center">
          {isFetchingNextPage ? (
            <span className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              Loading more products…
            </span>
          ) : hasNextPage ? (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 active:scale-95 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
            >
              Load more
            </button>
          ) : displayProducts.length > 0 ? (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              You&apos;ve reached the end
            </p>
          ) : null}
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
          onOrder={(order) => {
            handleCloseQuickView();
            handleOrder(order);
          }}
        />
      )}

      {orderIntent && orderShop && (
        <ProductOrderModal
          product={orderIntent.product}
          shop={orderShop}
          variant={orderIntent.variant}
          quantity={orderIntent.quantity}
          notes={orderIntent.notes}
          onClose={() => {
            setOrderIntent(null);
            setOrderShop(null);
          }}
          onOrderPlaced={() => {
            setOrderIntent(null);
            setOrderShop(null);
          }}
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
