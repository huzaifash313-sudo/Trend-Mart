"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { getSafeImageUrl } from "@/services/storageService";

type Size = "card" | "hero";
type LogoPlacement = "overlay" | "hidden";

export interface ShopMediaHeaderProps {
  shopName: string;
  bannerUrl?: string | null;
  logoUrl?: string | null;
  size?: Size;
  /** Cards default to "hidden" so the logo sits next to the shop name. */
  logoPlacement?: LogoPlacement;
  onBannerError?: () => void;
  onLogoError?: () => void;
  bannerBroken?: boolean;
  logoBroken?: boolean;
  className?: string;
  children?: ReactNode;
  useNextImage?: boolean;
}

export interface ShopLogoAvatarProps {
  shopName: string;
  logoUrl?: string | null;
  logoBroken?: boolean;
  onLogoError?: () => void;
  useNextImage?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
}

/** Circular shop logo / initial — place beside the shop name. */
export function ShopLogoAvatar({
  shopName,
  logoUrl,
  logoBroken = false,
  onLogoError,
  useNextImage = true,
  size = "sm",
  className = "",
}: ShopLogoAvatarProps) {
  const logo = (logoUrl ?? "").trim();
  const showLogo = logo.length > 0 && !logoBroken;
  const initial = shopName.charAt(0).toUpperCase() || "S";
  const box =
    size === "md"
      ? "h-10 w-10 text-sm sm:h-11 sm:w-11 sm:text-base"
      : size === "xs"
        ? "h-[22px] w-[22px] text-[0.55rem] sm:h-6 sm:w-6 sm:text-[0.6rem]"
        : "h-7 w-7 text-[0.65rem] sm:h-8 sm:w-8 sm:text-[0.7rem]";

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${box} ${className}`}
    >
      {showLogo ? (
        useNextImage ? (
          <Image
            src={getSafeImageUrl(logo, "shop")}
            alt={`${shopName} logo`}
            fill
            className="object-cover"
            sizes={size === "md" ? "48px" : size === "xs" ? "24px" : "32px"}
            onError={onLogoError}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={`${shopName} logo`}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={onLogoError}
          />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-400 to-emerald-600 font-bold text-white">
          {initial}
        </div>
      )}
    </div>
  );
}

/**
 * Wide banner slot. Circular logo for cards belongs next to the name via
 * `ShopLogoAvatar` — not overlaid on the banner.
 */
export default function ShopMediaHeader({
  shopName,
  bannerUrl,
  logoUrl,
  size = "card",
  logoPlacement,
  onBannerError,
  onLogoError,
  bannerBroken = false,
  logoBroken = false,
  className = "",
  children,
  useNextImage = true,
}: ShopMediaHeaderProps) {
  const banner = (bannerUrl ?? "").trim();
  const logo = (logoUrl ?? "").trim();
  const showBanner = banner.length > 0 && !bannerBroken;
  const showLogo = logo.length > 0 && !logoBroken;
  const initial = shopName.charAt(0).toUpperCase() || "S";

  const isHero = size === "hero";
  const placement = logoPlacement ?? (isHero ? "overlay" : "hidden");

  const frameClass = isHero
    ? "relative h-36 w-full sm:h-44 md:h-48 lg:h-52"
    : // Compact marketplace banner (px so font-scale doesn't inflate cards)
      "shop-card-banner relative h-[88px] w-full sm:h-[100px]";

  const logoBoxClass = isHero
    ? "absolute -bottom-7 left-3 z-10 h-14 w-14 sm:-bottom-8 sm:left-4 sm:h-[4.5rem] sm:w-[4.5rem]"
    : "absolute bottom-2 left-2 z-10 h-9 w-9 sm:h-11 sm:w-11";

  return (
    <div className={`relative ${className}`}>
      <div
        className={`${frameClass} overflow-hidden ${
          showBanner
            ? "bg-zinc-100 dark:bg-zinc-800"
            : "bg-[linear-gradient(135deg,#f4f4f5_0%,#e4e4e7_40%,#d1fae5_100%)] dark:bg-[linear-gradient(135deg,#27272a_0%,#18181b_45%,#064e3b_100%)]"
        }`}
      >
        {showBanner ? (
          useNextImage ? (
            <Image
              src={getSafeImageUrl(banner, "shop")}
              alt={`${shopName} banner`}
              fill
              className="object-cover object-center"
              sizes={
                isHero
                  ? "100vw"
                  : "(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              }
              priority={isHero}
              onError={onBannerError}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner}
              alt={`${shopName} banner`}
              className="absolute inset-0 h-full w-full object-cover object-center"
              loading={isHero ? "eager" : "lazy"}
              onError={onBannerError}
            />
          )
        ) : (
          /* Premium soft brand mesh — no giant initial crowding the card */
          <div className="absolute inset-0" aria-hidden="true">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-50 dark:from-zinc-900 dark:via-emerald-950/50 dark:to-teal-950/40" />
            <div className="pointer-events-none absolute -left-6 -top-8 h-28 w-28 rounded-full bg-emerald-400/25 blur-2xl dark:bg-emerald-500/15" />
            <div className="pointer-events-none absolute -bottom-8 -right-4 h-28 w-28 rounded-full bg-teal-400/25 blur-2xl dark:bg-teal-500/15" />
            <div
              className="absolute inset-0 opacity-[0.12] dark:opacity-[0.08]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(15,118,110,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(15,118,110,0.16) 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            />
            {isHero ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/70 bg-white/75 text-2xl font-semibold text-emerald-800 shadow-sm backdrop-blur-[2px] dark:border-white/10 dark:bg-black/30 dark:text-emerald-100">
                  {initial}
                </span>
              </div>
            ) : (
              <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg border border-white/70 bg-white/85 text-[0.7rem] font-bold text-teal-800 shadow-sm backdrop-blur-[1px] dark:border-white/10 dark:bg-black/35 dark:text-teal-200">
                {initial}
              </div>
            )}
          </div>
        )}
        {children}
      </div>

      {placement === "overlay" ? (
        <div
          className={`${logoBoxClass} overflow-hidden rounded-full border-2 border-white bg-white shadow-md dark:border-zinc-900 dark:bg-zinc-900`}
        >
          {showLogo ? (
            useNextImage ? (
              <Image
                src={getSafeImageUrl(logo, "shop")}
                alt={`${shopName} logo`}
                fill
                className="object-cover"
                sizes={isHero ? "72px" : "44px"}
                onError={onLogoError}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={`${shopName} logo`}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={onLogoError}
              />
            )
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-400 to-emerald-600 font-bold text-white ${
                isHero ? "text-xl sm:text-2xl" : "text-sm sm:text-base"
              }`}
            >
              {initial}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
