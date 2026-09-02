"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Shared product detail UI (`/p/[code]` & `/products/[slug]`)    */
/* -------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MarketplaceProduct, Product, Shop } from "@/types";
import { fetchProductByReference } from "@/services/productService";
import { fetchShopById } from "@/services/shopService";
import { formatRupees, getProductDiscount } from "@/lib/formatters";
import { getProductImages } from "@/lib/productImages";
import { hasPriceTiers, priceForQuantity, tierPreviewLabels } from "@/lib/priceTiers";
import { getSafeImageUrl } from "@/services/storageService";
import { getShopPath } from "@/lib/shopSlug";
import { buildProductImageAlt } from "@/lib/seo/imageAlt";
import ProductOrderModal from "@/components/ProductOrderModal";
import VariantSelector, { type SelectedVariant } from "@/components/VariantSelector";
import { computeVariantPricing } from "@/lib/variantPricing";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/components/Toast";
import { ErrorState } from "@/components/ErrorState";
import { ProductDetailSkeleton } from "@/components/Skeletons";
import CompactRating from "@/components/CompactRating";

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
    delivery_fee_flat: p.shop_delivery_fee_flat ?? null,
    delivery_fee_per_km: p.shop_delivery_fee_per_km ?? null,
  } as Shop;
}

export default function ProductDetailClient({ code }: { code: string }) {
  const router = useRouter();
  const { addItem } = useCart();
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProduct(null);
    setShop(null);
    setActiveIndex(0);
    setBroken(new Set());
    setSelectedVariants([]);
    setItemNotes("");
    setQuantity(1);
    setAdded(false);

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

  const images = useMemo(() => getProductImages(product), [product]);
  const safeIndex = images.length ? Math.min(activeIndex, images.length - 1) : 0;
  const currentUrl = images[safeIndex];
  const productLocation =
    shop?.location?.trim() || product?.shop_location?.trim() || null;

  const imageAltOptions = useMemo(
    () => ({
      location: productLocation,
      index: safeIndex,
      total: images.length,
    }),
    [productLocation, safeIndex, images.length],
  );

  const hasVariants = Boolean(product?.variants && product.variants.length > 0);
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
  const variantsReady = !hasVariants || selectedVariants.length === (product?.variants?.length ?? 0);
  const tiersActive = product
    ? hasPriceTiers(product.price_tiers) && displayPrice === product.price
    : false;
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
      addToast("Please choose the options first.", "error");
      return;
    }
    addItem(cartItem, shop, quantity, variantLabel || undefined, itemNotes.trim() || undefined);
    setAdded(true);
    addToast(`"${product.name}" added to cart`, "success");
    setTimeout(() => setAdded(false), 2000);
  }, [product, shop, variantsReady, cartItem, quantity, variantLabel, itemNotes, addItem, addToast]);

  const handleOrder = useCallback(() => {
    if (!product || !shop) return;
    if (!variantsReady) {
      addToast("Please choose the options first.", "error");
      return;
    }
    if (!shop.whatsapp_number) {
      addToast("This store has no WhatsApp number yet — please contact them directly.", "info");
      return;
    }
    setOrderOpen(true);
  }, [product, shop, variantsReady, addToast]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-lg px-3 py-5">
        <ProductDetailSkeleton />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="mx-auto w-full max-w-lg px-3 py-10">
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
  });
  const mainImageAlt = buildProductImageAlt(product.name, imageAltOptions);

  return (
    <div className="mx-auto w-full max-w-lg px-3 py-3 pb-8">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push("/products");
          }}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <BackIcon /> Back
        </button>
        <Link
          href={shopHref}
          className="truncate text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Visit {shop?.name ?? product.shop_name ?? "store"} →
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="relative aspect-square bg-gradient-to-br from-teal-50 to-zinc-100 dark:from-zinc-800 dark:to-zinc-700">
          {currentUrl && !broken.has(safeIndex) ? (
            <Image
              key={`${product.id}-${safeIndex}`}
              src={getSafeImageUrl(currentUrl, "product")}
              alt={mainImageAlt}
              fill
              priority
              className="object-contain"
              sizes="(max-width: 640px) 100vw, 32rem"
              onError={() => setBroken((prev) => new Set(prev).add(safeIndex))}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-6xl text-zinc-300 dark:text-zinc-600">📦</span>
            </div>
          )}

          {showDiscount && discount?.discountPercent != null && (
            <span className="absolute left-3 top-3 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
              -{discount.discountPercent}% OFF
            </span>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto border-t border-zinc-100 px-3 py-2 scrollbar-none dark:border-zinc-800">
            {images.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={buildProductImageAlt(product.name, {
                  location: productLocation,
                  index: i,
                  total: images.length,
                })}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                  i === safeIndex ? "border-emerald-500" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getSafeImageUrl(url, "product")}
                  alt={buildProductImageAlt(product.name, {
                    location: productLocation,
                    index: i,
                    total: images.length,
                  })}
                  loading="lazy"
                  className="h-full w-full object-contain bg-zinc-50 dark:bg-zinc-800"
                />
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2.5 p-4">
          <div>
            <h1 className="text-lg font-bold leading-snug text-zinc-900 dark:text-zinc-100">
              {product.name}
            </h1>
            <div className="mt-1.5">
              <CompactRating
                average={
                  Number(product.avg_rating) > 0
                    ? product.avg_rating
                    : product.shop_avg_rating
                }
                count={
                  Number(product.review_count) > 0
                    ? product.review_count
                    : product.shop_review_count
                }
                size="sm"
              />
            </div>
            {product.description && (
              <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {product.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatRupees(lineTotal)}
            </span>
            {quantity > 1 && (
              <span className="text-xs text-zinc-400">
                ({formatRupees(Math.round(lineTotal / quantity))} each)
              </span>
            )}
            {showDiscount && discount?.originalPrice != null && (
              <>
                <span className="text-sm text-zinc-400 line-through">
                  {formatRupees(discount.originalPrice * quantity)}
                </span>
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  Save {formatRupees(discount.originalPrice * quantity - lineTotal)}
                </span>
              </>
            )}
          </div>

          {tierLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tierLabels.map((label) => (
                <span key={label} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                  {label}
                </span>
              ))}
              <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-400 dark:bg-zinc-800">
                bulk price
              </span>
            </div>
          )}

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
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Qty:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-label="Decrease quantity"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
              <span className="w-8 text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(Math.min(99, quantity + 1))}
                disabled={quantity >= 99}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
              disabled={!product.is_available || !variantsReady}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                added
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                  : "border-teal-300 text-teal-800 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-950/30"
              }`}
            >
              {added ? <><CheckIcon /> Added</> : <><CartPlusIcon /> Add to Cart</>}
            </button>
            <button
              type="button"
              onClick={handleOrder}
              disabled={!product.is_available || !variantsReady || !shop?.whatsapp_number}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <WhatsAppIcon /> Order
            </button>
          </div>

          {!product.is_available && (
            <p className="text-center text-xs font-semibold text-red-500">
              This item is currently out of stock.
            </p>
          )}

          <p className="text-center text-[0.65rem] text-zinc-400 dark:text-zinc-500">
            From <span className="font-medium text-zinc-500 dark:text-zinc-400">{shop?.name ?? product.shop_name}</span>
            {" · "}order directly via WhatsApp
          </p>
        </div>
      </div>

      {orderOpen && shop && (
        <ProductOrderModal
          product={
            {
              ...product,
              price: displayPrice,
              original_price: discount?.hasDiscount ? discount.originalPrice : null,
            } as Product
          }
          shop={shop}
          variant={variantLabel || undefined}
          quantity={quantity}
          notes={itemNotes.trim() || undefined}
          onClose={() => setOrderOpen(false)}
          onOrderPlaced={() => setOrderOpen(false)}
        />
      )}
    </div>
  );
}
