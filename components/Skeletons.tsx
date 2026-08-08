"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Reusable Skeleton Loading Components                          */
/* -------------------------------------------------------------------------- */

/** A single shop card skeleton (used in grids). */
export function ShopCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 h-40 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-2 h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-2 h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-3 h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-10 w-full rounded-full bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

/** A grid of shop card skeletons. */
export function ShopCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <ShopCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A full product card skeleton. */
export function ProductCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 h-48 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-2 h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-2 h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-10 w-full rounded-full bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

/** A grid of product card skeletons. */
export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A compact row skeleton (used in dashboard tables). */
export function TableRowSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="h-10 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

/** Multiple table row skeletons. */
export function TableRowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <TableRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Shop detail banner skeleton. */
export function ShopBannerSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white p-6 dark:bg-zinc-900">
      <div className="mb-4 h-6 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-2 h-4 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-1/4 rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

/** Analytics card skeleton. */
export function AnalyticsCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto mb-2 h-8 w-12 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mx-auto h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}