"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getRecentlyViewed, type RecentlyViewedItem } from "@/lib/behavior";
import { getSafeImageUrl } from "@/services/storageService";
import { useMyShop } from "@/lib/queries";

function ClockIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function formatPkRs(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString("en-PK")}`;
}

function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
  });
}

export default function RecentlyViewedPage() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  const [ready, setReady] = useState(false);
  const [scopeVersion, setScopeVersion] = useState(0);
  const myShopId = useMyShop().data?.id ?? null;

  useEffect(() => {
    const onScopeChange = () => setScopeVersion((v) => v + 1);
    window.addEventListener("trendmart:scope-change", onScopeChange);
    return () => window.removeEventListener("trendmart:scope-change", onScopeChange);
  }, []);

  useEffect(() => {
    const all = getRecentlyViewed();
    setItems(myShopId ? all.filter((i) => i.shopId !== myShopId) : all);
    setReady(true);
  }, [myShopId, scopeVersion]);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 page-stack px-3 py-3 md:px-4 md:py-5">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          aria-label="Back to home"
        >
          <ChevronLeftIcon />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-teal-600 dark:text-teal-400">
              <ClockIcon />
            </span>
            <h1 className="tm-section-title">Recently viewed</h1>
          </div>
          {ready && items.length > 0 ? (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {items.length} item{items.length !== 1 ? "s" : ""} · pick up where you left off
            </p>
          ) : null}
        </div>
      </div>

      {!ready ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="aspect-square bg-zinc-200 dark:bg-zinc-800" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mx-auto max-w-sm py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
            <ClockIcon />
          </div>
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
            No recently viewed items
          </h2>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Browse products and they will show up here so you can jump back quickly.
          </p>
          <Link
            href="/products"
            className="tm-btn-primary mt-5 inline-flex rounded-full px-4 py-2 text-xs font-semibold"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/products?product=${encodeURIComponent(item.id)}`}
              className="group overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="relative aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                {item.imageUrl ? (
                  <Image
                    src={getSafeImageUrl(item.imageUrl, "product")}
                    alt={item.name}
                    fill
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    quality={75}
                  />
                ) : (
                  <div className="tm-avatar-fallback flex h-full w-full items-center justify-center text-2xl font-bold">
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="space-y-1 p-2.5 sm:p-3">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-800 dark:text-zinc-100">
                  {item.name}
                </p>
                {item.shopName ? (
                  <p className="truncate text-[0.68rem] text-zinc-500 dark:text-zinc-400">
                    {item.shopName}
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    {formatPkRs(item.price)}
                  </span>
                  <span className="text-[0.62rem] font-medium text-zinc-400 dark:text-zinc-500">
                    {timeAgo(item.viewedAt)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
