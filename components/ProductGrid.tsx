/* -------------------------------------------------------------------------- */
/*  TrendsMart — Compact Product Grid                                          */
/* -------------------------------------------------------------------------- */

"use client";

import { useState, useCallback, useMemo, memo, useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import { getSafeImageUrl } from "@/services/storageService";
import type { Product } from "@/types";
import { formatPrice, formatRupees, getProductDiscount } from "@/lib/formatters";
import { buildProductImageAlt } from "@/lib/seo/imageAlt";
import { hasPriceTiers, tierPreviewLabels } from "@/lib/priceTiers";
import CompactRating from "@/components/CompactRating";
import { buildShopTickerTags } from "@/lib/shopOfferLabels";
import KebabMenu, { type KebabMenuItem } from "@/components/KebabMenu";
import VirtualizedGrid from "@/components/VirtualizedGrid";
import { VIRTUALIZE_AFTER } from "@/lib/mobilePerf";

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

function PinSolidIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
    </svg>
  );
}

function EditPencilIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/** Shop-level ticker lines (coupon / deal / delivery) — not product % OFF. */
export interface ProductOfferContext {
  freeDeliveryThreshold?: number | null;
  freeDeliveryRadiusKm?: number | null;
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
    freeDeliveryRadiusKm:
      offerContext?.freeDeliveryRadiusKm ?? product.shop_free_delivery_radius_km,
    deliveryFeeFlat: offerContext?.deliveryFeeFlat ?? product.shop_delivery_fee_flat,
    deliveryFeePerKm: offerContext?.deliveryFeePerKm ?? product.shop_delivery_fee_per_km,
  });
}

