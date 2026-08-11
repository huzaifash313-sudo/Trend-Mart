"use client";

import { useMemo, useState, useCallback, type MouseEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  formatDealSchedule,
  formatDealWhenTag,
  type ShopDeal,
} from "@/lib/dealSchedule";
import { getDealImages } from "@/lib/productImages";
import { getSafeImageUrl } from "@/services/storageService";
import { getShopPath } from "@/lib/shopSlug";
import { OfferTickerMarquee } from "@/components/ProductGrid";

interface DealCardProps {
  deal: ShopDeal;
  /** Prefer linking to shop (default) */
  href?: string;
  /** Coupon / delivery / extra ticker lines from the store */
  offerTags?: string[];
  compact?: boolean;
  priority?: boolean;
  className?: string;
}

/**
 * Same product-card chrome as ProductGrid — only hard label difference is the Deal tag.
 */
export default function DealCard({
  deal,
  href,
  offerTags = [],
  compact = false,
  priority = false,
  className = "",
}: DealCardProps) {
  const gallery = useMemo(() => getDealImages(deal), [deal]);
  const [imgIndex, setImgIndex] = useState(0);
  const [imgError, setImgError] = useState(false);
  const activeUrl = gallery[Math.min(imgIndex, Math.max(gallery.length - 1, 0))] ?? null;

  const shopHref = getShopPath({
    id: deal.shop_id,
    name: deal.shop_name || "Store",
    slug: deal.shop_slug,
  });
  const target = href ?? shopHref;
  const badge = (deal.badge_text || "").trim() || null;
  const hasImage = Boolean(activeUrl && !imgError);
  const whenTag = formatDealWhenTag(deal);
  const schedule = formatDealSchedule(deal);

  const tickerTags = useMemo(() => {
    const tags = [...offerTags];
    if (whenTag && !tags.some((t) => t.toLowerCase() === whenTag.toLowerCase())) {
      tags.unshift(whenTag);
    }
    if (badge) {
      const line = `${badge} · ${whenTag}`;
      if (!tags.some((t) => t.toLowerCase() === line.toLowerCase())) {
        tags.unshift(line.length > 32 ? `${line.slice(0, 30)}…` : line);
      }
    }
    return tags;
  }, [offerTags, badge, whenTag]);

  const cycleImage = useCallback(
    (e: MouseEvent, dir: 1 | -1) => {
      e.preventDefault();
      e.stopPropagation();
      if (gallery.length < 2) return;
      setImgError(false);
      setImgIndex((i) => (i + dir + gallery.length) % gallery.length);
    },
    [gallery.length],
  );

  const card = (
    <article
      className={`tm-product-card group flex h-full flex-col overflow-hidden ${
        compact ? "w-[9.75rem] shrink-0" : "w-full"
      } ${className}`}
    >
      <div className="tm-product-media relative shrink-0 overflow-hidden">
        {hasImage && activeUrl ? (
          <Image
            src={getSafeImageUrl(activeUrl, "product")}
            alt={deal.title}
            fill
            className="object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            sizes={compact ? "10rem" : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"}
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            quality={75}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="tm-product-placeholder flex h-full w-full items-center justify-center">
            <span className="select-none text-2xl font-semibold tracking-tight text-teal-700/35 dark:text-teal-300/30 sm:text-3xl">
              {deal.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Same corner chip style as product category — amber Deal label */}
        <span className="absolute left-1.5 top-1.5 z-10 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white shadow-sm">
          Deal
        </span>

        {deal.is_featured ? (
          <span className="absolute right-1.5 top-1.5 z-10 rounded-md bg-zinc-950/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/95 shadow-sm backdrop-blur-[2px]">
            Featured
          </span>
        ) : null}

        {gallery.length > 1 ? (
          <>
            <span className="absolute bottom-7 right-1.5 z-10 rounded bg-zinc-950/75 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              {Math.min(imgIndex, gallery.length - 1) + 1}/{gallery.length}
            </span>
            {!compact ? (
              <>
                <button
                  type="button"
                  aria-label="Previous deal photo"
                  onClick={(e) => cycleImage(e, -1)}
                  className="absolute left-1 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-950/55 text-white opacity-0 transition group-hover:flex group-hover:opacity-100"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next deal photo"
                  onClick={(e) => cycleImage(e, 1)}
                  className="absolute right-1 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-950/55 text-white opacity-0 transition group-hover:flex group-hover:opacity-100"
                >
                  ›
                </button>
              </>
            ) : null}
          </>
        ) : null}

        <OfferTickerMarquee tags={tickerTags} />
      </div>

      <div className="tm-product-body flex min-h-0 flex-1 flex-col gap-0.5">
        <h3
          className={`tm-product-title ${
            compact ? "text-[12px] sm:text-[13px]" : "text-[13px] sm:text-sm"
          }`}
          title={deal.title}
        >
          {deal.title}
        </h3>

        {deal.shop_name ? (
          <div className="flex min-w-0 items-center gap-1">
            {deal.shop_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getSafeImageUrl(deal.shop_logo_url, "shop")}
                alt=""
                className="h-3 w-3 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[7px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {deal.shop_name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-[10px] font-medium leading-none text-emerald-700 dark:text-emerald-400 sm:text-[11px]">
              {deal.shop_name}
            </span>
          </div>
        ) : null}

        <div className="tm-product-footer mt-auto flex items-end justify-between gap-1.5 pt-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold leading-none text-zinc-900 dark:text-zinc-100 sm:text-[13px]">
              {whenTag}
            </p>
            <p className="mt-0.5 truncate text-[10px] leading-none text-zinc-400 sm:text-[11px]">
              {badge ? `${badge} · ${schedule}` : schedule}
            </p>
          </div>
          <span className="tm-product-add-text shrink-0 px-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            View
          </span>
        </div>
      </div>
    </article>
  );

  return (
    <Link
      href={target}
      className={compact ? "block shrink-0" : "block h-full"}
      aria-label={`Deal: ${deal.title}${deal.shop_name ? ` at ${deal.shop_name}` : ""}`}
    >
      {card}
    </Link>
  );
}
