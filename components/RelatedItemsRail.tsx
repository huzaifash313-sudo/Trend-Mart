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
      className="tm-related-tile group flex w-[7.25rem] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm transition hover:border-emerald-300/60 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 sm:w-[8rem]"
      aria-label={`View ${item.title}`}
    >
      <span className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            sizes={PRODUCT_CARD_IMAGE_SIZES}
            loading="lazy"
            quality={PRODUCT_CARD_IMAGE_QUALITY}
            unoptimized
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-lg font-semibold text-zinc-300 dark:text-zinc-600">
            {item.title.trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
        {off > 0 ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
            {off}% OFF
          </span>
        ) : null}
      </span>
      <span className="flex flex-col gap-0.5 p-1.5 sm:p-2">
        <span className="line-clamp-2 text-[11px] font-semibold leading-snug text-zinc-800 dark:text-zinc-100">
          {item.title}
        </span>
        <span className="flex items-baseline gap-1">
          <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-400">
            {formatPrice(item.price)}
          </span>
          {item.originalPrice && item.originalPrice > item.price ? (
            <span className="text-[10px] text-zinc-400 line-through">
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
}: {
  title: string;
  items: RelatedRailItem[];
}) {
  if (!items.length) return null;

  return (
    <section className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800" aria-label={title}>
      <h2 className="mb-3 text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      <div className="tm-cat-scroll -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {items.map((item) => (
          <RelatedTile key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
