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
  size?: "sm" | "md";
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
      ? "h-11 w-11 text-base sm:h-12 sm:w-12 sm:text-lg"
      : "h-8 w-8 text-xs sm:h-9 sm:w-9 sm:text-sm";

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
            sizes={size === "md" ? "48px" : "36px"}
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
    : "relative h-28 w-full sm:h-32";

  const logoBoxClass = isHero
    ? "absolute -bottom-7 left-3 z-10 h-14 w-14 sm:-bottom-8 sm:left-4 sm:h-[4.5rem] sm:w-[4.5rem]"
    : "absolute bottom-2 left-2 z-10 h-9 w-9 sm:h-11 sm:w-11";

  return (
    <div className={`relative ${className}`}>
      <div
        className={`${frameClass} overflow-hidden ${
          showBanner
            ? "bg-zinc-200 dark:bg-zinc-800"
            : "bg-gradient-to-br from-emerald-400 to-emerald-600"
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
                  : "(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
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
          <div className="flex h-full w-full items-center justify-center">
            <span
              className={`select-none font-bold text-white/70 ${
                isHero ? "text-5xl" : "text-2xl sm:text-4xl"
              }`}
            >
              {initial}
            </span>
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
