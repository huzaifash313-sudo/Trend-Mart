"use client";

import Link from "next/link";
import ShopMediaHeader, { ShopLogoAvatar } from "@/components/ShopMediaHeader";
import { formatDistance } from "@/services/geoRadiusService";
import { getShopHoursSummary } from "@/lib/shopHours";

export interface ShopCardData {
  id: string;
  name: string;
  category: string;
  location: string;
  logo_url?: string | null;
  banner_url?: string | null;
  is_live?: boolean;
  distance_km?: number | null;
  business_hours?: string | null;
  operating_status?: string | null;
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
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="h-4 w-4"
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
      className="h-3 w-3 shrink-0 opacity-70"
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

function ClockIcon() {
  return (
    <svg
      className="h-3 w-3 shrink-0 opacity-70"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

/**
 * Homepage / discovery shop card —
 * logo · category · wishlist → name → location → hours/open → CTA
 */
export default function ShopCard({
  shop,
  favorited = false,
  showDistance = false,
  bannerBroken = false,
  logoBroken = false,
  onBannerError,
  onLogoError,
  onToggleFavorite,
}: ShopCardProps) {
  const href = `/shop/${shop.id}`;
  const isLive = !!shop.is_live;
  const distance =
    showDistance && shop.distance_km != null
      ? formatDistance(shop.distance_km)
      : null;
  const hours = getShopHoursSummary({
    business_hours: shop.business_hours,
    operating_status: shop.operating_status,
  });

  return (
    <article className="trend-card group flex h-full min-h-[19.5rem] flex-col overflow-hidden sm:min-h-[20.5rem]">
      {/* Banner */}
      <Link
        href={href}
        className="relative block shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
        aria-label={`${shop.name} store banner`}
      >
        <ShopMediaHeader
          shopName={shop.name}
          bannerUrl={shop.banner_url}
          logoUrl={shop.logo_url}
          size="card"
          bannerBroken={bannerBroken}
          logoBroken={logoBroken}
          onBannerError={onBannerError}
          onLogoError={onLogoError}
        >
          <span
            className={`absolute left-2 top-2 z-[1] inline-flex max-w-[55%] items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide shadow-sm ${
              isLive
                ? "bg-white/95 text-emerald-700 dark:bg-zinc-900/90 dark:text-emerald-400"
                : "bg-zinc-900/80 text-zinc-100 dark:bg-zinc-950/85 dark:text-zinc-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                isLive ? "bg-emerald-500" : "bg-zinc-400"
              }`}
              aria-hidden="true"
            />
            <span className="tm-title-ellipsis">{isLive ? "Live" : "Not available"}</span>
          </span>
          {distance ? (
            <span className="absolute right-2 top-2 z-[1] rounded-md bg-zinc-900/75 px-1.5 py-0.5 text-[0.6rem] font-medium text-white backdrop-blur-sm">
              {distance}
            </span>
          ) : null}
        </ShopMediaHeader>
      </Link>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 pt-2.5 sm:px-3 sm:pb-3 sm:pt-3">
        {/* Row: logo | category | wishlist */}
        <div className="flex min-w-0 items-center gap-1.5">
          <Link href={href} className="shrink-0 focus:outline-none" tabIndex={-1}>
            <ShopLogoAvatar
              shopName={shop.name}
              logoUrl={shop.logo_url}
              logoBroken={logoBroken}
              onLogoError={onLogoError}
              size="sm"
            />
          </Link>

          <p
            className="tm-title-ellipsis min-w-0 flex-1 px-0.5 text-center text-[0.6875rem] font-medium leading-none text-zinc-500 dark:text-zinc-400"
            title={shop.category || "Store"}
          >
            {shop.category || "Store"}
          </p>

          {onToggleFavorite ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite();
              }}
              className={`icon-only shrink-0 rounded-full p-1.5 transition-colors ${
                favorited
                  ? "text-rose-500"
                  : "text-zinc-400 hover:text-rose-500 dark:text-zinc-500"
              }`}
              aria-label={favorited ? "Remove from wishlist" : "Add to wishlist"}
            >
              <HeartIcon filled={favorited} />
            </button>
          ) : (
            <span className="inline-block h-8 w-8 shrink-0" aria-hidden="true" />
          )}
        </div>

        {/* Full-width store name */}
        <Link
          href={href}
          title={shop.name}
          className="tm-title-clamp-2 mt-2.5 min-h-[2.5rem] text-[0.9375rem] font-semibold leading-snug tracking-tight text-zinc-900 hover:text-emerald-700 sm:min-h-[2.625rem] sm:text-base dark:text-zinc-50 dark:hover:text-emerald-400"
        >
          {shop.name}
        </Link>

        {/* Location */}
        <p
          className="mt-1.5 inline-flex min-h-[1.125rem] min-w-0 items-center gap-1 text-[0.6875rem] leading-none text-zinc-500 dark:text-zinc-400"
          title={shop.location}
        >
          <PinIcon />
          <span className="tm-title-ellipsis">
            {shop.location?.trim() ? shop.location : "Location not set"}
          </span>
        </p>

        {/* Hours + Open / Closed */}
        <div className="mt-2 flex min-w-0 items-center gap-1.5">
          <p
            className="inline-flex min-w-0 flex-1 items-center gap-1 text-[0.65rem] leading-none text-zinc-500 dark:text-zinc-400"
            title={hours.hoursText}
          >
            <ClockIcon />
            <span className="tm-title-ellipsis">{hours.hoursText}</span>
          </p>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.6rem] font-semibold leading-none ${
              hours.state === "open"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                : hours.state === "closed"
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {hours.label}
          </span>
        </div>

        <div className="mt-auto pt-3">
          <Link
            href={href}
            className="btn-compact inline-flex h-8 w-full items-center justify-center rounded-lg border border-emerald-600/20 bg-emerald-50 text-[0.75rem] font-semibold text-emerald-800 transition-colors hover:bg-emerald-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-600 dark:hover:text-white dark:focus:ring-offset-[color:var(--tm-surface)]"
          >
            View store
          </Link>
        </div>
      </div>
    </article>
  );
}
