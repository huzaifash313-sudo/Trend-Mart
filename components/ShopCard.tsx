"use client";

import { memo } from "react";
import Link from "next/link";
import ShopMediaHeader from "@/components/ShopMediaHeader";
import ShopOfferTicker from "@/components/ShopOfferTicker";
import { formatDistance } from "@/services/geoRadiusService";
import { getShopPath } from "@/lib/shopSlug";
import {
  buildShopOfferSlides,
  type ShopOfferSlide,
} from "@/lib/shopOfferTicker";
import CompactRating, { hasShopRating } from "@/components/CompactRating";
import { useShopReviews } from "@/context/ShopReviewsContext";

export interface ShopCardData {
  id: string;
  name: string;
  slug?: string | null;
  category: string;
  location: string;
  logo_url?: string | null;
  banner_url?: string | null;
  is_live?: boolean;
  verification_status?: "pending" | "approved" | "rejected" | null;
  distance_km?: number | null;
  business_hours?: string | null;
  operating_status?: string | null;
  announcement?: string | null;
  announcement_expires_at?: string | null;
  free_delivery_threshold?: number | null;
  avg_rating?: number | null;
  review_count?: number | null;
  /** Pre-built slides; if omitted, built from deals / free delivery / coupons */
  offerSlides?: ShopOfferSlide[];
  deals?: import("@/lib/dealSchedule").ShopDeal[];
  coupons?: Array<{
    id: string;
    code: string;
    discount_percent?: number | null;
    discount_amount?: number | null;
    expiry_date?: string | null;
    is_active?: boolean;
  }>;
}

interface ShopCardProps {
  shop: ShopCardData;
  favorited?: boolean;
  showDistance?: boolean;
  bannerBroken?: boolean;
  logoBroken?: boolean;
  onBannerError?: () => void;
  onLogoError?: () => void;
  onToggleFavorite?: () => void;
  /** Eager-load banner for above-the-fold cards (smoother first paint). */
  priority?: boolean;
}

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

