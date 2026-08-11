"use client";

import { useMemo } from "react";
import Link from "next/link";
import DealCard from "@/components/DealCard";
import {
  isDealActiveOnDate,
  toPkDateKey,
  type ShopDeal,
} from "@/lib/dealSchedule";

interface FeaturedDealsStripProps {
  deals: ShopDeal[];
  /** Calendar day filter; defaults to today (live deals only). */
  dateKey?: string | null;
  /** When true, prefer featured first then fill with other live deals. */
  preferFeatured?: boolean;
  title?: string;
  seeAllHref?: string;
  limit?: number;
  className?: string;
  /** Per-shop coupon + delivery ticker tags (same as product cards). */
  getOfferTags?: (shopId: string) => string[];
}

export default function FeaturedDealsStrip({
  deals,
  dateKey,
  preferFeatured = true,
  title = "Featured deals",
  seeAllHref = "/deals",
  limit = 12,
  className = "",
  getOfferTags,
}: FeaturedDealsStripProps) {
  const day = dateKey ?? toPkDateKey();

  const visible = useMemo(() => {
    const live = deals.filter((d) => d.is_active && isDealActiveOnDate(d, day));
    if (!preferFeatured) return live.slice(0, limit);

    const featured = live.filter((d) => d.is_featured);
    const rest = live.filter((d) => !d.is_featured);
    const rank = (a: ShopDeal, b: ShopDeal) => {
      const ai = a.image_url ? 1 : 0;
      const bi = b.image_url ? 1 : 0;
      if (bi !== ai) return bi - ai;
      return 0;
    };
    featured.sort(rank);
    rest.sort(rank);
    return [...featured, ...rest].slice(0, limit);
  }, [deals, day, preferFeatured, limit]);

  if (visible.length === 0) return null;

  return (
    <section aria-label={title} className={className}>
      <div className="mb-2 flex items-end justify-between gap-2 px-0.5">
        <div>
          <h2 className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {title}
          </h2>
          <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
            Labeled Deals · coupons &amp; delivery included · tap for all
          </p>
        </div>
        <Link
          href={seeAllHref}
          className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
        >
          All deals →
        </Link>
      </div>
      <div className="-mx-3 flex gap-2.5 overflow-x-auto px-3 pb-1 scrollbar-none sm:-mx-0 sm:px-0">
        {visible.map((deal, i) => (
          <DealCard
            key={deal.id}
            deal={deal}
            compact
            priority={i < 2}
            offerTags={getOfferTags?.(deal.shop_id) ?? []}
          />
        ))}
      </div>
    </section>
  );
}
