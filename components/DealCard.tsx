"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  formatDealSchedule,
  type ShopDeal,
} from "@/lib/dealSchedule";
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
 * Product-grid parity card for store deals.
 * Same layout language as products — only difference is the clear “Deal” label.
 */
export default function DealCard({
  deal,
  href,
  offerTags = [],
  compact = false,
  priority = false,
  className = "",
}: DealCardProps) {
  const [imgError, setImgError] = useState(false);
  const shopHref = getShopPath({
    id: deal.shop_id,
    name: deal.shop_name || "Store",
    slug: deal.shop_slug,
  });
  const target = href ?? shopHref;
  const badge = (deal.badge_text || "").trim() || null;
  const hasImage = Boolean(deal.image_url && !imgError);
  const schedule = formatDealSchedule(deal);

  const tickerTags = useMemo(() => {
    const dealLine = badge ? `${badge} · ${deal.title}` : deal.title;
    const tags = [...offerTags];
    if (dealLine && !tags.some((t) => t.toLowerCase() === dealLine.toLowerCase())) {
      tags.push(dealLine.length > 32 ? `${dealLine.slice(0, 30)}…` : dealLine);
    }
    return tags;
  }, [offerTags, badge, deal.title]);

  const card = (
    <article
      className={`tm-product-card group flex h-full flex-col overflow-hidden ${
        compact ? "w-[9.75rem] shrink-0" : "w-full"
      } ${className}`}
    >
      <div className="tm-product-media relative shrink-0 overflow-hidden">
        {hasImage ? (
          <Image
            src={getSafeImageUrl(deal.image_url!, "product")}
            alt={deal.title}
            fill
            className="object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            sizes={compact ? "10rem" : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"}
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="tm-product-placeholder flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-800 via-teal-700 to-emerald-900">
            <span className="select-none text-2xl font-semibold tracking-tight text-emerald-100/40 sm:text-3xl">
              {deal.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Always label as Deal — the only hard difference from products */}
        <span className="absolute left-1.5 top-1.5 z-10 rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none tracking-wide text-zinc-900 shadow-sm">
          Deal
        </span>

        {deal.is_featured ? (
          <span className="absolute right-1.5 top-1.5 z-10 rounded-md bg-white/95 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800 shadow-sm backdrop-blur-sm">
            Featured
          </span>
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
            {badge ? (
              <p className="truncate text-[12px] font-bold tabular-nums leading-none text-amber-700 dark:text-amber-300 sm:text-[13px]">
                {badge}
              </p>
            ) : (
              <p className="truncate text-[11px] font-semibold leading-none text-emerald-700 dark:text-emerald-400">
                Store deal
              </p>
            )}
            <p className="mt-0.5 truncate text-[10px] leading-none text-zinc-400 sm:text-[11px]">
              {schedule}
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
