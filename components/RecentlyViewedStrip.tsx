"use client";

/* -------------------------------------------------------------------------- */
/*  Recently viewed strip — "pick up where you left off".                     */
/*  Reads the local behaviour memory (lib/behavior.ts) and renders a           */
/*  horizontal row of the last products the customer opened. Tapping re-opens  */
/*  the product quick-view via the /products?product=<id> deep-link.           */
/* -------------------------------------------------------------------------- */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getRecentlyViewed, type RecentlyViewedItem } from "@/lib/behavior";
import { getSafeImageUrl } from "@/services/storageService";
import { formatRupees } from "@/lib/formatters";

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
      <div className="-mx-3 flex gap-2.5 overflow-x-auto px-3 pb-1 scrollbar-none sm:-mx-4 sm:px-4">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/products?product=${encodeURIComponent(item.id)}`}
            className="flex w-[7.5rem] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
              {item.imageUrl ? (
                <Image
                  src={getSafeImageUrl(item.imageUrl, "product")}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="7.5rem"
                  quality={70}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xl font-bold text-teal-700/40">
                  {item.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 p-2">
              <p className="truncate text-[11px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
                {item.name}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                {item.shopName || "Store"}
              </p>
              <p className="mt-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                {formatRupees(item.price)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
