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
      ? "h-10 w-10 text-sm sm:h-11 sm:w-11 sm:text-base"
      : "h-8 w-8 text-[0.7rem] sm:h-9 sm:w-9 sm:text-xs";

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
    : // Fixed banner height across every card column — no aspect-ratio jitter
      "relative h-[6.75rem] w-full sm:h-[7.5rem]";

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
          /* Uniform styled placeholder — same geometry as image banners */
          <div
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <div className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 30%, rgba(16,185,129,0.35) 0%, transparent 42%), radial-gradient(circle at 80% 70%, rgba(16,185,129,0.22) 0%, transparent 45%)",
              }}
            />
            <span
              className={`relative z-[1] flex items-center justify-center rounded-2xl border border-white/60 bg-white/70 font-semibold text-emerald-800 shadow-sm backdrop-blur-[2px] dark:border-white/10 dark:bg-black/30 dark:text-emerald-100 ${
                isHero ? "h-16 w-16 text-2xl" : "h-10 w-10 text-base sm:h-11 sm:w-11 sm:text-lg"
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
