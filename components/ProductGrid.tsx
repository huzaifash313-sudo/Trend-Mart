/* -------------------------------------------------------------------------- */
/*  TrendMart — Compact Product Grid                                          */
/* -------------------------------------------------------------------------- */

"use client";

import { useState, useCallback, useMemo, type ReactNode } from "react";
import Image from "next/image";
import { getSafeImageUrl } from "@/services/storageService";
import type { Product } from "@/types";
import { formatPrice, formatRupees, getProductDiscount } from "@/lib/formatters";
import CompactRating from "@/components/CompactRating";
import { buildShopTickerTags } from "@/lib/shopOfferLabels";

export { buildDeliveryTickerLabel } from "@/lib/shopOfferLabels";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/** Shop-level ticker lines (coupon / deal / delivery) — not product % OFF. */
export interface ProductOfferContext {
  freeDeliveryThreshold?: number | null;
  deliveryFeeFlat?: number | null;
  deliveryFeePerKm?: number | null;
  /** Prebuilt coupon lines e.g. "Code SAVE10 · 10% OFF" */
  couponLabels?: string[];
  /** Active deal titles for today */
  dealLabels?: string[];
  /** @deprecated unused — kept for call-site compatibility */
  announcement?: string | null;
  announcementExpiresAt?: string | null;
  couponLabel?: string | null;
}

function buildProductOfferTags(
  product: Product,
  offerContext?: ProductOfferContext | null,
): string[] {
  return buildShopTickerTags({
    dealLabels: offerContext?.dealLabels,
    couponLabels: [
      ...(offerContext?.couponLabels ?? []),
      ...(offerContext?.couponLabel ? [offerContext.couponLabel] : []),
    ],
    freeDeliveryThreshold:
      offerContext?.freeDeliveryThreshold ?? product.shop_free_delivery_threshold,
    deliveryFeeFlat: offerContext?.deliveryFeeFlat ?? product.shop_delivery_fee_flat,
    deliveryFeePerKm: offerContext?.deliveryFeePerKm ?? product.shop_delivery_fee_per_km,
  });
}

