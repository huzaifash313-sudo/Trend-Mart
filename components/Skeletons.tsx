"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Reusable Skeleton Loading Components                          */
/* -------------------------------------------------------------------------- */

/** A single shop card skeleton (used in grids). */
export function ShopCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-teal-100 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative h-[88px] w-full animate-pulse bg-zinc-200 dark:bg-zinc-800 sm:h-[100px]">
        <div className="absolute bottom-2 left-2 h-10 w-10 rounded-full border-2 border-white bg-zinc-300 dark:border-zinc-900 dark:bg-zinc-700" />
      </div>
      <div className="flex flex-1 flex-col px-2 pb-2 pt-2 sm:px-2.5">
        <div className="flex items-start gap-1.5">
          <div className="h-8 flex-1 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="mt-1 h-3 w-3/4 animate-pulse rounded bg-teal-100 dark:bg-zinc-800" />
        <div className="mt-1 h-3 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-auto pt-2">
          <div className="h-8 w-full animate-pulse rounded-md bg-gradient-to-r from-emerald-200 to-teal-200 dark:from-zinc-800 dark:to-zinc-700" />
        </div>
      </div>
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

/** A full product card skeleton — matches live `tm-product-card` chrome. */
export function ProductCardSkeleton() {
  return (
    <div className="tm-product-card flex flex-col overflow-hidden">
      <div className="tm-product-media animate-pulse bg-teal-50 dark:bg-teal-950/30" />
      <div className="tm-product-body flex flex-col gap-0.5">
        <div className="h-3.5 w-[88%] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-3 w-[55%] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="mt-auto flex items-end justify-between pt-1">
          <div className="h-4 w-14 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-3 w-14 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

/** A grid of product card skeletons. */
export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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