function PinIcon() {
  return (
    <svg
      className="h-3 w-3 shrink-0 text-teal-700 opacity-80 dark:text-teal-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/**
 * Shop card — logo DP on banner (left); name starts clean from body left.
 * Memoized so a single favorite toggle / broken-image update doesn't re-render
 * the entire shop grid.
 */
function ShopCard({
  shop,
  favorited = false,
  showDistance = false,
  bannerBroken = false,
  logoBroken = false,
  onBannerError,
  onLogoError,
  onToggleFavorite,
  priority = false,
}: ShopCardProps) {
  const href = getShopPath(shop);
  const { openShopReviews } = useShopReviews();
  const isLive = !!shop.is_live;
  const hasRating = hasShopRating(shop.avg_rating, shop.review_count);
  const distance =
    showDistance && shop.distance_km != null
      ? formatDistance(shop.distance_km)
      : null;
  const category = (shop.category || "Store").trim();
  const offerSlides =
    shop.offerSlides ??
    buildShopOfferSlides({
      shopId: shop.id,
      freeDeliveryThreshold: shop.free_delivery_threshold,
      coupons: shop.coupons,
      deals: shop.deals,
    });

  return (
    <article className="shop-card trend-card group flex h-full flex-col overflow-hidden">
      <Link
        href={href}
        className="relative block shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
        aria-label={`${shop.name} store banner`}
      >
        <ShopMediaHeader
          shopName={shop.name}
          bannerUrl={shop.banner_url}
          logoUrl={shop.logo_url}
          size="card"
          logoPlacement="overlay"
          bannerBroken={bannerBroken}
          logoBroken={logoBroken}
          onBannerError={onBannerError}
          onLogoError={onLogoError}
          priority={priority}
        >
          <span
            className={`absolute left-2 top-2 z-[2] inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none shadow-sm ${
              isLive
                ? "bg-white/95 text-emerald-700 dark:bg-zinc-900/95 dark:text-emerald-300"
                : "bg-zinc-900/85 text-zinc-100"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                isLive ? "tm-live-dot bg-emerald-500" : "bg-zinc-400"
              }`}
              aria-hidden="true"
            />
            {isLive ? "Live" : "Unavailable"}
          </span>
          {distance ? (
            <span className="absolute right-2 top-2 z-[2] rounded-full bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
              {distance}
            </span>
          ) : null}
        </ShopMediaHeader>
      </Link>

      <div className="shop-card-body flex min-h-0 flex-1 flex-col px-1.5 pb-1 pt-1 sm:px-2">
        {/* Name + wishlist — heart stays top-aligned beside the name */}
        <div className="flex items-start gap-0.5">
          <Link
            href={href}
            title={shop.name}
            className="tm-shop-name line-clamp-2 min-w-0 flex-1 break-words text-[12.5px] font-bold leading-tight tracking-tight text-zinc-900 transition-colors duration-200 group-hover:text-emerald-700 sm:text-[13.5px] dark:text-zinc-50 dark:group-hover:text-emerald-300"
          >
            {shop.name}
          </Link>
          {onToggleFavorite ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite();
              }}
              className={`icon-only -mr-0.5 -mt-0.5 shrink-0 rounded-full p-0.5 transition-transform duration-200 hover:scale-110 active:scale-95 ${
                favorited
                  ? "text-rose-500"
                  : "text-zinc-400 hover:text-rose-500 dark:text-zinc-500"
              }`}
              aria-label={favorited ? "Remove from wishlist" : "Add to wishlist"}
            >
              <HeartIcon filled={favorited} />
            </button>
          ) : null}
        </div>

        {/* Reviews — always directly under the name */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openShopReviews({ id: shop.id, name: shop.name });
          }}
          className={`group/rating mt-px flex min-w-0 w-full items-center rounded-md text-left transition-opacity ${
            hasRating ? "hover:opacity-80" : ""
          }`}
          title={
            hasRating
              ? `See ${shop.review_count} review${Number(shop.review_count) === 1 ? "" : "s"} or add yours`
              : "No reviews yet — be the first to rate"
          }
          aria-label={
            hasRating
              ? `View reviews and rating for ${shop.name}`
              : `Add the first review for ${shop.name}`
          }
        >
          <CompactRating average={shop.avg_rating} count={shop.review_count} />
          {!hasRating ? (
            <span className="truncate text-[10.5px] font-medium leading-tight text-zinc-400 dark:text-zinc-500">
              No reviews yet ·{" "}
              <span className="font-semibold text-emerald-600 underline decoration-emerald-600/40 underline-offset-2 transition-colors group-hover/rating:text-emerald-700 dark:text-emerald-400 dark:decoration-emerald-400/40 dark:group-hover/rating:text-emerald-300">
                Add one
              </span>
            </span>
          ) : null}
        </button>

        {offerSlides.length > 0 ? (
          <div className="mt-0.5">
            <ShopOfferTicker slides={offerSlides} />
          </div>
        ) : null}

        <p
          title={category}
          className="tm-title-clamp-2 mt-0.5 text-[10.5px] font-medium leading-snug text-teal-700 dark:text-teal-300 sm:text-[11.5px]"
        >
          {category}
        </p>

        <p
          className="mt-0.5 inline-flex min-w-0 items-center gap-0.5 text-[10.5px] leading-none text-zinc-500 dark:text-zinc-400"
          title={shop.location}
        >
          <PinIcon />
          <span className="tm-title-ellipsis">
            {shop.location?.trim() ? shop.location : "Location not set"}
          </span>
        </p>

        <div className="mt-auto pt-1">
          <Link href={href} className="tm-cta btn-compact h-7 w-full text-[11.5px] sm:h-8 sm:text-[12.5px]">
            View store
          </Link>
        </div>
      </div>
    </article>
  );
}

export default memo(ShopCard);
