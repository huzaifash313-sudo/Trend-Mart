"use client";

import Link from "next/link";
import ShopMediaHeader, { ShopLogoAvatar } from "@/components/ShopMediaHeader";
import { formatDistance } from "@/services/geoRadiusService";

export interface ShopCardData {
  id: string;
  name: string;
  category: string;
  location: string;
  logo_url?: string | null;
  banner_url?: string | null;
  is_live?: boolean;
  distance_km?: number | null;
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

/**
 * Homepage / discovery shop card — fixed structure so every tile aligns
 * in a 2 / 3 / 4 column grid (banner → meta → pinned CTA).
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
  const distance =
    showDistance && shop.distance_km != null
      ? formatDistance(shop.distance_km)
      : null;

  return (
    <article className="trend-card group flex h-full min-h-[17.5rem] flex-col overflow-hidden sm:min-h-[18.5rem]">
      {/* ── Uniform banner slot ───────────────────────────────────────── */}
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
          {shop.is_live ? (
            <span className="absolute left-2 top-2 z-[1] inline-flex items-center gap-1 rounded-md bg-white/95 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide text-emerald-700 shadow-sm dark:bg-zinc-900/90 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              LIVE
            </span>
          ) : null}
          {distance ? (
            <span className="absolute right-2 top-2 z-[1] rounded-md bg-zinc-900/75 px-1.5 py-0.5 text-[0.6rem] font-medium text-white backdrop-blur-sm">
              {distance}
            </span>
          ) : null}
        </ShopMediaHeader>
      </Link>

      {/* ── Body: grows; CTA stays pinned to the bottom ───────────────── */}
      <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 pt-2.5 sm:px-3 sm:pb-3 sm:pt-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Link href={href} className="mt-0.5 shrink-0 focus:outline-none" tabIndex={-1}>
            <ShopLogoAvatar
              shopName={shop.name}
              logoUrl={shop.logo_url}
              logoBroken={logoBroken}
              onLogoError={onLogoError}
              size="sm"
            />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1">
              {/* Reserve ~2 lines so short names don't shift the CTA */}
              <Link
                href={href}
                title={shop.name}
                className="tm-title-clamp-2 min-h-[2.375rem] min-w-0 flex-1 text-[0.8125rem] font-semibold leading-snug text-zinc-900 hover:text-emerald-700 sm:min-h-[2.5rem] sm:text-sm dark:text-zinc-50 dark:hover:text-emerald-400"
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
                  className={`icon-only -mr-0.5 -mt-0.5 shrink-0 rounded-full p-1.5 transition-colors ${
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

            <p
              className="tm-title-ellipsis mt-1 text-[0.6875rem] font-medium leading-none text-zinc-500 dark:text-zinc-400"
              title={shop.category}
            >
              {shop.category || "Store"}
            </p>
          </div>
        </div>

        <p
          className="mt-2 inline-flex min-h-[1.125rem] min-w-0 items-center gap-1 text-[0.6875rem] leading-none text-zinc-500 dark:text-zinc-400"
          title={shop.location}
        >
          <PinIcon />
          <span className="tm-title-ellipsis">
            {shop.location?.trim() ? shop.location : "Location not set"}
          </span>
        </p>

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
