/* -------------------------------------------------------------------------- */
/*  TrendMart — Clean Product Grid with Cart Integration                        */
/*                                                                             */
/*  Features:                                                                  */
/*   - Responsive 2/3/4-column grid                                            */
/*   - Clean product cards with rounded images, proper proportions             */
/*   - Cart integration (add to batch cart) — single-item Buy removed          */
/*   - Only shows discount badges when original_price > price                  */
/*   - Quick-view callback                                                      */
/* -------------------------------------------------------------------------- */

"use client";

import { useState, useCallback, type ReactNode } from "react";
import Image from "next/image";
import { getSafeImageUrl } from "@/services/storageService";
import type { Product } from "@/types";
import { formatPrice, formatRupees, getProductDiscount } from "@/lib/formatters";

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusCartIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function DiscountBadge({ originalPrice, currentPrice }: { originalPrice: number; currentPrice: number }) {
  if (originalPrice <= currentPrice) return null;
  const pct = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[0.65rem] font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400">
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
  favorites?: Set<string>;
  emptyState?: ReactNode;
  columns?: "2" | "3" | "4" | "auto";
  compact?: boolean;
  categoryLabel?: string;
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  compact,
  isFavorite,
  categoryLabel,
  onProductClick,
  onAddToCart,
  onFavoriteToggle,
}: {
  product: Product;
  compact: boolean;
  isFavorite: boolean;
  categoryLabel?: string;
  onProductClick?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  onFavoriteToggle?: (product: Product, nextFavorited: boolean) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const priceLabel = formatPrice(product.price, { currency: (product.currency as "PKR" | "USD" | "EUR" | "GBP" | "INR") || "PKR" });

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
      className="trend-card cursor-pointer overflow-hidden active:scale-[0.98] transition-transform duration-150"
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
      {/* Image area */}
      <div className={`relative product-img-container ${compact ? "aspect-[4/3]" : "aspect-square"}`}>
        {product.image_url && !imgError ? (
          <Image
            src={getSafeImageUrl(product.image_url, "product")}
            alt={product.name}
            fill
            className="product-img transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className={`select-none font-bold text-zinc-300 dark:text-zinc-600 ${compact ? "text-3xl" : "text-4xl"}`}>
              {product.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Category Badge */}
        {categoryLabel && (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-black/45 px-2 py-0.5 text-[0.6rem] font-semibold text-white backdrop-blur-sm">
            {categoryLabel}
          </span>
        )}

        {/* Sold out overlay */}
        {!product.is_available ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <span className="rounded-full bg-zinc-900/80 px-2.5 py-0.5 text-[0.65rem] font-semibold text-white">
              Sold Out
            </span>
          </div>
        ) : (
          <span className="absolute bottom-1.5 left-1.5 z-10 flex items-center gap-1 rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[0.6rem] font-semibold text-white backdrop-blur-sm">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
            In Stock
          </span>
        )}

        {/* Wishlist button */}
        {onFavoriteToggle && (
          <button
            type="button"
            onClick={handleFavorite}
            className={`absolute right-1.5 top-1.5 z-10 rounded-full p-1.5 backdrop-blur-sm transition-colors ${
              isFavorite
                ? "bg-red-500/90 text-white"
                : "bg-white/80 text-zinc-400 hover:text-red-500 dark:bg-zinc-900/80 dark:text-zinc-400"
            }`}
            aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
          >
            <HeartIcon filled={isFavorite} />
          </button>
        )}
      </div>

      {/* Info area */}
      <div className={`space-y-1 ${compact ? "p-2" : "p-2.5"}`}>
        <h3 className={`line-clamp-2 font-semibold text-zinc-800 dark:text-zinc-200 ${compact ? "text-xs leading-tight" : "text-sm"}`}>
          {product.name}
        </h3>

        {!compact && product.description && (
          <p className="line-clamp-1 text-[0.65rem] text-zinc-400 dark:text-zinc-500">
            {product.description}
          </p>
        )}

        <div className="flex items-center justify-between pt-0.5 gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className={`font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap ${compact ? "text-sm" : "text-base"}`}>
              {priceLabel}
            </span>
            {hasDiscount && originalPrice != null && (
              <>
                <span className={`text-zinc-400 line-through ${compact ? "text-[0.6rem]" : "text-xs"}`}>
                  {formatRupees(originalPrice)}
                </span>
                <DiscountBadge originalPrice={originalPrice} currentPrice={product.price} />
              </>
            )}
          </div>

          {product.is_available && onAddToCart && (
            <button
              type="button"
              onClick={handleAddToCart}
              className={`flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-95 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 ${
                compact ? "px-2 py-1 text-[0.6rem]" : "px-2.5 py-1 text-[0.65rem]"
              }`}
              aria-label={`Add ${product.name} to cart`}
            >
              <PlusCartIcon />
              {compact ? "" : "Add"}
            </button>
          )}

          {product.is_available && !onAddToCart && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
              Available
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard({ compact }: { compact: boolean }) {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className={`bg-zinc-200 dark:bg-zinc-800 ${compact ? "aspect-[4/3]" : "aspect-square"}`} />
      <div className={compact ? "space-y-1.5 p-2" : "space-y-2 p-2.5"}>
        <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
        {!compact && <div className="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />}
        <div className="flex items-center justify-between pt-1">
          <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-7 w-14 rounded-full bg-zinc-200 dark:bg-zinc-800" />
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
  favorites = new Set(),
  emptyState,
  columns = "auto",
  compact = false,
  categoryLabel,
}: ProductGridProps) {
  const gridCols =
    columns === "2"
      ? "grid-cols-2"
      : columns === "3"
        ? "grid-cols-2 md:grid-cols-3"
        : columns === "4"
          ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

  const gap = compact ? "gap-2" : "gap-2.5 sm:gap-3";

  if (loading) {
    return (
      <div className={`grid ${gridCols} ${gap}`}>
        {Array.from({ length: compact ? 6 : 8 }).map((_, i) => (
          <SkeletonCard key={i} compact={compact} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    if (emptyState) return <>{emptyState}</>;
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-500">
          No products to display.
        </p>
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols} ${gap}`}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          compact={compact}
          isFavorite={favorites.has(product.id)}
          categoryLabel={categoryLabel}
          onProductClick={onProductClick}
          onAddToCart={onAddToCart}
          onFavoriteToggle={onFavoriteToggle}
        />
      ))}
    </div>
  );
}