/** Dark continuous ticker over product / deal image. Pauses when off-screen. */
export function OfferTickerMarquee({ tags }: { tags: string[] }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setActive(Boolean(entry?.isIntersecting)),
      { rootMargin: "40px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (tags.length === 0) return null;

  const unique = tags.filter((t, i) => tags.indexOf(t) === i);
  const sequence = unique.length === 1 ? [unique[0], unique[0], unique[0]] : unique;
  const track = [...sequence, ...sequence];
  const durationSec = Math.max(12, Math.min(36, track.length * 3.5));

  return (
    <div
      ref={rootRef}
      className="tm-product-offer-strip"
      aria-label={unique.join(", ")}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="tm-product-offer-track"
        style={{
          animationDuration: `${durationSec}s`,
          animationPlayState: active ? "running" : "paused",
        }}
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
  /** Direct "Order" (opens WhatsApp checkout immediately, no cart step). */
  onOrder?: (product: Product) => void;
  onFavoriteToggle?: (product: Product, nextFavorited: boolean) => void;
  /** Merchant "manage" mode — renders a 3-dot menu (pin/edit/delete) instead of Add/Order. */
  onEdit?: (product: Product) => void;
  /** Merchant pin-to-top toggle (renders when manage mode is on). */
  onPinToggle?: (product: Product, nextPinned: boolean) => void;
  /** Merchant delete (renders when manage mode is on). */
  onDelete?: (product: Product) => void;
  /** Set of pinned product ids (for the pin indicator + menu label). */
  pinnedIds?: Set<string>;
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

const ProductCard = memo(function ProductCard({
  product,
  compact,
  isFavorite,
  categoryLabel,
  showShopMeta,
  offerContext,
  priority = false,
  isPinned = false,
  onProductClick,
  onAddToCart,
  onOrder,
  onFavoriteToggle,
  onEdit,
  onPinToggle,
  onDelete,
  onShopClick,
}: {
  product: Product;
  compact: boolean;
  isFavorite: boolean;
  categoryLabel?: string;
  showShopMeta?: boolean;
  offerContext?: ProductOfferContext | null;
  priority?: boolean;
  isPinned?: boolean;
  onProductClick?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  onOrder?: (product: Product) => void;
  onFavoriteToggle?: (product: Product, nextFavorited: boolean) => void;
  onEdit?: (product: Product) => void;
  onPinToggle?: (product: Product, nextPinned: boolean) => void;
  onDelete?: (product: Product) => void;
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

  const handleOrder = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOrder?.(product);
    },
    [product, onOrder],
  );

  const handleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFavoriteToggle?.(product, !isFavorite);
    },
    [product, isFavorite, onFavoriteToggle],
  );

  const manage = Boolean(onEdit || onPinToggle || onDelete);

  const kebabItems = useMemo<KebabMenuItem[]>(() => {
    const items: KebabMenuItem[] = [];
    if (onPinToggle) {
      items.push({
        label: isPinned ? "Unpin from top" : "Pin to top",
        onClick: () => onPinToggle(product, !isPinned),
        icon: (
          <PinSolidIcon
            className={`h-3.5 w-3.5 ${isPinned ? "text-amber-500" : "text-zinc-400"}`}
          />
        ),
      });
    }
    if (onEdit) {
      items.push({ label: "Edit", onClick: () => onEdit(product), icon: <EditPencilIcon /> });
    }
    if (onDelete) {
      items.push({
        label: "Delete",
        onClick: () => onDelete(product),
        destructive: true,
        icon: <TrashIcon />,
      });
    }
    return items;
  }, [onPinToggle, onEdit, onDelete, product, isPinned]);

  const { hasDiscount, originalPrice, discountPercent } = getProductDiscount(product);
  const bulkTierChips = useMemo(
    () => (hasPriceTiers(product.price_tiers) ? tierPreviewLabels(product.price_tiers).slice(0, 2) : []),
    [product.price_tiers],
  );
  const offerTags = useMemo(
    () => buildProductOfferTags(product, offerContext),
    [product, offerContext],
  );
  const imageAlt = buildProductImageAlt(product.name, {
    location: product.shop_location,
  });

  return (
    <article
      id={`product-${product.id}`}
      onClick={(e) => {
        const t = e.target as HTMLElement | null;
        if (t?.closest("button, a, input, textarea, select, label")) return;
        handleCardClick();
      }}
      className={`tm-product-card group flex scroll-mt-24 cursor-pointer flex-col overflow-hidden${
        compact ? " tm-product-card--compact" : ""
      }`}
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
            src={getSafeImageUrl(product.image_url, "product", "card")}
            alt={imageAlt}
            fill
            className="object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            quality={60}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="tm-product-placeholder flex items-center justify-center">
            <span className="select-none text-2xl font-semibold tracking-tight text-teal-700/35 dark:text-teal-300/30 sm:text-3xl">
              {product.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {categoryLabel ? (
          <span className="absolute left-1.5 top-1.5 z-10 max-w-[70%] truncate rounded-md bg-zinc-950/85 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/95 shadow-sm">
            {categoryLabel}
          </span>
        ) : null}

        {hasDiscount && discountPercent > 0 ? (
          <span
            className={`tm-badge-discount absolute z-10 ${
              categoryLabel ? "right-1.5 top-1.5" : "left-1.5 top-1.5"
            }`}
          >
            {discountPercent}% OFF
          </span>
        ) : null}

        <OfferTickerMarquee tags={offerTags} />

        {manage && kebabItems.length > 0 ? (
          <div
            className={`absolute right-1.5 z-30 ${
              offerTags.length > 0 ? "bottom-[1.65rem]" : "bottom-1.5"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <KebabMenu
              items={kebabItems}
              variant="overlay"
              ariaLabel={`Options for ${product.name}`}
            />
          </div>
        ) : null}

        {!product.is_available ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-900/45">
            <span className="rounded bg-zinc-900/85 px-2 py-0.5 text-[10px] font-semibold text-white">
              Sold Out
            </span>
          </div>
        ) : null}
      </div>

      <div className="tm-product-body">
        <h3
          className={`tm-product-title ${
            compact ? "text-[12px] sm:text-[13px]" : "text-[13px] sm:text-sm"
          }`}
          title={product.name}
        >
          {isPinned ? (
            <PinSolidIcon className="mr-0.5 inline-block h-3 w-3 shrink-0 align-[-1px] text-amber-500" />
          ) : null}
          {product.name}
        </h3>

        {showShopMeta && product.shop_name ? (
          <div className="tm-product-shop">
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
              size="xs"
              className="ml-auto shrink-0"
            />
          </div>
        ) : !compact && product.description ? (
          <p className="tm-product-shop line-clamp-1 text-[11px] leading-tight text-zinc-400 dark:text-zinc-500">
            {product.description}
          </p>
        ) : null}

        <div className={`tm-product-footer flex flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
          {/* Price — full width so it never collapses into a vertical stack */}
          <div className="min-w-0">
            <p
              className={`whitespace-nowrap font-bold tabular-nums leading-none tracking-tight text-zinc-900 dark:text-zinc-50 ${
                compact ? "text-[13px] sm:text-sm" : "text-sm sm:text-[15px]"
              }`}
            >
              {priceLabel}
            </p>
            {hasDiscount && originalPrice != null ? (
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
                <span className="whitespace-nowrap text-[10px] leading-none text-zinc-400 line-through tabular-nums sm:text-[11px]">
                  {formatRupees(originalPrice)}
                </span>
                {discountPercent > 0 ? (
                  <span className="whitespace-nowrap rounded bg-rose-50 px-1 py-px text-[9px] font-bold leading-none text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                    {discountPercent}% OFF
                  </span>
                ) : null}
              </div>
            ) : null}
            {bulkTierChips.length > 0 ? (
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
                {bulkTierChips.map((chip) => (
                  <span
                    key={chip}
                    className="whitespace-nowrap rounded bg-teal-50 px-1 py-px text-[9px] font-semibold leading-none text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
                  >
                    {chip}
                  </span>
                ))}
                <span className="whitespace-nowrap text-[9px] leading-none text-zinc-400 dark:text-zinc-500">
                  bulk price
                </span>
              </div>
            ) : null}
          </div>

          {/* Actions — customer row only; owner manage uses the 3-dot menu above */}
          {!manage && (onFavoriteToggle || (product.is_available && (onAddToCart || onOrder))) ? (
            <div className="tm-product-actions">
              {onFavoriteToggle ? (
                <button
                  type="button"
                  onClick={handleFavorite}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                isFavorite
                  ? "text-emerald-600 dark:text-emerald-300"
                  : "text-zinc-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-300"
              }`}
                  aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
                >
                  <HeartIcon filled={isFavorite} />
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2.5">
                {product.is_available && onAddToCart ? (
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    className="tm-product-add-text"
                    aria-label={`Add ${product.name} to cart`}
                  >
                    Add
                  </button>
                ) : null}

                {product.is_available && onOrder ? (
                  <button
                    type="button"
                    onClick={handleOrder}
                    className="text-[12px] font-bold leading-none text-emerald-600 transition-colors hover:text-emerald-700 active:opacity-75 dark:text-emerald-400 dark:hover:text-emerald-300"
                    aria-label={`Order ${product.name} now`}
                  >
                    Order
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
});

function SkeletonCard() {
  return (
    <div className="tm-product-card flex flex-col overflow-hidden">
      <div className="tm-product-media animate-pulse bg-teal-50 dark:bg-teal-950/30" />
      <div className="tm-product-body">
        <div className="h-3.5 w-[88%] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="tm-product-shop">
          <div className="h-3 w-[55%] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
        <div className="tm-product-footer flex flex-col gap-1.5">
          <div className="h-4 w-16 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="flex items-center justify-between border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
            <div className="h-5 w-5 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3 w-16 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
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
  onOrder,
  onFavoriteToggle,
  onEdit,
  onPinToggle,
  onDelete,
  pinnedIds = new Set(),
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
    <VirtualizedGrid
      items={products}
      getKey={(p) => p.id}
      force={products.length > VIRTUALIZE_AFTER}
      estimateRowHeight={compact ? 260 : 320}
      gapClassName={gap}
      columnBreakpoints={
        columns === "2"
          ? { base: 2 }
          : columns === "3"
            ? { base: 2, md: 3 }
            : columns === "4"
              ? { base: 2, md: 3, lg: 4 }
              : { base: 2, md: 3, lg: 4, xl: 5 }
      }
      renderItem={(product, index) => (
        <ProductCard
          product={product}
          compact={compact}
          isFavorite={favorites.has(product.id)}
          isPinned={pinnedIds.has(product.id)}
          categoryLabel={categoryLabel}
          showShopMeta={showShopMeta}
          offerContext={getOfferContext?.(product) ?? offerContext}
          priority={index < 2}
          onProductClick={onProductClick}
          onAddToCart={onAddToCart}
          onOrder={onOrder}
          onFavoriteToggle={onFavoriteToggle}
          onEdit={onEdit}
          onPinToggle={onPinToggle}
          onDelete={onDelete}
          onShopClick={onShopClick}
        />
      )}
    />
  );
}
