"use client";

import { useState, useEffect, use, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/types";
import { logShopView } from "@/services/analyticsService";
import { trackCategoryInterest, trackProductView } from "@/lib/behavior";
import { useLocation } from "@/context/LocationContext";
import { isCustomerWithinCoverage } from "@/services/geoRadiusService";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { ProductGridSkeleton, ShopBannerSkeleton } from "@/components/Skeletons";
import ContactModal from "@/components/ContactModal";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import WhatsAppFloatButton from "@/components/WhatsAppFloatButton";
import ProductGrid from "@/components/ProductGrid";
import CustomSelect from "@/components/CustomSelect";
import FeaturedDealsStrip from "@/components/FeaturedDealsStrip";
import { isDealActiveOnDate, toPkDateKey } from "@/lib/dealSchedule";
import { fuzzyFilterAndRank, FUZZY_MIN_SCORE } from "@/lib/fuzzySearch";
import { buildShopTickerTags } from "@/lib/shopOfferLabels";
import QuickViewModal from "@/components/QuickViewModal";
import ProductOrderModal, { type ProductOrderIntent } from "@/components/ProductOrderModal";
import ShopMediaHeader, { ShopLogoAvatar } from "@/components/ShopMediaHeader";
import SubCategoryPills from "@/components/SubCategoryPills";
import StoreReviews from "@/components/StoreReviews";
import CompactRating from "@/components/CompactRating";
import { getShopHoursSummary } from "@/lib/shopHours";
import { buildShopOfferSlides, formatOfferRemaining } from "@/lib/shopOfferTicker";
import { type Coupon } from "@/services/couponService";
import type { ShopDeal } from "@/lib/dealSchedule";
import { useShopDetail } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import {
  type StorefrontDisplayPrefs,
} from "@/services/themePrefsService";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/components/Toast";
import { useMerchantQuickAdd } from "@/context/MerchantQuickAddContext";
import { getAllFavorites, toggleFavorite } from "@/services/wishlistService";
import { getStoreTheme, type StoreTheme, isServiceTheme } from "@/lib/storeThemes";
import { formatRupees } from "@/lib/formatters";
import {
  instagramProfileUrl,
  normalizeInstagramHandle,
  normalizeTikTokHandle,
  normalizeFacebookUrl,
  tikTokProfileUrl,
} from "@/lib/socialLinks";
import {
  LocalBusinessSchema,
  BreadcrumbListSchema,
} from "@/components/SeoSchema";
import { absoluteUrl } from "@/lib/metadata";
import { getShopPath } from "@/lib/shopSlug";
import { subscribeToProducts } from "@/lib/supabase/realtime";
import ServiceBookingModal, { type ServicePackageItem } from "@/components/ServiceBookingModal";
import AvailabilitySchedule, { type AvailabilityDay } from "@/components/AvailabilitySchedule";
import type { PortfolioItem } from "@/components/ServicePortfolioManager";
import { createClient } from "@/lib/supabase/client";
import ToggleSwitch from "@/components/ToggleSwitch";
import { getDealImages } from "@/lib/productImages";
import { getSafeImageUrl } from "@/services/storageService";
import { deleteShopDeal, fetchDealsByShopId, updateShopDeal } from "@/services/dealService";
import { deleteProduct, setProductPinned } from "@/services/productService";
import ProductEditorModal from "@/components/ProductEditorModal";
import DealEditorModal from "@/components/DealEditorModal";
import ShopProfileEditorModal from "@/components/ShopProfileEditorModal";
import { type StoreManageAction } from "@/components/StoreManageActions";
import KebabMenu, { type KebabMenuItem } from "@/components/KebabMenu";
import { useConfirm } from "@/components/ConfirmProvider";
import { deleteCoupon } from "@/services/couponService";

// ─── Icons ──────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (<svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>);
}

function PinIcon() {
  return (<svg className="h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);
}

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" /></svg>);
}

function SearchIcon() {
  return (<svg className="h-4 w-4 shrink-0 text-zinc-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>);
}

function GridIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>); }

