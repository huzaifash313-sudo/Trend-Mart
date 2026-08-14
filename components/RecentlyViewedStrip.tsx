"use client";

/* -------------------------------------------------------------------------- */
/*  Recently viewed strip — compact "pick up where you left off" chips.       */
/*  Reads the local behaviour memory (lib/behavior.ts) and renders a           */
/*  tight horizontal row of small round thumbnails + name (Instagram-style),   */
/*  so it takes minimal space and feels natural even with few items.           */
/* -------------------------------------------------------------------------- */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getRecentlyViewed, type RecentlyViewedItem } from "@/lib/behavior";
import { getSafeImageUrl } from "@/services/storageService";

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default function RecentlyViewedStrip() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    setItems(getRecentlyViewed());
  }, []);

  if (items.length === 0) return null;

  return (
    <section aria-label="Recently viewed" className="mb-5 sm:mb-6">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-teal-600 dark:text-teal-400">
          <ClockIcon />
        </span>
        <h2 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Recently viewed
        </h2>
      </div>
      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 scrollbar-none sm:-mx-4 sm:px-4">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/products?product=${encodeURIComponent(item.id)}`}
            className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <div className="relative h-[3.35rem] w-[3.35rem] overflow-hidden rounded-full bg-zinc-100 ring-2 ring-white shadow-sm dark:bg-zinc-800 dark:ring-zinc-950">
              {item.imageUrl ? (
                <Image
                  src={getSafeImageUrl(item.imageUrl, "product")}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="3.35rem"
                  quality={60}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-base font-bold text-teal-700/50">
                  {item.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <span className="w-full truncate text-center text-[0.62rem] font-medium leading-tight text-zinc-600 dark:text-zinc-300">
              {item.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
