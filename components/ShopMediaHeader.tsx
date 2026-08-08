"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { getSafeImageUrl } from "@/services/storageService";

type Size = "card" | "hero";

export interface ShopMediaHeaderProps {
  shopName: string;
  bannerUrl?: string | null;
  logoUrl?: string | null;
  size?: Size;
  onBannerError?: () => void;
  onLogoError?: () => void;
  bannerBroken?: boolean;
  logoBroken?: boolean;
  className?: string;
  children?: ReactNode;
  useNextImage?: boolean;
}

/**
 * Banner and logo are separate slots:
 * - Banner = wide storefront cover (never falls back to logo)
 * - Logo = circular avatar overlaid on the banner
 * Empty banner → green gradient. Empty logo → initial letter.
 * Banner uses object-contain so the full image shows on mobile + desktop.
 */
export default function ShopMediaHeader({
  shopName,
  bannerUrl,
  logoUrl,
  size = "card",
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
  const frameClass = isHero
    ? "relative aspect-[2/1] w-full sm:aspect-[21/9] min-h-[9rem] sm:min-h-[12rem]"
    : "relative aspect-[16/10] w-full min-h-[5.5rem] sm:min-h-[7.5rem]";

  const logoBoxClass = isHero
    ? "absolute -bottom-7 left-3 z-10 h-14 w-14 sm:-bottom-8 sm:left-4 sm:h-20 sm:w-20"
    : "absolute bottom-2 left-2 z-10 h-9 w-9 sm:bottom-2.5 sm:left-2.5 sm:h-11 sm:w-11";

  return (
    <div className={`relative ${className}`}>
      <div
        className={`${frameClass} overflow-hidden ${
          showBanner
            ? "bg-zinc-100 dark:bg-zinc-800"
            : "bg-gradient-to-br from-emerald-400 to-emerald-600"
        }`}
      >
        {showBanner ? (
          useNextImage ? (
            <Image
              src={getSafeImageUrl(banner, "shop")}
              alt={`${shopName} banner`}
              fill
              className="object-contain"
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
              className="h-full w-full object-contain"
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

      {/* Logo — separate from banner */}
      <div
        className={`relative ${logoBoxClass} overflow-hidden rounded-full border-2 border-white bg-white shadow-md dark:border-zinc-900 dark:bg-zinc-900`}
      >
        {showLogo ? (
          useNextImage ? (
            <Image
              src={getSafeImageUrl(logo, "shop")}
              alt={`${shopName} logo`}
              fill
              className="object-cover"
              sizes={isHero ? "80px" : "44px"}
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
    </div>
  );
}
