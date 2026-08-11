/* -------------------------------------------------------------------------- */
/*  TrendMart — Clean Product Grid with Cart Integration                        */
/* -------------------------------------------------------------------------- */

"use client";

import { useState, useCallback, type ReactNode } from "react";
import Image from "next/image";
import { getSafeImageUrl } from "@/services/storageService";
import type { Product } from "@/types";
import { formatPrice, formatRupees, getProductDiscount } from "@/lib/formatters";
import CompactRating from "@/components/CompactRating";

// ─── Icons ────────────────────────────────────────────────────────────────────

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

function DiscountBadge({ originalPrice, currentPrice }: { originalPrice: number; currentPrice: number }) {
  if (originalPrice <= currentPrice) return null;
  const pct = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  return (
    <span className="inline-flex items-center rounded px-1 py-px text-[10px] font-bold leading-none text-rose-600 dark:text-rose-400">
      -{pct}%
    </span>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductGridProps {
  products: Product[];
  loading?: boolean;
  onProductClick?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  onFavoriteToggle?: (product: Product, nextFavorited: boolean) => void;
  /** When set, shows store name under the title (marketplace feed). */
  onShopClick?: (product: Product) => void;
  favorites?: Set<string>;
  emptyState?: ReactNode;
  columns?: "2" | "3" | "4" | "auto";
  compact?: boolean;
  categoryLabel?: string;
  /** Show joined shop_name / shop_logo on each card */
  showShopMeta?: boolean;
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  compact,
  isFavorite,
  categoryLabel,
  showShopMeta,
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

  const { hasDiscount, originalPrice } = getProductDiscount(product);

  return (
    <article
      onClick={handleCardClick}
      className="tm-product-card group flex h-full cursor-pointer flex-col overflow-hidden"
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
      {/* Fixed-ratio media — keeps every card aligned */}
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
          <span className="absolute left-1.5 top-1.5 z-10 max-w-[72%] truncate rounded bg-zinc-900/70 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
            {categoryLabel}
          </span>
        ) : null}

        {!product.is_available ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/45">
            <span className="rounded bg-zinc-900/85 px-2 py-0.5 text-[10px] font-semibold text-white">
              Sold Out
            </span>
          </div>
        ) : (
          <span className="absolute bottom-1.5 left-1.5 z-10 text-[10px] font-semibold leading-none text-emerald-700 dark:text-emerald-300">
            In stock
          </span>
        )}

        {onFavoriteToggle ? (
          <button
            type="button"
            onClick={handleFavorite}
            className={`absolute right-1.5 top-1.5 z-10 p-0.5 transition-colors ${
              isFavorite
                ? "text-rose-500"
                : "text-zinc-400 hover:text-rose-500 dark:text-zinc-500"
            }`}
            aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
          >
            <HeartIcon filled={isFavorite} />
          </button>
        ) : null}
      </div>

      {/* Body — equal height footer across the row */}
      <div className="tm-product-body flex min-h-0 flex-1 flex-col">
        <h3
          className={`tm-product-title ${compact ? "text-[12px] sm:text-[13px]" : "text-[13px] sm:text-sm"}`}
          title={product.name}
        >
          {product.name}
        </h3>

        {showShopMeta && product.shop_name ? (
          <div className="mt-0.5 min-w-0 space-y-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onShopClick?.(product);
              }}
              className="flex max-w-full items-center gap-1 text-left"
              aria-label={`View store ${product.shop_name}`}
            >
              {product.shop_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getSafeImageUrl(product.shop_logo_url, "shop")}
                  alt=""
                  className="h-3.5 w-3.5 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[8px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {product.shop_name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate text-[10px] font-medium text-emerald-700 dark:text-emerald-400 sm:text-[11px]">
                {product.shop_name}
              </span>
            </button>
            <CompactRating
              average={product.shop_avg_rating}
              count={product.shop_review_count}
              size="xs"
            />
          </div>
        ) : !compact && product.description ? (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400 dark:text-zinc-500">
            {product.description}
          </p>
        ) : null}

        <div className="tm-product-footer mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0 flex-1">
            <p
              className={`truncate font-bold tabular-nums text-zinc-900 dark:text-zinc-50 ${
                compact ? "text-[13px] sm:text-sm" : "text-sm sm:text-[15px]"
              }`}
            >
              {priceLabel}
            </p>
            {hasDiscount && originalPrice != null ? (
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
                <span className="truncate text-[10px] text-zinc-400 line-through tabular-nums sm:text-[11px]">
                  {formatRupees(originalPrice)}
                </span>
                <DiscountBadge originalPrice={originalPrice} currentPrice={product.price} />
              </div>
            ) : (
              /* Reserve one line so cards with/without discount stay equal height */
              <div className="h-[14px]" aria-hidden="true" />
            )}
          </div>

          {product.is_available && onAddToCart ? (
            <button
              type="button"
              onClick={handleAddToCart}
              className="tm-product-add-text shrink-0"
              aria-label={`Add ${product.name} to cart`}
            >
              Add
            </button>
          ) : null}

          {product.is_available && !onAddToCart ? (
            <span className="shrink-0 text-[12px] font-semibold text-teal-700 dark:text-teal-300">
              Available
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="tm-product-card flex h-full flex-col overflow-hidden">
      <div className="tm-product-media animate-pulse bg-teal-50 dark:bg-teal-950/30" />
      <div className="tm-product-body flex flex-1 flex-col">
        <div className="h-8 w-[88%] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="mt-auto flex items-end justify-between pt-2">
          <div className="h-4 w-16 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-3 w-8 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

// ─── Product Grid Component ───────────────────────────────────────────────────

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
}: ProductGridProps) {
  const gridCols =
    columns === "2"
      ? "grid-cols-2"
      : columns === "3"
        ? "grid-cols-2 md:grid-cols-3"
        : columns === "4"
          ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

  const gap = "gap-2.5 sm:gap-3";

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
          priority={index < 8}
          onProductClick={onProductClick}
          onAddToCart={onAddToCart}
          onFavoriteToggle={onFavoriteToggle}
          onShopClick={onShopClick}
        />
      ))}
    </div>
  );
}
