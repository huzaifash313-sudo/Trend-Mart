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
 * - Banner = wide cover (object-cover, fixed heights — full width, not huge on desktop)
 * - Logo = circular avatar overlaid on the banner
 * Empty banner → green gradient. Empty logo → initial letter.
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
  // Fixed heights (not aspect-ratio + contain) so banners always fill width
  // and stay compact on laptops instead of growing with tall posters.
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

      {/* Logo — separate from banner */}
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
    </div>
  );
}
