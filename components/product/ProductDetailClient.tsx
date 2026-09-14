"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Shared product detail UI (`/p/[code]` & `/products/[slug]`)    */
/* -------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MarketplaceProduct, Product, Shop } from "@/types";
import {
  fetchProductByReference,
  fetchRelatedMarketplaceProducts,
  fetchCrossShopRelatedProducts,
  fetchAlsoBoughtProducts,
} from "@/services/productService";
import { fetchShopById } from "@/services/shopService";
import { fetchProductReviewContext, type ProductReviewContext } from "@/services/reviewService";
import { formatRupees, getProductDiscount } from "@/lib/formatters";
import { getProductImages } from "@/lib/productImages";
import { hasPriceTiers, priceForQuantity, tierPreviewLabels } from "@/lib/priceTiers";
import { getSafeImageUrl } from "@/services/storageService";
import { getShopPath } from "@/lib/shopSlug";
import { trackProductView } from "@/lib/behavior";
import { toggleCompare, isInCompare, resolveCompareCategoryKey } from "@/lib/compare";
import BuyerProtectionStrip from "@/components/BuyerProtectionStrip";
import FlashCountdown from "@/components/FlashCountdown";
import { useLocale } from "@/context/LocaleContext";
import { getProductSeoPath } from "@/lib/seo/productSlug";
import { buildProductImageAlt } from "@/lib/seo/imageAlt";
import ProductOrderModal from "@/components/ProductOrderModal";
import ProductRatingModal from "@/components/ProductRatingModal";
import ProductReviews from "@/components/ProductReviews";
import RelatedItemsRail, { type RelatedRailItem } from "@/components/RelatedItemsRail";
import VariantSelector, { type SelectedVariant } from "@/components/VariantSelector";
import { computeVariantPricing, customerVariantGroups } from "@/lib/variantPricing";
import { isComboUnavailable } from "@/lib/variantMatrix";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/components/Toast";
import { ErrorState } from "@/components/ErrorState";
import { ProductDetailSkeleton } from "@/components/Skeletons";
import CompactRating from "@/components/CompactRating";
import DualImageTilt from "@/components/DualImageTilt";
import { createClient } from "@/lib/supabase/client";

function BackIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function CartPlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
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

function stubShopFromProduct(p: MarketplaceProduct): Shop {
  return {
    id: p.shop_id,
    name: p.shop_name ?? "Shop",
    whatsapp_number: p.shop_whatsapp ?? "",
    location: p.shop_location ?? "",
    category: p.shop_category ?? "",
    logo_url: p.shop_logo_url ?? null,
    latitude: p.shop_latitude ?? null,
    longitude: p.shop_longitude ?? null,
    service_radius_km: p.shop_service_radius_km ?? null,
    delivery_zones: p.shop_delivery_zones ?? null,
    avg_rating: p.shop_avg_rating ?? null,
    review_count: p.shop_review_count ?? null,
    free_delivery_threshold: p.shop_free_delivery_threshold ?? null,
    free_delivery_radius_km: p.shop_free_delivery_radius_km ?? null,
    delivery_fee_flat: p.shop_delivery_fee_flat ?? null,
    delivery_fee_per_km: p.shop_delivery_fee_per_km ?? null,
  } as Shop;
}

export default function ProductDetailClient({ code }: { code: string }) {
  const router = useRouter();
  const { addItem, items: cartItems, updateQuantity, removeItem } = useCart();
  const { addToast } = useToast();

  const [product, setProduct] = useState<MarketplaceProduct | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [broken, setBroken] = useState<Set<number>>(() => new Set());
  const [selectedVariants, setSelectedVariants] = useState<SelectedVariant[]>([]);
  const [itemNotes, setItemNotes] = useState("");
  const [added, setAdded] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingCtx, setRatingCtx] = useState<ProductReviewContext | null>(null);
  const [reviewsRefreshKey, setReviewsRefreshKey] = useState(0);
  const [fromShop, setFromShop] = useState<RelatedRailItem[]>([]);
  const [relatedOther, setRelatedOther] = useState<RelatedRailItem[]>([]);
  const [alsoBought, setAlsoBought] = useState<RelatedRailItem[]>([]);
  const [inCompare, setInCompare] = useState(false);
  const { t } = useLocale();
  /** Light dual-photo tilt (client-only) when merchant has 2+ images */
  const [tiltMode, setTiltMode] = useState(false);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProduct(null);
    setShop(null);
    setFromShop([]);
    setRelatedOther([]);
    setAlsoBought([]);
    setActiveIndex(0);
    setBroken(new Set());
    setSelectedVariants([]);
    setItemNotes("");
    setQuantity(1);
    setAdded(false);
    setRatingOpen(false);
    setRatingCtx(null);
    setTiltMode(false);

    (async () => {
      const res = await fetchProductByReference(code);
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setLoading(false);
        return;
      }
      if (!res.data) {
        setError("This product could not be found. It may have been removed or the link is incorrect.");
        setLoading(false);
        return;
      }
      setProduct(res.data);
      setInCompare(isInCompare(res.data.id));
      trackProductView({
        id: res.data.id,
        name: res.data.name,
        price: res.data.price,
        imageUrl: res.data.image_url,
        shopId: res.data.shop_id,
        shopName: res.data.shop_name,
        category: res.data.shop_category ?? res.data.category_id,
      });
      void fetchProductReviewContext(res.data.id).then((ctx) => {
        if (!cancelled) setRatingCtx(ctx);
      });

      const toRail = (p: MarketplaceProduct): RelatedRailItem => ({
        id: p.id,
        href: getProductSeoPath(p.name, p.short_code, p.id),
        title: p.name,
        price: p.price,
        originalPrice: p.original_price ?? p.compare_at_price ?? null,
        imageUrl: p.image_url,
        shopName: p.shop_name,
      });

      void Promise.all([
        fetchRelatedMarketplaceProducts({
          shopId: res.data.shop_id,
          excludeId: res.data.id,
          categoryId: res.data.category_id,
          subCategoryId: res.data.sub_category_id,
          limit: 8,
        }),
        fetchCrossShopRelatedProducts({
          excludeShopId: res.data.shop_id,
          excludeId: res.data.id,
          categoryId: res.data.category_id,
          subCategoryId: res.data.sub_category_id,
          shopCategory: res.data.shop_category,
          seedName: res.data.name,
          limit: 10,
        }),
        fetchAlsoBoughtProducts({
          excludeId: res.data.id,
          excludeShopId: res.data.shop_id,
          categoryId: res.data.category_id,
          subCategoryId: res.data.sub_category_id,
          shopCategory: res.data.shop_category,
          seedName: res.data.name,
          limit: 8,
        }),
      ]).then(([sameShop, otherShops, bought]) => {
        if (cancelled) return;
        if (sameShop.success) setFromShop(sameShop.data.map(toRail));
        if (otherShops.success) setRelatedOther(otherShops.data.map(toRail));
        if (bought.success) setAlsoBought(bought.data.map(toRail));
      });

      const shopRes = await fetchShopById(res.data.shop_id);
      if (cancelled) return;
      if (shopRes.success && shopRes.data.shop) {
        setShop({
          ...shopRes.data.shop,
          whatsapp_number: shopRes.data.shop.whatsapp_number || res.data.shop_whatsapp || "",
          name: shopRes.data.shop.name || res.data.shop_name || "",
        });
      } else {
        setShop(stubShopFromProduct(res.data));
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  /** Re-check eligibility when the user signs in/out while the page is open,
   *  so the "Rate this product" button appears/disappears without a reload. */
  useEffect(() => {
    if (!product?.id) return;
    let cancelled = false;
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (!product?.id) return;
      void fetchProductReviewContext(product.id).then((ctx) => {
        if (!cancelled) setRatingCtx(ctx);
      });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [product?.id]);

  /** After a successful rating: refresh the shown stars/count + context. */
  const handleRated = useCallback(() => {
    setRatingOpen(false);
    setReviewsRefreshKey((k) => k + 1);
    if (!product) return;
    void fetchProductReviewContext(product.id).then(setRatingCtx);
    // Reload product meta so avg_rating / review_count on this page update.
    void fetchProductByReference(code).then((res) => {
      if (res.success && res.data) setProduct(res.data);
    });
  }, [code, product]);

  const images = useMemo(() => getProductImages(product), [product]);
  const safeIndex = images.length ? Math.min(activeIndex, images.length - 1) : 0;
  const productLocation =
    shop?.location?.trim() || product?.shop_location?.trim() || null;

  const customerGroups = useMemo(
    () => customerVariantGroups(product?.variants),
    [product?.variants],
  );
  const hasVariants = customerGroups.length > 0;
  const variantLabel = useMemo(
    () => selectedVariants.map((v) => `${v.groupName}: ${v.optionLabel}`).join(" · "),
    [selectedVariants],
  );
  const variantPricing = computeVariantPricing(
    product?.price ?? 0,
    product?.original_price ?? product?.compare_at_price ?? null,
    product?.variants ?? null,
    variantLabel,
  );
  const displayPrice = variantPricing.price;
  const comboSoldOut = hasVariants && isComboUnavailable(product?.variants, variantLabel);
  const variantsReady = !hasVariants || selectedVariants.length === customerGroups.length;
  const mixBag = useMemo(
    () => (product ? cartItems.filter((i) => i.productId === product.id) : []),
    [cartItems, product],
  );
  const tiersActive = product ? hasPriceTiers(product.price_tiers) : false;
  const tierLabels = useMemo(
    () => (tiersActive && product ? tierPreviewLabels(product.price_tiers) : []),
    [tiersActive, product],
  );
  const lineTotal = tiersActive && product
    ? priceForQuantity(product.price, product.price_tiers, quantity)
    : Math.round(displayPrice * quantity);

  const discount = product
    ? getProductDiscount({
        price: displayPrice,
        original_price: variantPricing.originalPrice,
        compare_at_price: null,
        deal_expires_at: product.deal_expires_at,
      })
    : null;
  const showDiscount = discount?.hasDiscount && discount.originalPrice != null;
  const discountHasDiscount = discount?.hasDiscount ?? false;
  const discountOriginalPrice = discount?.originalPrice ?? null;

  const cartItem = useMemo<Product | null>(() => {
    if (!product) return null;
    const variantOriginal = discountHasDiscount ? discountOriginalPrice : null;
    return displayPrice !== product.price ||
      variantOriginal !== (product.original_price ?? null) ||
      !tiersActive
      ? {
          ...product,
          price: displayPrice,
          original_price: variantOriginal,
          price_tiers: tiersActive ? product.price_tiers : null,
        }
      : product;
  }, [product, displayPrice, tiersActive, discountHasDiscount, discountOriginalPrice]);

  const handleAddToCart = useCallback(() => {
    if (!product || !shop || !cartItem) return;
    if (!variantsReady) {
      addToast("Pehle options choose karo.", "error");
      return;
    }
    if (comboSoldOut) {
      addToast("Yeh option sold out hai.", "error");
      return;
    }
    addItem(cartItem, shop, quantity, variantLabel || undefined, itemNotes.trim() || undefined);
    setAdded(true);
    addToast(
      hasVariants
        ? `"${variantLabel || product.name}" bag mein. Doosra flavour Add se mix karo.`
        : `"${product.name}" added to cart`,
      "success",
    );
    setTimeout(() => setAdded(false), 2000);
  }, [product, shop, variantsReady, comboSoldOut, cartItem, quantity, variantLabel, itemNotes, addItem, addToast, hasVariants]);

  const handleOrder = useCallback(() => {
    if (!product || !shop || !cartItem) return;
    const currentOk = variantsReady && !comboSoldOut;
    if (mixBag.length === 0 && !currentOk) {
      if (!variantsReady) addToast("Pehle options choose karo.", "error");
      else addToast("Yeh option sold out hai.", "error");
      return;
    }
    if (!shop.whatsapp_number) {
      addToast("This store has no WhatsApp number yet — please contact them directly.", "info");
      return;
    }
    const alreadyInBag = mixBag.some((i) => (i.variant || "") === (variantLabel || ""));
    if (currentOk && (mixBag.length === 0 || (hasVariants && !alreadyInBag))) {
      addItem(cartItem, shop, quantity, variantLabel || undefined, itemNotes.trim() || undefined);
    }
    setOrderOpen(true);
  }, [product, shop, variantsReady, comboSoldOut, addToast, mixBag, addItem, cartItem, quantity, variantLabel, itemNotes, hasVariants]);

  const scrollToSlide = useCallback((index: number) => {
    const el = galleryRef.current;
    if (!el) {
      setActiveIndex(index);
      return;
    }
    const width = el.clientWidth || 1;
    el.scrollTo({ left: index * width, behavior: "smooth" });
    setActiveIndex(index);
  }, []);

  const onGalleryScroll = useCallback(() => {
    const el = galleryRef.current;
    if (!el) return;
    const width = el.clientWidth || 1;
    const next = Math.round(el.scrollLeft / width);
    setActiveIndex((prev) => (prev === next ? prev : next));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-5 md:px-4">
        <ProductDetailSkeleton />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-10 md:px-4">
        <ErrorState
          title="Product unavailable"
          message={error ?? "This product could not be found."}
          onRetry={() => window.location.reload()}
        />
        <div className="mt-6 text-center">
          <Link href="/products" className="text-sm font-semibold text-emerald-600 hover:text-emerald-700">
            Browse all products →
          </Link>
        </div>
      </div>
    );
  }

  const shopHref = getShopPath({
    id: shop?.id ?? product.shop_id,
    name: shop?.name ?? product.shop_name ?? "Shop",
    slug: shop?.slug,
  });

  const gallery = images.length > 0 ? images : [null];
  const canTilt = images.length >= 2 && Boolean(images[0]) && Boolean(images[1]);

  return (
    <div className="mx-auto w-full max-w-6xl pb-8 md:px-4 md:pt-3">
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-8 lg:gap-10">
        {/* ── Gallery ─────────────────────────────────────────────────── */}
        <div className="md:sticky md:top-20">
          <div className="relative overflow-hidden bg-zinc-100 dark:bg-zinc-900 md:rounded-2xl md:ring-1 md:ring-zinc-200/80 dark:md:ring-zinc-800">
            {tiltMode && canTilt ? (
              <DualImageTilt
                frontUrl={images[0]!}
                backUrl={images[1]!}
                alt={buildProductImageAlt(product.name, {
                  location: productLocation,
                  index: 0,
                  total: images.length,
                })}
                className="aspect-square w-full md:aspect-[4/3]"
              />
            ) : (
              <div
                ref={galleryRef}
                onScroll={onGalleryScroll}
                className="flex aspect-square snap-x snap-mandatory overflow-x-auto scroll-smooth md:aspect-[4/3] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {gallery.map((url, i) => (
                  <div
                    key={`${product.id}-slide-${i}`}
                    className="relative h-full w-full min-w-full shrink-0 snap-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800"
                  >
                    {url && !broken.has(i) ? (
                      <Image
                        src={getSafeImageUrl(url, "product")}
                        alt={buildProductImageAlt(product.name, {
                          location: productLocation,
                          index: i,
                          total: gallery.length,
                        })}
                        fill
                        priority={i === 0}
                        unoptimized
                        className="object-contain"
                        sizes="(max-width: 768px) 100vw, 50vw"
                        onError={() => setBroken((prev) => new Set(prev).add(i))}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-5xl text-zinc-300 dark:text-zinc-600">
                          {product.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) router.back();
                else router.push("/products");
              }}
              className="absolute left-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-zinc-800 shadow-md backdrop-blur-sm transition hover:bg-white dark:bg-zinc-900/90 dark:text-zinc-100"
              aria-label="Go back"
            >
              <BackIcon />
            </button>

            {canTilt ? (
              <button
                type="button"
                onClick={() => setTiltMode((v) => !v)}
                className={`absolute right-3 top-14 z-20 rounded-full px-3 py-1.5 text-[11px] font-bold shadow-lg ring-1 backdrop-blur-sm transition ${
                  tiltMode
                    ? "bg-emerald-600 text-white ring-emerald-400"
                    : "bg-white text-emerald-800 ring-emerald-200 dark:bg-zinc-900 dark:text-emerald-300 dark:ring-emerald-800"
                }`}
                aria-pressed={tiltMode}
                aria-label={tiltMode ? "Exit tilt view" : "Open light 3D tilt"}
              >
                {tiltMode ? "✕ Close 3D" : "✨ 3D tilt"}
              </button>
            ) : null}

            {showDiscount && discount?.discountPercent != null ? (
              <span className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1">
                <span className="rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                  {discount.discountPercent}% OFF
                </span>
                <FlashCountdown endsAt={product.deal_expires_at} />
              </span>
            ) : product.deal_expires_at ? (
              <span className="absolute right-3 top-3 z-10">
                <FlashCountdown endsAt={product.deal_expires_at} />
              </span>
            ) : null}
          </div>

          {images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-b border-zinc-100 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950 md:mt-3 md:rounded-xl md:border md:border-zinc-100 md:px-2.5 dark:md:border-zinc-800">
              {images.map((url, i) => (
                <button
                  key={`thumb-${url}-${i}`}
                  type="button"
                  onClick={() => {
                    setTiltMode(false);
                    scrollToSlide(i);
                  }}
                  aria-label={buildProductImageAlt(product.name, {
                    location: productLocation,
                    index: i,
                    total: images.length,
                  })}
                  className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                    i === safeIndex
                      ? "border-emerald-500"
                      : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getSafeImageUrl(url, "product")}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover bg-zinc-50 dark:bg-zinc-800"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* ── Details ───────────────────────────────────────────────────── */}
        <div className="space-y-2.5 px-3 pt-2.5 md:px-0 md:pt-1">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 flex-1 text-[1.15rem] font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50">
              {product.name}
            </h1>
            <Link
              href={shopHref}
              className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              {t("common.visitShop")}
            </Link>
            <button
              type="button"
              onClick={() => {
                const res = toggleCompare({
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  originalPrice: product.original_price,
                  imageUrl: product.image_url,
                  shopId: product.shop_id,
                  shopName: product.shop_name,
                  avgRating: product.avg_rating,
                  reviewCount: product.review_count,
                  category: product.shop_category ?? product.category_id,
                  categoryKey: resolveCompareCategoryKey({
                    categoryId: product.category_id,
                    subCategoryId: product.sub_category_id,
                    shopCategory: product.shop_category,
                    category: product.category_id,
                  }),
                  href: getProductSeoPath(product.name, product.short_code, product.id),
                });
                if (!res.ok) {
                  const err = res.error || "";
                  addToast(
                    err.includes("same category")
                      ? t("compare.sameCategory")
                      : err.includes("max")
                        ? t("compare.full")
                        : err || t("compare.full"),
                    "info",
                  );
                  return;
                }
                setInCompare(res.items.some((x) => x.id === product.id));
                addToast(
                  res.items.some((x) => x.id === product.id)
                    ? t("compare.added")
                    : t("compare.removed"),
                  "success",
                );
              }}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                inCompare
                  ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              }`}
            >
              {inCompare ? t("compare.remove") : t("compare.add")}
            </button>
          </div>

          <div className="mt-1.5 space-y-1">
            <button
              type="button"
              onClick={() => {
                document.getElementById("product-reviews")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              className="text-left"
            >
              <CompactRating
                average={Number(product.avg_rating) > 0 ? product.avg_rating : null}
                count={Number(product.review_count) > 0 ? product.review_count : 0}
                size="sm"
              />
            </button>
            {!(Number(product.review_count) > 0) && Number(product.shop_avg_rating) > 0 ? (
              <p className="text-[0.65rem] text-zinc-400">
                Store {Number(product.shop_avg_rating).toFixed(1)}★ · no product reviews yet
              </p>
            ) : null}
            <Link
              href={shopHref}
              className="block min-w-0 max-w-full truncate text-[11px] font-medium leading-snug text-emerald-700 hover:underline dark:text-emerald-400"
            >
              {shop?.name ?? product.shop_name ?? "Store"}
              {productLocation ? ` · ${productLocation}` : ""}
            </Link>
          </div>

          {ratingCtx?.signedIn && !ratingCtx.isOwner && ratingCtx.canSubmit ? (
            <button
              type="button"
              onClick={() => setRatingOpen(true)}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100 active:scale-95 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800/60"
            >
              Write a review
            </button>
          ) : ratingCtx?.signedIn && !ratingCtx.isOwner && ratingCtx.alreadyReviewed ? (
            <p className="mt-1 text-[0.65rem] font-medium text-emerald-700 dark:text-emerald-400">
              You rated this product
            </p>
          ) : ratingCtx?.signedIn && !ratingCtx.isOwner ? (
            <p className="mt-1 text-[0.65rem] text-zinc-400">
              Rate after delivery
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="whitespace-nowrap text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatRupees(lineTotal)}
          </span>
          {quantity > 1 ? (
            <span className="text-xs text-zinc-400">
              ({formatRupees(Math.round(lineTotal / quantity))} each)
            </span>
          ) : null}
          {showDiscount && discount?.originalPrice != null ? (
            <>
              <span className="whitespace-nowrap text-sm text-zinc-400 line-through tabular-nums">
                {formatRupees(discount.originalPrice * quantity)}
              </span>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">
                Save {formatRupees(discount.originalPrice * quantity - lineTotal)}
              </span>
            </>
          ) : null}
        </div>

        {product.description ? (
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {product.description}
          </p>
        ) : null}

        {tierLabels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tierLabels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
              >
                {label}
              </span>
            ))}
            <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-400 dark:bg-zinc-800">
              bulk price
            </span>
          </div>
        ) : null}

        {mixBag.length > 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <p className="mb-1.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
              Your mix ({mixBag.reduce((n, i) => n + i.quantity, 0)} items)
            </p>
            {mixBag.map((line) => (
              <div key={line.id} className="flex items-center gap-2 py-0.5">
                <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
                  {line.variant || line.name}
                </p>
                <button type="button" className="h-6 w-6 rounded-full border text-xs" onClick={() => updateQuantity(line.id, line.quantity - 1)}>−</button>
                <span className="w-4 text-center text-[11px] font-bold">{line.quantity}</span>
                <button type="button" className="h-6 w-6 rounded-full border text-xs" onClick={() => updateQuantity(line.id, line.quantity + 1)}>+</button>
                <button type="button" className="text-[10px] font-semibold text-red-500" onClick={() => removeItem(line.id)}>Remove</button>
              </div>
            ))}
          </div>
        ) : null}

        {hasVariants && product.variants ? (
          <VariantSelector
            variants={product.variants}
            basePrice={product.price}
            baseOriginalPrice={product.original_price ?? product.compare_at_price ?? null}
            onSelectionChange={setSelectedVariants}
            compact
          />
        ) : null}

        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Special instructions (optional)
          </label>
          <textarea
            value={itemNotes}
            onChange={(e) => setItemNotes(e.target.value.slice(0, 200))}
            rows={2}
            maxLength={200}
            placeholder="Any special instructions"
            className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{t("pdp.quantity")}:</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Decrease quantity"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            <span className="w-8 text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity(Math.min(99, quantity + 1))}
              disabled={quantity >= 99}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Increase quantity"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!product.is_available || !variantsReady || comboSoldOut}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 py-3 text-sm font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
              added
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                : "border-teal-300 text-teal-800 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-950/30"
            }`}
          >
            {added ? <><CheckIcon /> {t("common.done")}</> : <><CartPlusIcon /> {hasVariants ? t("pdp.variants") : t("common.addToCart")}</>}
          </button>
          <button
            type="button"
            onClick={handleOrder}
            disabled={
              !product.is_available ||
              !shop?.whatsapp_number ||
              (mixBag.length === 0 && (!variantsReady || comboSoldOut))
            }
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <WhatsAppIcon /> {t("common.orderNow")}
          </button>
        </div>

        {!product.is_available ? (
          <p className="text-center text-xs font-semibold text-red-500">
            {t("common.outOfStock")}
          </p>
        ) : null}
        {product.is_available && product.accepts_delivery === false ? (
          <p className="text-center text-xs font-semibold text-sky-600 dark:text-sky-400">
            Pickup only — home delivery is paused for this item.
          </p>
        ) : null}

        <p className="pb-1 text-center text-[0.65rem] text-zinc-400 dark:text-zinc-500 md:text-left">
          From{" "}
          <Link href={shopHref} className="font-medium text-zinc-500 hover:underline dark:text-zinc-300">
            {shop?.name ?? product.shop_name}
          </Link>
          {" · "}order via WhatsApp
        </p>
        </div>
      </div>

      <div className="mt-3 space-y-3 px-3 md:mt-4 md:space-y-3.5 md:px-0">
        <BuyerProtectionStrip compact />
        {product ? (
          <ProductReviews
            productId={product.id}
            shopId={product.shop_id}
            productName={product.name}
            avgRating={product.avg_rating}
            reviewCount={product.review_count}
            refreshKey={reviewsRefreshKey}
            onRequestRate={() => setRatingOpen(true)}
            onReviewsChanged={() => {
              setReviewsRefreshKey((k) => k + 1);
              void fetchProductReviewContext(product.id).then(setRatingCtx);
              void fetchProductByReference(code).then((res) => {
                if (res.success && res.data) setProduct(res.data);
              });
            }}
          />
        ) : null}
        <RelatedItemsRail
          title={t("recs.alsoBought")}
          subtitle="Popular nearby picks"
          items={alsoBought}
        />
        <RelatedItemsRail
          title={t("recs.fromShop")}
          subtitle="Same store"
          items={fromShop}
        />
        <RelatedItemsRail
          title={t("recs.similar")}
          subtitle="Similar nearby"
          items={relatedOther}
        />
      </div>

      {ratingOpen && product ? (
        <ProductRatingModal
          productId={product.id}
          shopId={product.shop_id}
          productName={product.name}
          imageUrl={product.image_url}
          shopName={product.shop_name ?? shop?.name}
          onClose={() => setRatingOpen(false)}
          onRated={handleRated}
        />
      ) : null}

      {orderOpen && shop ? (
        <ProductOrderModal
          shop={shop}
          cartLines={mixBag.length > 0 ? mixBag : undefined}
          product={
            mixBag.length > 0
              ? undefined
              : ({
                  ...product,
                  price: displayPrice,
                  original_price: discount?.hasDiscount ? discount.originalPrice : null,
                } as Product)
          }
          variant={variantLabel || undefined}
          quantity={quantity}
          notes={itemNotes.trim() || undefined}
          onClose={() => setOrderOpen(false)}
          onOrderPlaced={() => setOrderOpen(false)}
        />
      ) : null}
    </div>
  );
}