/** Owner-facing deal card (horizontal strip) — 3-dot menu: pin, edit, delete. */
function OwnerDealCard({
  deal,
  deleting,
  onEdit,
  onPinToggle,
  onDelete,
}: {
  deal: ShopDeal;
  deleting: boolean;
  onEdit: () => void;
  onPinToggle: () => void;
  onDelete: () => void;
}) {
  const cover = getDealImages(deal)[0] ?? deal.image_url ?? null;
  const pinned = deal.is_featured === true;

  const menuItems = useMemo<KebabMenuItem[]>(
    () => [
      {
        label: pinned ? "Unpin from top" : "Pin to top",
        onClick: onPinToggle,
        icon: (
          <svg
            className={`h-3.5 w-3.5 ${pinned ? "text-amber-500" : "text-zinc-400"}`}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
          </svg>
        ),
      },
      { label: "Edit", onClick: onEdit },
      { label: "Delete", onClick: onDelete, destructive: true },
    ],
    [pinned, onPinToggle, onEdit, onDelete],
  );

  return (
    <div
      className={`flex w-[15rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-opacity dark:border-zinc-700 dark:bg-zinc-900 ${
        deleting ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {cover ? (
          <Image
            src={getSafeImageUrl(cover, "product")}
            alt={deal.title}
            fill
            className="object-cover"
            sizes="15rem"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[0.6rem] font-bold uppercase text-zinc-400">
            Deal
          </div>
        )}
        {!deal.is_active ? (
          <span className="absolute left-1.5 top-1.5 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
            Paused
          </span>
        ) : null}
        <div className="absolute right-1.5 top-1.5">
          <KebabMenu items={menuItems} ariaLabel={`Options for ${deal.title}`} variant="overlay" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100" title={deal.title}>
          {pinned ? (
            <svg
              className="mr-1 inline-block h-3 w-3 shrink-0 align-[-1px] text-amber-500"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
            </svg>
          ) : null}
          {deal.title}
        </p>
        <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">
          {deal.price != null ? `Rs ${Math.round(deal.price).toLocaleString("en-PK")}` : "—"}
          {pinned ? " · Pinned" : ""}
        </p>
      </div>
    </div>
  );
}

// ─── Shop Detail Inner ──────────────────────────────────────────────────────

function ShopDetailInner({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const shopQuery = useShopDetail(id);
  const shop = shopQuery.data?.shop ?? null;
  const { location } = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Debounced search term — avoid re-running fuzzyFilterAndRank on every
  // keystroke (it's O(products) per render).
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const [priceSort, setPriceSort] = useState<"default" | "low" | "high">("default");
  const [activeSubCategoryId, setActiveSubCategoryId] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const { addToast } = useToast();
  const { addItem } = useCart();
  const { confirm } = useConfirm();
  const { openQuickAdd } = useMerchantQuickAdd();
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());

  // Owner-only deal manager state (all deals, incl. paused).
  const [ownerDeals, setOwnerDeals] = useState<ShopDeal[]>([]);
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);
  const [dealEditor, setDealEditor] = useState<ShopDeal | null>(null);
  const [dealEditorOpen, setDealEditorOpen] = useState(false);

  // Owner-only inline product editor (add + edit).
  const [editorProduct, setEditorProduct] = useState<Product | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Owner-only profile editor.
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);

  // Quick view modal state — cart-first: no single-item checkout
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  // Direct "Order" checkout (single product, no cart step) — mirrors DealCard.
  const [orderIntent, setOrderIntent] = useState<ProductOrderIntent | null>(null);

  // ── Service-specific state ─────────────────────────────────────────────────
  const [servicePackages, setServicePackages] = useState<ServicePackageItem[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [availabilityDays, setAvailabilityDays] = useState<AvailabilityDay[]>([]);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [displayPrefs, setDisplayPrefs] = useState<StorefrontDisplayPrefs>({
    showAnnouncementBanner: true,
    showWhatsappFloatingButton: true,
  });
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [deals, setDeals] = useState<ShopDeal[]>([]);
  const [couponsOpen, setCouponsOpen] = useState(false);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);
  // Optimistic open/closed override — flips instantly, reconciled on reload.
  const [openStatusOverride, setOpenStatusOverride] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const resolvedShopId = shop?.id ?? null;

  // ── Theme ──────────────────────────────────────────────────────────────────
  const theme: StoreTheme = useMemo(() => getStoreTheme(shop?.category), [shop?.category]);

  // ── Delivery-area notice (soft) for out-of-coverage visitors ─────────────
  const outsideCoverage = useMemo(() => {
    if (!shop || !location?.coordinates) return null;
    const gate = isCustomerWithinCoverage(
      shop,
      location.coordinates.latitude,
      location.coordinates.longitude,
      location.city,
    );
    if (gate.within) return null;
    return {
      mode: gate.coverageMode,
      distanceKm: gate.distanceKm,
      radiusKm: shop.service_radius_km ?? 0,
      city: shop.location || null,
    };
  }, [shop, location]);
  /** Service chrome (booking / packages) — category OR explicit shop_type. */
  const isServiceCategory = isServiceTheme(shop?.category) || shop?.shop_type === "service";
  /**
   * Always show a product grid when the shop has catalog items.
   * Service categories used to hide products entirely — merchants adding
   * courses/packages via the product form then saw an empty storefront.
   */
  const showProductCatalog = !isServiceCategory || products.length > 0;
  const THEME_ACCENT = "#10b981";

  // ── Data Loading (React Query: cached, no flicker) ────────────────────────
  useEffect(() => {
    if (shopQuery.isLoading) {
      setLoading(true);
      return;
    }
    setLoading(false);

    if (shopQuery.isError) {
      setError(shopQuery.error.message);
      return;
    }

    if (shopQuery.data) {
      setError(null);
      const d = shopQuery.data;
      setProducts(d.products);
      setIsOwner(d.isOwner);
      setDisplayPrefs(d.prefs);
      setCoupons(d.coupons);
      setDeals(d.deals);
      // Fire-and-forget visit log (skips owner + dedupes inside service)
      void logShopView(d.shop.id);
      // Behaviour memory: viewing a shop signals interest in its category.
      trackCategoryInterest(d.shop.category, "view");
    }
  }, [shopQuery.data, shopQuery.isLoading, shopQuery.isError, shopQuery.error]);

  // Refresh catalog when merchant adds from in-store modal
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["shop-detail", id] });
    };
    window.addEventListener("trendmart:products-updated", refresh);
    return () => window.removeEventListener("trendmart:products-updated", refresh);
  }, [id, queryClient]);

  const promoBannerSegments = useMemo(() => {
    if (!shop) return [];
    return buildShopOfferSlides({
      shopId: shop.id,
      freeDeliveryThreshold: shop.free_delivery_threshold,
      coupons,
      deals,
    }).map((s) => {
      const timer = formatOfferRemaining(s.expiresAt);
      return timer ? `${s.label}  ·  ${timer}` : s.label;
    });
  }, [shop, coupons, deals]);

  const productOfferContext = useMemo(() => {
    if (!shop) return null;
    const slides = buildShopOfferSlides({
      shopId: shop.id,
      freeDeliveryThreshold: shop.free_delivery_threshold,
      coupons,
      deals,
    });
    const couponLabels = slides.filter((s) => s.kind === "coupon").map((s) => s.label);
    const dealLabels = slides.filter((s) => s.kind === "deal").map((s) => s.label);
    return {
      freeDeliveryThreshold: shop.free_delivery_threshold,
      deliveryFeeFlat: shop.delivery_fee_flat,
      deliveryFeePerKm: shop.delivery_fee_per_km,
      couponLabels,
      dealLabels,
    };
  }, [shop, coupons, deals]);

  const shopDealOfferTags = useMemo(() => {
    if (!shop) return [];
    return buildShopTickerTags({
      coupons,
      freeDeliveryThreshold: shop.free_delivery_threshold,
      deliveryFeeFlat: shop.delivery_fee_flat,
      deliveryFeePerKm: shop.delivery_fee_per_km,
    });
  }, [shop, coupons]);

  const liveShopDeals = useMemo(() => {
    if (!shop) return [];
    const today = toPkDateKey();
    return deals
      .filter((d) => d.is_active && isDealActiveOnDate(d, today))
      .map((d) => ({
        ...d,
        shop_name: d.shop_name || shop.name,
        shop_logo_url: d.shop_logo_url || shop.logo_url,
        shop_slug: d.shop_slug || shop.slug,
        shop_whatsapp: d.shop_whatsapp || shop.whatsapp_number,
      }));
  }, [shop, deals]);

  // Deep links: #deals | #deal-{id} | #product-{id} (from WhatsApp order links)
  useEffect(() => {
    if (loading || !shop || typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;

    const scrollToHash = () => {
      const el = document.getElementById(hash);
      if (!el) return;
      // Don't fight an open modal / user interaction — only intentional deep links.
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const t = window.setTimeout(scrollToHash, 150);
    const onHash = () => scrollToHash();
    window.addEventListener("hashchange", onHash);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", onHash);
    };
  }, [loading, shop, liveShopDeals.length, products.length]);

  // ── Real-time product updates ─────────────────────────────────────────────
  useEffect(() => {
    if (!resolvedShopId) return;
    const unsubProducts = subscribeToProducts(resolvedShopId, (payload) => {
      const updated = payload.new as Product;
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    }, (payload) => {
      const newProduct = payload.new as Product;
      setProducts((prev) => [...prev, newProduct]);
    }, (payload) => {
      const deleted = payload.old as { id: string };
      setProducts((prev) => prev.filter((p) => p.id !== deleted.id));
    });
    return () => { unsubProducts(); };
  }, [resolvedShopId]);

  // ── Wishlist product IDs ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getAllFavorites().then((items) => {
      if (cancelled) return;
      setWishlistIds(new Set(items.filter((i) => i.type === "product").map((i) => i.id)));
    });
    const refresh = () => {
      getAllFavorites().then((items) => {
        if (!cancelled) {
          setWishlistIds(new Set(items.filter((i) => i.type === "product").map((i) => i.id)));
        }
      });
    };
    window.addEventListener("favoritesUpdated", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("favoritesUpdated", refresh);
    };
  }, []);

  // ── Owner deal manager: load ALL deals (active + paused) ─────────────────
  useEffect(() => {
    if (!isOwner || !resolvedShopId) return;
    let cancelled = false;
    const load = () => {
      fetchDealsByShopId(resolvedShopId).then((res) => {
        if (!cancelled && res.success) setOwnerDeals(res.data);
      });
    };
    load();
    const onDealsUpdated = () => load();
    window.addEventListener("trendmart:deals-updated", onDealsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("trendmart:deals-updated", onDealsUpdated);
    };
  }, [isOwner, resolvedShopId]);

  // ── Service Data Fetching ─────────────────────────────────────────────────
  useEffect(() => {
    if (!shop || !isServiceCategory) return;
    const fetchServiceData = async () => {
      try {
        const { data: pkgData } = await supabase.from("service_packages").select("*").eq("shop_id", shop.id).eq("is_active", true).order("sort_order", { ascending: true });
        if (pkgData) setServicePackages(pkgData as ServicePackageItem[]);
        const { data: portData } = await supabase.from("service_portfolio").select("*").eq("shop_id", shop.id).eq("is_published", true).order("project_date", { ascending: false }).limit(6);
        if (portData) setPortfolioItems(portData as PortfolioItem[]);
      } catch { /* ignore */ }
    };
    fetchServiceData();
  }, [shop, isServiceCategory, supabase]);

  // Sub-categories that actually have products in this shop (for cleaner pills)
  const productSubCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of products) {
      if (p.sub_category_id) ids.add(p.sub_category_id);
    }
    return ids;
  }, [products]);

  // Pinned deals first, then the fetched order (newest first).
  const sortedOwnerDeals = useMemo(() => {
    return [...ownerDeals].sort((a, b) => {
      const ap = a.is_featured === true ? 1 : 0;
      const bp = b.is_featured === true ? 1 : 0;
      return bp - ap;
    });
  }, [ownerDeals]);

  // Pinned product ids — drives the pin indicator + "Pin/Unpin" menu label.
  const pinnedProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of products) {
      if (p.is_pinned) ids.add(p.id);
    }
    return ids;
  }, [products]);

  // ── Filtered & Sorted Products ────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let result = products;
    if (activeSubCategoryId) {
      result = result.filter((p) => p.sub_category_id === activeSubCategoryId);
    }
    const q = debouncedQuery.trim();
    if (q) {
      result = fuzzyFilterAndRank(
        result,
        q,
        (p) => [p.name, p.title, p.description],
        { minScore: FUZZY_MIN_SCORE, weights: [1, 0.95, 0.75] },
      ).map((r) => r.item);
    }
    if (priceSort === "low") result = [...result].sort((a, b) => a.price - b.price);
    else if (priceSort === "high") result = [...result].sort((a, b) => b.price - a.price);
    else result = [...result].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
    return result;
  }, [products, debouncedQuery, priceSort, activeSubCategoryId]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleProductClick = useCallback((product: Product) => {
    setQuickViewProduct(product);
    trackProductView({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.image_url,
      shopId: shop?.id,
      shopName: shop?.name,
      category: shop?.category ?? product.category_id ?? null,
    });
  }, [shop]);

  const handleAddToCart = useCallback((product: Product) => {
    if (!shop || isOwner) return;
    addItem(product, { id: shop.id, name: shop.name, whatsapp_number: shop.whatsapp_number });
    addToast(`"${product.name}" added to cart`, "success");
  }, [shop, isOwner, addItem, addToast]);

  const handleOrder = useCallback((intent: ProductOrderIntent) => {
    const product = intent.product;
    if (!shop || isOwner) return;
    if (!shop.whatsapp_number) {
      addToast("This store has no WhatsApp number yet — please contact them directly.", "info");
      return;
    }
    // Seed the cart silently so login/verify can resume checkout via CartBar
    // (same mechanism as DealCard's "Order" button). No toast — this is an
    // order action, not an "add to cart".
    addItem(
      product,
      { id: shop.id, name: shop.name, whatsapp_number: shop.whatsapp_number },
      intent.quantity,
      intent.variant,
      intent.notes,
    );
    trackProductView({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.image_url,
      shopId: shop.id,
      shopName: shop.name,
      category: shop.category ?? product.category_id ?? null,
    });
    setOrderIntent(intent);
  }, [shop, isOwner, addItem, addToast]);

  const handleWishlistToggle = useCallback(
    async (product: Product) => {
      if (!shop) return;
      const nowInWishlist = await toggleFavorite(
        product.id,
        "product",
        product.name,
        product.image_url ?? undefined,
        shop.id,
        shop.name,
      );
      setWishlistIds((prev) => {
        const next = new Set(prev);
        if (nowInWishlist) next.add(product.id);
        else next.delete(product.id);
        return next;
      });
      addToast(
        nowInWishlist ? `"${product.name}" added to wishlist` : `"${product.name}" removed from wishlist`,
        "info",
      );
    },
    [shop, addToast],
  );

  // Owner taps "Edit" on a product → open the inline editor right here.
  const ownerEditProduct = useCallback((product: Product) => {
    setEditorProduct(product);
    setEditorOpen(true);
  }, []);

  // Stable per-card Order wrapper (avoids inline arrow defeating ProductCard memo).
  const handleGridOrder = useCallback(
    (product: Product) => handleOrder({ product, quantity: 1 }),
    [handleOrder],
  );

  const openAddProduct = useCallback(() => {
    setEditorProduct(null);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditorProduct(null);
  }, []);

  // Owner quick-action chips (also reused by the floating "+" chooser).
  const manageActions = useMemo<StoreManageAction[]>(() => {
    if (!shop) return [];
    return [
      {
        id: "product",
        label: "Add product",
        tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        icon: (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        ),
        onClick: openAddProduct,
      },
      {
        id: "bulk",
        label: "Bulk add",
        tone: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
        icon: (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        ),
        onClick: () => openQuickAdd({ shopId: shop.id, shopCategory: shop.category, tab: "bulk" }),
      },
      {
        id: "deal",
        label: "Add deal",
        tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
        icon: (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L4 4a2 2 0 0 0-1 3.59l.76.76a2 2 0 0 0 1.41.59H6l7.41 7.41a2 2 0 0 0 2.83 0l3.35-3.35a2 2 0 0 0 0-2.83z" transform="rotate(-45 12 12)" />
            <circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" />
          </svg>
        ),
        onClick: () => openQuickAdd({ shopId: shop.id, shopCategory: shop.category, tab: "deal" }),
      },
      {
        id: "coupon",
        label: "Add coupon",
        tone: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
        icon: (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
            <path d="M13 5v2" />
            <path d="M13 17v2" />
            <path d="M13 11v2" />
          </svg>
        ),
        onClick: () => openQuickAdd({ shopId: shop.id, shopCategory: shop.category, tab: "coupon" }),
      },
      {
        id: "story",
        label: "Add story",
        tone: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
        icon: (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        ),
        onClick: () => openQuickAdd({ shopId: shop.id, shopCategory: shop.category, tab: "story" }),
      },
      {
        id: "analytics",
        label: "Analytics",
        tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
        icon: (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="20" x2="12" y2="10" />
            <line x1="18" y1="20" x2="18" y2="4" />
            <line x1="6" y1="20" x2="6" y2="16" />
          </svg>
        ),
        href: "/dashboard/analytics",
      },
      {
        id: "settings",
        label: "Store settings",
        tone: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        icon: (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ),
        href: "/dashboard/settings",
      },
    ];
  }, [shop, openAddProduct, openQuickAdd]);

  const handleDeleteDeal = useCallback(
    async (dealId: string) => {
      const deal = ownerDeals.find((d) => d.id === dealId);
      const ok = await confirm({
        title: "Delete deal?",
        message: deal
          ? `"${deal.title}" will be permanently removed. This cannot be undone.`
          : "This deal will be permanently removed. This cannot be undone.",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        variant: "danger",
      });
      if (!ok) return;

      setDeletingDealId(dealId);
      const res = await deleteShopDeal(dealId);
      if (res.success) {
        setOwnerDeals((prev) => prev.filter((d) => d.id !== dealId));
        addToast("Deal deleted.", "success");
        queryClient.invalidateQueries({ queryKey: ["shop-detail", id] });
        queryClient.invalidateQueries({ queryKey: ["deals"] });
        window.dispatchEvent(new Event("trendmart:deals-updated"));
      } else {
        addToast(res.error, "error");
      }
      setDeletingDealId(null);
    },
    [ownerDeals, confirm, addToast, queryClient, id],
  );

  const openDealEditor = useCallback((deal: ShopDeal) => {
    setDealEditor(deal);
    setDealEditorOpen(true);
  }, []);

  const closeDealEditor = useCallback(() => {
    setDealEditorOpen(false);
    setDealEditor(null);
  }, []);

  const handlePinDeal = useCallback(
    async (deal: ShopDeal) => {
      const nextPinned = deal.is_featured !== true;
      setOwnerDeals((prev) =>
        prev.map((d) => (d.id === deal.id ? { ...d, is_featured: nextPinned } : d)),
      );
      const res = await updateShopDeal(deal.id, { is_featured: nextPinned });
      if (res.success) {
        addToast(nextPinned ? "Deal pinned to top." : "Deal unpinned.", "success");
        queryClient.invalidateQueries({ queryKey: ["shop-detail", id] });
        queryClient.invalidateQueries({ queryKey: ["deals"] });
        window.dispatchEvent(new Event("trendmart:deals-updated"));
      } else {
        setOwnerDeals((prev) =>
          prev.map((d) =>
            d.id === deal.id ? { ...d, is_featured: deal.is_featured === true } : d,
          ),
        );
        addToast(res.error, "error");
      }
    },
    [addToast, queryClient, id],
  );

  const handlePinProduct = useCallback(
    async (product: Product, nextPinned: boolean) => {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_pinned: nextPinned } : p)),
      );
      const res = await setProductPinned(product.id, nextPinned);
      if (res.success) {
        addToast(nextPinned ? "Product pinned to top." : "Product unpinned.", "success");
      } else {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id ? { ...p, is_pinned: product.is_pinned === true } : p,
          ),
        );
        addToast(res.error, "error");
      }
    },
    [addToast],
  );

  const handleDeleteProduct = useCallback(
    async (product: Product) => {
      const ok = await confirm({
        title: "Delete product?",
        message: `"${product.name}" will be permanently removed. This cannot be undone.`,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        variant: "danger",
      });
      if (!ok) return;
      const res = await deleteProduct(product.id);
      if (res.success) {
        setProducts((prev) => prev.filter((p) => p.id !== product.id));
        addToast("Product deleted.", "success");
        window.dispatchEvent(new Event("trendmart:products-updated"));
      } else {
        addToast(res.error ?? "Failed to delete product.", "error");
      }
    },
    [confirm, addToast],
  );

  // Owner-only quick open/closed toggle right in the storefront hours card.
  const handleToggleOpen = useCallback(
    async (open: boolean) => {
      if (!shop) return;
      const nextStatus = open ? "Open" : "Closed";

      // Optimistic: flip the toggle instantly, no network wait.
      setOpenStatusOverride(nextStatus);

      const { error } = await supabase
        .from("shops")
        .update({ operating_status: nextStatus })
        .eq("id", shop.id);
      if (error) {
        // Revert to the stored status on failure.
        setOpenStatusOverride(shop.operating_status?.trim() || "Open");
        addToast("Could not update store status.", "error");
        return;
      }
      addToast(open ? "Store is now open." : "Store is now closed.", "success");
      queryClient.invalidateQueries({ queryKey: ["shop-detail", id] });
      window.dispatchEvent(new Event("trendmart:shops-updated"));
    },
    [shop, supabase, addToast, queryClient, id],
  );

  // When the storefront refetch returns the real status, clear the optimistic
  // override so the card reflects the persisted value going forward.
  useEffect(() => {
    setOpenStatusOverride(null);
  }, [shop?.operating_status]);

  // Owner-only coupon delete.
  const handleDeleteCoupon = useCallback(
    async (couponId: string) => {
      const coupon = coupons.find((c) => c.id === couponId);
      const ok = await confirm({
        title: "Delete coupon?",
        message: coupon
          ? `Coupon "${coupon.code}" will be permanently removed.`
          : "This coupon will be permanently removed.",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        variant: "danger",
      });
      if (!ok) return;
      setDeletingCouponId(couponId);
      const res = await deleteCoupon(couponId);
      if (res.success) {
        setCoupons((prev) => prev.filter((c) => c.id !== couponId));
        addToast("Coupon deleted.", "success");
        queryClient.invalidateQueries({ queryKey: ["shop-detail", id] });
        window.dispatchEvent(new Event("trendmart:coupons-updated"));
      } else {
        addToast(res.error, "error");
      }
      setDeletingCouponId(null);
    },
    [coupons, confirm, addToast, queryClient, id],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 space-y-3 px-3 py-3 pb-3 md:space-y-4 md:px-4 md:py-5 md:pb-6">
      {shop ? (
        <>
          <LocalBusinessSchema
            shopName={shop.name}
            shopDescription={
              shop.store_bio ||
              `${shop.name} — ${shop.category} in ${shop.location}. Order via WhatsApp on TrendMart.`
            }
            shopUrl={absoluteUrl(getShopPath(shop))}
            shopLogoUrl={shop.logo_url ?? undefined}
            shopPhone={shop.whatsapp_number ?? undefined}
            shopCategory={shop.category}
            shopLocation={shop.location}
          />
          <BreadcrumbListSchema
            items={[
              { name: "Home", url: absoluteUrl("/") },
              { name: "Products", url: absoluteUrl("/products") },
              { name: shop.name, url: absoluteUrl(getShopPath(shop)) },
            ]}
          />
        </>
      ) : null}
      {loading && (<div className="space-y-4"><ShopBannerSkeleton /><ProductGridSkeleton count={4} /></div>)}
      {!loading && error && (<ErrorState title="Failed to load shop" message={error} onRetry={() => window.location.reload()} />)}
      {!loading && !error && shop && (<>
        {/* Hero — banner wide; logo beside shop name */}
        <section className="trend-card overflow-hidden">
          <ShopMediaHeader
            shopName={shop.name}
            bannerUrl={shop.banner_url}
            logoUrl={shop.logo_url}
            size="hero"
            logoPlacement="hidden"
          >
            {shop.is_live && (
              <span className="absolute left-3 top-3 z-[1] inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[0.65rem] font-semibold text-white shadow">
                <span className="tm-live-dot h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
                Live
              </span>
            )}
            <span
              className={`absolute right-3 top-3 z-[1] rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold text-white backdrop-blur-sm ${
                shop.category === "Food"
                  ? "bg-amber-500/80"
                  : shop.category === "Boutique"
                    ? "bg-pink-500/80"
                    : shop.category === "Electronics"
                      ? "bg-blue-500/80"
                      : shop.category === "Grocery"
                        ? "bg-emerald-500/80"
                        : shop.category === "Cosmetics"
                          ? "bg-fuchsia-500/80"
                          : "bg-zinc-500/80"
              }`}
            >
              {theme.icon} {shop.category}
            </span>
          </ShopMediaHeader>
          <div className="space-y-2 p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <ShopLogoAvatar shopName={shop.name} logoUrl={shop.logo_url} size="md" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="min-w-0 max-w-full truncate text-base font-bold text-zinc-900 dark:text-zinc-100 sm:text-xl">
                    {shop.name}
                  </h2>
                  <span className={`max-w-full truncate rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold ${theme.badgeClass}`}>
                    {shop.category}
                  </span>
                  {isOwner ? (
                    <button
                      type="button"
                      onClick={() => setProfileEditorOpen(true)}
                      className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-[0.65rem] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
                      </svg>
                      Edit profile
                    </button>
                  ) : null}
                </div>
                <CompactRating
                  average={shop.avg_rating}
                  count={shop.review_count}
                  size="md"
                  className="mt-0.5"
                />
                <div className="flex min-w-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <PinIcon />
                  <span className="truncate">
                    {shop.address_display?.trim() || shop.location || "Location not set"}
                  </span>
                </div>
              </div>
            </div>

            {/* Store hours — shown on storefront visit (not on homepage cards) */}
            {(() => {
              const operatingStatus = openStatusOverride ?? shop.operating_status;
              const hours = getShopHoursSummary({
                business_hours: shop.business_hours,
                operating_status: operatingStatus,
              });
              const hasHours =
                !!(shop.business_hours?.trim() || operatingStatus?.trim());
              const isOpen = hours.state !== "closed";
              return (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-100 bg-gradient-to-r from-emerald-50/80 to-teal-50/80 px-3 py-2 dark:border-teal-900/40 dark:from-emerald-950/30 dark:to-teal-950/20">
                  <ClockIcon />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300">
                      Store hours
                    </p>
                    <p className="text-xs leading-snug text-zinc-700 dark:text-zinc-300">
                      {hasHours ? hours.hoursText : "Hours not set by merchant yet"}
                    </p>
                    {operatingStatus?.trim() &&
                    operatingStatus.trim() !== hours.hoursText ? (
                      <p className="mt-0.5 text-[0.7rem] text-zinc-500 dark:text-zinc-400">
                        {operatingStatus}
                      </p>
                    ) : null}
                  </div>
                  {isOwner ? (
                    <ToggleSwitch
                      checked={isOpen}
                      onChange={(open) => handleToggleOpen(open)}
                      label="Store open or closed"
                      size="sm"
                      visibleLabel={isOpen ? "Open" : "Closed"}
                    />
                  ) : (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${
                        hours.state === "open"
                          ? "bg-emerald-600 text-white"
                          : hours.state === "closed"
                            ? "bg-rose-500 text-white"
                            : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"
                      }`}
                    >
                      {hours.label}
                    </span>
                  )}
                </div>
              );
            })()}

            {shop.store_bio?.trim() ? (
              <div className="rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-zinc-50 to-white px-3.5 py-3 dark:border-zinc-700 dark:from-zinc-900 dark:to-zinc-950">
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  About this store
                </p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {shop.store_bio.trim()}
                </p>
              </div>
            ) : null}
            {((shop.min_order_amount ?? 0) > 0 || (shop.free_delivery_threshold ?? 0) > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {(shop.min_order_amount ?? 0) > 0 && (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[0.65rem] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    Min. order Rs. {shop.min_order_amount!.toLocaleString("en-PK")}
                  </span>
                )}
                {(shop.free_delivery_threshold ?? 0) > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[0.65rem] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Free delivery over Rs. {shop.free_delivery_threshold!.toLocaleString("en-PK")}
                  </span>
                )}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => setShowContactModal(true)} disabled={!shop.whatsapp_number} className={`inline-flex items-center gap-1.5 rounded-full ${theme.buttonClass} px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50`}><WhatsAppIcon />Chat with seller</button>
            </div>

            {isOwner ? (
              <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <p className="mb-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">Manage this store</p>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
                  {manageActions.map((a) =>
                    a.href ? (
                      <Link
                        key={a.id}
                        href={a.href}
                        className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-emerald-950/40"
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded-md ${a.tone}`}>{a.icon}</span>
                        {a.label}
                      </Link>
                    ) : (
                      <button
                        key={a.id}
                        type="button"
                        onClick={a.onClick}
                        className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-emerald-950/40"
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded-md ${a.tone}`}>{a.icon}</span>
                        {a.label}
                      </button>
                    ),
                  )}
                </div>
                <p className="mt-2 text-[0.65rem] text-emerald-800/80 dark:text-emerald-300/80">
                  Tap a product&apos;s three dots to pin, edit or delete it — right here in the store.
                </p>
              </div>
            ) : null}
            {(shop.instagram_handle || shop.tiktok_handle || shop.facebook_url || shop.secondary_phone) && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {shop.instagram_handle && normalizeInstagramHandle(shop.instagram_handle) && (
                  <a
                    href={instagramProfileUrl(shop.instagram_handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 px-3 py-1 text-[0.65rem] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 0 2.5 1.25 1.25 0 0 1 0-2.5M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z" /></svg>
                    @{normalizeInstagramHandle(shop.instagram_handle)}
                  </a>
                )}
                {shop.tiktok_handle && normalizeTikTokHandle(shop.tiktok_handle) && (
                  <a
                    href={tikTokProfileUrl(shop.tiktok_handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1 text-[0.65rem] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .56.04.82.12V9.01a6.27 6.27 0 0 0-.82-.05A6.34 6.34 0 0 0 3.15 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.95a8.2 8.2 0 0 0 4.76 1.52V6.99a4.85 4.85 0 0 1-1-.3z" />
                    </svg>
                    @{normalizeTikTokHandle(shop.tiktok_handle)}
                  </a>
                )}
                {shop.facebook_url && normalizeFacebookUrl(shop.facebook_url) && (
                  <a
                    href={normalizeFacebookUrl(shop.facebook_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-[#1877F2] px-3 py-1 text-[0.65rem] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                    Facebook
                  </a>
                )}
                {shop.secondary_phone && (
                  <a href={`https://wa.me/${shop.secondary_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-700 px-3 py-1 text-[0.65rem] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-zinc-600">
                    <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1.003 1.003 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1.02 1.02 0 0 1-.25 1.02l-2.2 2.2z" /></svg>
                    <span className="truncate">{shop.secondary_phone}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Promo strip — offer + free delivery + coupons in one marquee */}
        {displayPrefs.showAnnouncementBanner && promoBannerSegments.length > 0 && (
          <section className="-mx-3 md:-mx-4">
            <AnnouncementBanner
              segments={promoBannerSegments}
              variant="marquee"
              accentColor={THEME_ACCENT}
              dismissible={false}
            />
          </section>
        )}

        {/* Coupons — owner manage list (above deals); customers see via ticker */}
        {isOwner ? (
          <section id="coupons" aria-label="Manage your coupons" className="space-y-2 scroll-mt-20">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCouponsOpen((v) => !v)}
                className="flex min-w-0 items-center gap-2 text-left"
                aria-expanded={couponsOpen}
              >
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Coupons</h2>
                <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[0.65rem] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  {coupons.length}
                </span>
                <svg
                  className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${couponsOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>

            {couponsOpen ? (
              coupons.length === 0 ? (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">No coupons yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {coupons.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                          {c.code}
                        </p>
                        <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
                          {c.discount_percent != null
                            ? `${c.discount_percent}% off`
                            : `Rs. ${Math.round(c.discount_amount || 0)} off`}
                          {c.expiry_date
                            ? ` · expires ${new Date(c.expiry_date).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCoupon(c.id)}
                        disabled={deletingCouponId === c.id}
                        className="shrink-0 rounded-lg px-2 py-1 text-[0.7rem] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"
                      >
                        {deletingCouponId === c.id ? "Deleting…" : "Delete"}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </section>
        ) : null}

        {/* Deals — owner sees a manage strip (delete/add); customers browse live */}
        {isOwner ? (
          <section id="deals" aria-label="Manage your deals" className="space-y-2 scroll-mt-20">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Your deals</h2>
                <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
                  Tap a deal&apos;s three dots to pin, edit or delete it. Pinned deals show first.
                </p>
              </div>
            </div>
            {ownerDeals.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">No deals yet.</p>
            ) : (
              <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
                {sortedOwnerDeals.map((deal) => (
                  <OwnerDealCard
                    key={deal.id}
                    deal={deal}
                    deleting={deletingDealId === deal.id}
                    onEdit={() => openDealEditor(deal)}
                    onPinToggle={() => handlePinDeal(deal)}
                    onDelete={() => handleDeleteDeal(deal.id)}
                  />
                ))}
              </div>
            )}
          </section>
        ) : liveShopDeals.length > 0 ? (
          <section id="deals" aria-label="Store deals" className="scroll-mt-20">
            {/* Zero-height anchors keep WhatsApp #deal-{id} deep links working. */}
            {liveShopDeals.map((d) => (
              <div key={`deal-anchor-${d.id}`} id={`deal-${d.id}`} className="h-0 overflow-hidden" aria-hidden="true" />
            ))}
            <FeaturedDealsStrip
              deals={liveShopDeals}
              title="Deals"
              seeAllHref="/deals"
              variant="home"
              getOfferTags={() => shopDealOfferTags}
            />
          </section>
        ) : null}

        {/* Category Description */}
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{theme.categoryDescription}</p>
        </div>

        {/* ── Out-of-area soft notice (checkout still hard-blocks) ─────── */}
        {outsideCoverage && (
          <section aria-label="Delivery area notice" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              This store may not deliver to your current location
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
              {outsideCoverage.mode === "city"
                ? `This shop only delivers in ${outsideCoverage.city || "its selected city"}, which doesn't match your location.`
                : outsideCoverage.distanceKm != null
                  ? `You're about ${outsideCoverage.distanceKm.toFixed(1)} km away — this shop delivers within ${outsideCoverage.radiusKm} km.`
                  : "This shop has a limited delivery area."}{" "}
              You can still browse, but checkout may be blocked.
            </p>
          </section>
        )}

        {/* ── SERVICE Section ──────────────────────────────────────── */}
        {isServiceCategory && (
          <section className="space-y-3">
            <AvailabilitySchedule shopId={shop.id} compact showLiveStatus onDataLoaded={setAvailabilityDays} />
            <div className="grid grid-cols-2 gap-2">
              {shop.hourly_rate ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">Hourly Rate</p>
                  <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{formatRupees(shop.hourly_rate)}</p>
                </div>
              ) : null}
              {shop.call_out_charge ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">Call-Out Charge</p>
                  <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{formatRupees(shop.call_out_charge)}</p>
                </div>
              ) : null}
              {shop.service_area ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900 col-span-2">
                  <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">Service Area</p>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{shop.service_area}</p>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={() => setShowBookingModal(true)} disabled={!shop.whatsapp_number} className={`w-full rounded-full ${theme.buttonClass} py-3 text-sm font-bold shadow-md transition-all disabled:opacity-50`}>
              <span className="flex items-center justify-center gap-2"><WhatsAppIcon /> Book via WhatsApp</span>
            </button>
          </section>
        )}

        {/* ── SERVICE: Packages Grid ──────────────────────────────── */}
        {isServiceCategory && servicePackages.length > 0 && (
          <section aria-label="Service Packages">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">📋 Service Packages</h2>
              <span className="text-xs text-zinc-500">{servicePackages.length} package{servicePackages.length !== 1 && "s"}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {servicePackages.map(pkg => (
                <div key={pkg.id} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{pkg.name}</h3>
                    <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[0.65rem] font-bold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">{formatRupees(pkg.price)}</span>
                  </div>
                  {pkg.description && (<p className="mt-1 text-[0.65rem] text-zinc-500 dark:text-zinc-400 line-clamp-2">{pkg.description}</p>)}
                  {pkg.estimated_duration && (<p className="mt-1 inline-flex items-center gap-1 text-[0.6rem] text-zinc-400">⏱ {pkg.estimated_duration}</p>)}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Catalog — retail always; service shops also when they have products */}
        {showProductCatalog && (
          <section className="space-y-3">
            <SubCategoryPills
              mainCategory={shop.category}
              selectedId={activeSubCategoryId}
              onSelect={(id) => setActiveSubCategoryId(id)}
              availableIds={productSubCategoryIds.size > 0 ? productSubCategoryIds : null}
              label="Browse by sub-category"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                <input type="search" placeholder="Search products" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-full border border-zinc-200 bg-white py-2 pl-9 pr-8 text-sm text-zinc-900 placeholder-zinc-300/50 transition-shadow focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" aria-label="Search products" />
                {searchQuery && (<button type="button" onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-xs text-zinc-400 hover:text-zinc-600" aria-label="Clear search">✕</button>)}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <CustomSelect value={priceSort} onChange={(val) => setPriceSort(val as "default" | "low" | "high")} options={[{ value: "default", label: "All Items" }, { value: "low", label: "Price: Low to High" }, { value: "high", label: "Price: High to Low" }]} size="sm" pill fullWidth={false} ariaLabel="Sort products" />
                {priceSort !== "default" && (<button type="button" onClick={() => setPriceSort("default")} className="rounded-full px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" aria-label="Reset sort">✕</button>)}
              </div>
            </div>
          </section>
        )}

        {showProductCatalog && (
          <section id="products" aria-label="Products">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-100"><GridIcon /> Products</h2>
              <span className="text-xs text-zinc-500">{filteredProducts.length} item{filteredProducts.length !== 1 && "s"}</span>
            </div>
            {filteredProducts.length === 0 ? (
              <EmptyState
                title={searchQuery || activeSubCategoryId ? "No products match your filters" : "No products yet"}
                description={searchQuery || activeSubCategoryId ? "Try another sub-category or keyword." : "Check back later."}
              />
            ) : (
              <ProductGrid
                products={filteredProducts}
                columns="auto"
                compact={true}
                categoryLabel={shop.category}
                offerContext={productOfferContext}
                onProductClick={isOwner ? ownerEditProduct : handleProductClick}
                onAddToCart={isOwner ? undefined : handleAddToCart}
                onOrder={isOwner ? undefined : handleGridOrder}
                onFavoriteToggle={isOwner ? undefined : handleWishlistToggle}
                onEdit={isOwner ? ownerEditProduct : undefined}
                onPinToggle={isOwner ? handlePinProduct : undefined}
                onDelete={isOwner ? handleDeleteProduct : undefined}
                pinnedIds={pinnedProductIds}
                favorites={wishlistIds}
              />
            )}
          </section>
        )}

        {/* Reviews & Ratings — owner can reply; cannot self-review */}
        <section aria-label="Customer Reviews" className="mt-4">
          <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">Customer Reviews</h2>
          <StoreReviews shopId={shop.id} ownerId={shop.owner_id} />
        </section>
      </>)}

      {/* ── Contact Modal ─────────────────────────────────────────────── */}
      {showContactModal && shop && (
        <ContactModal shopName={shop.name} whatsappNumber={shop.whatsapp_number} shopId={shop.id} onClose={() => setShowContactModal(false)} />
      )}

      {/* ── Quick View Modal (cart-first, no single-item checkout) ────── */}
      {quickViewProduct && shop && (
        <QuickViewModal
          product={quickViewProduct}
          shop={{ id: shop.id, name: shop.name, whatsapp_number: shop.whatsapp_number }}
          onClose={() => setQuickViewProduct(null)}
          isWishlisted={wishlistIds.has(quickViewProduct.id)}
          onWishlistToggle={() => handleWishlistToggle(quickViewProduct)}
          onOrder={(order) => {
            setQuickViewProduct(null);
            handleOrder(order);
          }}
        />
      )}

      {/* ── Direct Order Modal (single product → WhatsApp checkout) ────── */}
      {orderIntent && shop && (
        <ProductOrderModal
          product={orderIntent.product}
          shop={shop}
          variant={orderIntent.variant}
          quantity={orderIntent.quantity}
          notes={orderIntent.notes}
          onClose={() => setOrderIntent(null)}
          onOrderPlaced={() => setOrderIntent(null)}
        />
      )}

      {/* ── Owner profile editor ─────────────────────────────────── */}
      {profileEditorOpen && shop && (
        <ShopProfileEditorModal
          shop={shop}
          onClose={() => setProfileEditorOpen(false)}
          onSaved={() => {
            setProfileEditorOpen(false);
            queryClient.invalidateQueries({ queryKey: ["shop-detail", id] });
          }}
        />
      )}

      {/* ── Owner inline product editor (add + edit) ─────────────────── */}
      {editorOpen && shop && (
        <ProductEditorModal
          shopId={shop.id}
          shopCategory={shop.category}
          product={editorProduct}
          onClose={closeEditor}
          onSaved={() => {
            closeEditor();
            queryClient.invalidateQueries({ queryKey: ["shop-detail", id] });
          }}
        />
      )}

      {/* ── Owner inline deal editor (edit from 3-dot menu) ──────────── */}
      {dealEditorOpen && dealEditor && (
        <DealEditorModal
          deal={dealEditor}
          onClose={closeDealEditor}
          onSaved={() => {
            closeDealEditor();
            queryClient.invalidateQueries({ queryKey: ["shop-detail", id] });
            queryClient.invalidateQueries({ queryKey: ["deals"] });
          }}
        />
      )}

      {/* ── Service Booking Modal ─────────────────────────────────────── */}
      {showBookingModal && shop && (
        <ServiceBookingModal shop={shop} packages={servicePackages} onClose={() => setShowBookingModal(false)} onBookingPlaced={() => { setShowBookingModal(false); addToast("Booking request sent!", "success"); }} />
      )}

      {/* ── WhatsApp float — gated by merchant Appearance toggle ──────── */}
      {shop?.whatsapp_number &&
        displayPrefs.showWhatsappFloatingButton && (
          <WhatsAppFloatButton phone={shop.whatsapp_number} shopName={shop.name} />
        )}
    </div>
  );
}

// ─── Page Export ─────────────────────────────────────────────────────────────

export default function ShopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (<ErrorBoundary fallback={<ErrorState title="Something crashed" message="An unexpected error occurred." onRetry={() => window.location.reload()} />}><ShopDetailInner id={id} /></ErrorBoundary>);
}