"use client";

/* Light related-items strip for product / deal detail pages — Link-only, no modals. */

import Image from "next/image";
import Link from "next/link";
import { getSafeImageUrl } from "@/services/storageService";
import { formatPrice } from "@/lib/formatters";
import {
  PRODUCT_CARD_IMAGE_QUALITY,
  PRODUCT_CARD_IMAGE_SIZES,
} from "@/lib/imageSizes";

export type RelatedRailItem = {
  id: string;
  href: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  imageUrl?: string | null;
  shopName?: string | null;
};

function RelatedTile({ item }: { item: RelatedRailItem }) {
  const src = getSafeImageUrl(item.imageUrl, "product", "card");
  const off =
    item.originalPrice && item.originalPrice > item.price && item.price > 0
      ? Math.max(1, Math.round((1 - item.price / item.originalPrice) * 100))
      : 0;

  return (
    <Link
      href={item.href}
      className="tm-related-tile group flex w-[7.25rem] shrink-0 flex-col overflow-hidden rounded-lg border border-zinc-200/70 bg-white transition hover:border-emerald-400/70 hover:shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900 sm:w-[7.75rem]"
      aria-label={`View ${item.title}`}
    >
      <span className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            sizes={PRODUCT_CARD_IMAGE_SIZES}
            loading="lazy"
            quality={PRODUCT_CARD_IMAGE_QUALITY}
            unoptimized
            className="object-cover transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-base font-semibold text-zinc-300 dark:text-zinc-600">
            {item.title.trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
        {off > 0 ? (
          <span className="absolute left-1 top-1 rounded bg-rose-500 px-1 py-px text-[8px] font-bold leading-tight text-white">
            {off}%
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0 px-1.5 py-1.5">
        <span className="line-clamp-2 min-h-[1.85rem] text-[10px] font-semibold leading-snug text-zinc-800 dark:text-zinc-100">
          {item.title}
        </span>
        <span className="mt-0.5 flex min-w-0 items-baseline gap-1">
          <span className="whitespace-nowrap text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatPrice(item.price)}
          </span>
          {item.originalPrice && item.originalPrice > item.price ? (
            <span className="whitespace-nowrap text-[9px] tabular-nums text-zinc-400 line-through">
              {formatPrice(item.originalPrice)}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

export default function RelatedItemsRail({
  title,
  items,
  subtitle,
}: {
  title: string;
  items: RelatedRailItem[];
  subtitle?: string;
}) {
  if (!items.length) return null;

  return (
    <section className="border-t border-zinc-100 pt-3 dark:border-zinc-800" aria-label={title}>
      <div className="mb-2 px-0.5">
        <h2 className="text-[13px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">{subtitle}</p>
        ) : null}
      </div>
      <div className="tm-cat-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {items.map((item) => (
          <RelatedTile key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