/** Dark continuous ticker over product / deal image. */
export function OfferTickerMarquee({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  const unique = tags.filter((t, i) => tags.indexOf(t) === i);
  const sequence = unique.length === 1 ? [unique[0], unique[0], unique[0]] : unique;
  const track = [...sequence, ...sequence];
  const durationSec = Math.max(12, Math.min(36, track.length * 3.5));

  return (
    <div
      className="tm-product-offer-strip"
      aria-label={unique.join(", ")}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="tm-product-offer-track"
        style={{ animationDuration: `${durationSec}s` }}
      >
        {track.map((tag, i) => (
          <span key={`${tag}-${i}`} className="tm-product-offer-chip">
            <span className="tm-product-offer-dot" aria-hidden="true" />
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

interface ProductGridProps {
  products: Product[];
  loading?: boolean;
  onProductClick?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  onFavoriteToggle?: (product: Product, nextFavorited: boolean) => void;
  onShopClick?: (product: Product) => void;
  favorites?: Set<string>;
  emptyState?: ReactNode;
  columns?: "2" | "3" | "4" | "auto";
  compact?: boolean;
  categoryLabel?: string;
  showShopMeta?: boolean;
  /** Shop-level offers (store page) — shown as dark tags on product images. */
  offerContext?: ProductOfferContext | null;
  /** Per-product shop context (marketplace feed). */
  getOfferContext?: (product: Product) => ProductOfferContext | null;
}

function ProductCard({
  product,
  compact,
  isFavorite,
  categoryLabel,
  showShopMeta,
  offerContext,
  priority = false,
  onProductClick,
  onAddToCart,
  onFavoriteToggle,
  onShopClick,
}: {
  product: Product;
  compact: boolean;
  isFavorite: boolean;
  categoryLabel?: string;
  showShopMeta?: boolean;
  offerContext?: ProductOfferContext | null;
  priority?: boolean;
  onProductClick?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  onFavoriteToggle?: (product: Product, nextFavorited: boolean) => void;
  onShopClick?: (product: Product) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const priceLabel = formatPrice(product.price, {
    currency: (product.currency as "PKR" | "USD" | "EUR" | "GBP" | "INR") || "PKR",
  });

  const handleCardClick = useCallback(() => {
    onProductClick?.(product);
  }, [product, onProductClick]);

  const handleAddToCart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onAddToCart?.(product);
    },
    [product, onAddToCart],
  );

  const handleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFavoriteToggle?.(product, !isFavorite);
    },
    [product, isFavorite, onFavoriteToggle],
  );

  const { hasDiscount, originalPrice, discountPercent } = getProductDiscount(product);
  const offerTags = useMemo(
    () => buildProductOfferTags(product, offerContext),
    [product, offerContext],
  );

  return (
    <article
      id={`product-${product.id}`}
      onClick={(e) => {
        const t = e.target as HTMLElement | null;
        if (t?.closest("button, a, input, textarea, select, label")) return;
        handleCardClick();
      }}
      className="tm-product-card group flex h-full scroll-mt-24 cursor-pointer flex-col overflow-hidden"
      role="button"
      tabIndex={0}
      aria-label={`View ${product.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <div className="tm-product-media relative shrink-0 overflow-hidden">
        {product.image_url && !imgError ? (
          <Image
            src={getSafeImageUrl(product.image_url, "product")}
            alt={product.name}
            fill
            className="object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            quality={75}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="tm-product-placeholder flex h-full w-full items-center justify-center">
            <span className="select-none text-2xl font-semibold tracking-tight text-teal-700/35 dark:text-teal-300/30 sm:text-3xl">
              {product.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {categoryLabel ? (
          <span className="absolute left-1.5 top-1.5 z-10 max-w-[70%] truncate rounded-md bg-zinc-950/80 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/95 shadow-sm backdrop-blur-[2px]">
            {categoryLabel}
          </span>
        ) : null}

        {hasDiscount && discountPercent > 0 ? (
          <span
            className={`absolute z-10 rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm ${
              categoryLabel ? "right-1.5 top-1.5" : "left-1.5 top-1.5"
            }`}
          >
            {discountPercent}% OFF
          </span>
        ) : null}

        <OfferTickerMarquee tags={offerTags} />

        {!product.is_available ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-900/45">
            <span className="rounded bg-zinc-900/85 px-2 py-0.5 text-[10px] font-semibold text-white">
              Sold Out
            </span>
          </div>
        ) : null}
      </div>

      <div className="tm-product-body flex min-h-0 flex-1 flex-col gap-0.5">
        <h3
          className={`tm-product-title ${
            compact ? "text-[12px] sm:text-[13px]" : "text-[13px] sm:text-sm"
          }`}
          title={product.name}
        >
          {product.name}
        </h3>

        {showShopMeta && product.shop_name ? (
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onShopClick?.(product);
              }}
              className="flex min-w-0 flex-1 items-center gap-1 text-left"
              aria-label={`View store ${product.shop_name}`}
            >
              {product.shop_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getSafeImageUrl(product.shop_logo_url, "shop")}
                  alt=""
                  className="h-3 w-3 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[7px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {product.shop_name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate text-[10px] font-medium leading-none text-emerald-700 dark:text-emerald-400 sm:text-[11px]">
                {product.shop_name}
              </span>
            </button>
            <CompactRating
              average={product.shop_avg_rating}
              count={product.shop_review_count}
              size="xs"
              className="shrink-0"
            />
          </div>
        ) : !compact && product.description ? (
          <p className="line-clamp-1 text-[11px] leading-tight text-zinc-400 dark:text-zinc-500">
            {product.description}
          </p>
        ) : null}

        <div className="tm-product-footer mt-auto flex items-end justify-between gap-1.5 pt-1">
          <div className="min-w-0 flex-1">
            <p
              className={`font-bold tabular-nums leading-none tracking-tight text-zinc-900 dark:text-zinc-50 ${
                compact ? "text-[13px] sm:text-sm" : "text-sm sm:text-[15px]"
              }`}
            >
              {priceLabel}
            </p>
            {hasDiscount && originalPrice != null ? (
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
                <span className="text-[10px] leading-none text-zinc-400 line-through tabular-nums sm:text-[11px]">
                  {formatRupees(originalPrice)}
                </span>
                {discountPercent > 0 ? (
                  <span className="rounded bg-rose-50 px-1 py-px text-[9px] font-bold leading-none text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                    {discountPercent}% OFF
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-0.5 pb-px">
            {onFavoriteToggle ? (
              <button
                type="button"
                onClick={handleFavorite}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  isFavorite
                    ? "text-rose-500"
                    : "text-zinc-400 hover:text-rose-500 dark:text-zinc-500"
                }`}
                aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
              >
                <HeartIcon filled={isFavorite} />
              </button>
            ) : null}

            {product.is_available && onAddToCart ? (
              <button
                type="button"
                onClick={handleAddToCart}
                className="tm-product-add-text shrink-0 px-0.5"
                aria-label={`Add ${product.name} to cart`}
              >
                Add
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="tm-product-card flex h-full flex-col overflow-hidden">
      <div className="tm-product-media animate-pulse bg-teal-50 dark:bg-teal-950/30" />
      <div className="tm-product-body flex flex-col gap-0.5">
        <div className="h-3.5 w-[88%] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-3 w-[55%] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="mt-auto flex items-end justify-between pt-1">
          <div className="h-4 w-14 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-3 w-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

export default function ProductGrid({
  products,
  loading = false,
  onProductClick,
  onAddToCart,
  onFavoriteToggle,
  onShopClick,
  favorites = new Set(),
  emptyState,
  columns = "auto",
  compact = false,
  categoryLabel,
  showShopMeta = false,
  offerContext = null,
  getOfferContext,
}: ProductGridProps) {
  const gridCols =
    columns === "2"
      ? "grid-cols-2"
      : columns === "3"
        ? "grid-cols-2 md:grid-cols-3"
        : columns === "4"
          ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

  const gap = "gap-2 sm:gap-2.5";

  if (loading) {
    return (
      <div className={`grid ${gridCols} ${gap} items-stretch`}>
        {Array.from({ length: compact ? 6 : 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    if (emptyState) return <>{emptyState}</>;
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-500">No products to display.</p>
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols} ${gap} items-stretch`}>
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          compact={compact}
          isFavorite={favorites.has(product.id)}
          categoryLabel={categoryLabel}
          showShopMeta={showShopMeta}
          offerContext={getOfferContext?.(product) ?? offerContext}
          priority={index < 2}
          onProductClick={onProductClick}
          onAddToCart={onAddToCart}
          onFavoriteToggle={onFavoriteToggle}
          onShopClick={onShopClick}
        />
      ))}
    </div>
  );
}
