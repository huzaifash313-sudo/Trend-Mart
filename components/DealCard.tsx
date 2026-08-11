"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  formatDealSchedule,
  type ShopDeal,
} from "@/lib/dealSchedule";
import { getSafeImageUrl } from "@/services/storageService";
import { getShopPath } from "@/lib/shopSlug";

interface DealCardProps {
  deal: ShopDeal;
  /** Prefer linking to shop (default) or deals hub with hash */
  href?: string;
  compact?: boolean;
  priority?: boolean;
  className?: string;
}

export default function DealCard({
  deal,
  href,
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

  return (
    <Link
      href={target}
      className={`group relative block overflow-hidden rounded-2xl border border-emerald-200/60 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md dark:border-emerald-900/40 dark:bg-zinc-900 ${
        compact ? "w-[9.5rem] shrink-0" : "w-full"
      } ${className}`}
      aria-label={`${deal.title}${deal.shop_name ? ` at ${deal.shop_name}` : ""}`}
    >
      <div
        className={`relative overflow-hidden ${compact ? "aspect-[4/5]" : "aspect-[16/10]"}`}
      >
        {hasImage ? (
          <Image
            src={getSafeImageUrl(deal.image_url!, "product")}
            alt=""
            fill
            priority={priority}
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            sizes={compact ? "10rem" : "(max-width: 640px) 50vw, 320px"}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="absolute inset-0 bg-[linear-gradient(135deg,#064e3b_0%,#0f766e_45%,#134e4a_100%)]"
            aria-hidden="true"
          >
            <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,#a7f3d0_0,transparent_40%),radial-gradient(circle_at_80%_70%,#5eead4_0,transparent_35%)]" />
            <div className="absolute inset-0 flex flex-col items-start justify-end p-3">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-emerald-100/80">
                Deal
              </span>
              <span className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-white">
                {deal.title}
              </span>
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

        {badge ? (
          <span className="absolute left-2 top-2 rounded-md bg-amber-400 px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-zinc-900 shadow-sm">
            {badge}
          </span>
        ) : null}

        {deal.is_featured ? (
          <span className="absolute right-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-emerald-800 backdrop-blur-sm">
            Featured
          </span>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="line-clamp-2 text-[0.8rem] font-bold leading-snug text-white drop-shadow-sm">
            {deal.title}
          </p>
          {deal.shop_name ? (
            <p className="mt-0.5 truncate text-[0.65rem] font-medium text-emerald-100/90">
              {deal.shop_name}
            </p>
          ) : null}
          <p className="mt-0.5 truncate text-[0.6rem] text-white/75">{schedule}</p>
        </div>
      </div>
    </Link>
  );
}
