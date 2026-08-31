"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — QR Dine-in menu UI (memoized rows, optimized images)          */
/* -------------------------------------------------------------------------- */

import { memo, useState, useCallback } from "react";
import Image from "next/image";
import { getSafeImageUrl } from "@/services/storageService";
import { formatRupees, getProductDiscount } from "@/lib/formatters";
import { variantPriceRange } from "@/lib/variantPricing";
import type { Product, VariantGroup } from "@/types";
import type { ShopDeal } from "@/lib/dealSchedule";

/* ─── Icons ─────────────────────────────────────────────────────────────────── */

export function MinusIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* ─── Optimized thumbnail ───────────────────────────────────────────────────── */

interface DineInThumbProps {
  src?: string | null;
  alt: string;
  size?: "row" | "deal" | "mini";
  priority?: boolean;
  fallbackLetter?: string;
}

export const DineInThumb = memo(function DineInThumb({
  src,
  alt,
  size = "row",
  priority = false,
  fallbackLetter,
}: DineInThumbProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const safeSrc = src ? getSafeImageUrl(src, "product") : "";
  const showImage = Boolean(safeSrc && !error);

  if (size === "mini") {
    return (
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {!loaded && showImage ? (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700" />
        ) : null}
        {showImage ? (
          <Image
            src={safeSrc}
            alt={alt}
            fill
            className={`object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            sizes="40px"
            loading="lazy"
            quality={65}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
            {(fallbackLetter ?? alt).charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    );
  }

  if (size === "deal") {
    return (
      <div className="tm-dine-deal-media relative aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {!loaded && showImage ? (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700" />
        ) : null}
        {showImage ? (
          <Image
            src={safeSrc}
            alt={alt}
            fill
            className={`object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            sizes="160px"
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            quality={70}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 text-2xl font-bold text-emerald-600/70 dark:from-emerald-950/40 dark:to-teal-950/30 dark:text-emerald-400/70">
            {fallbackLetter ?? "🍽️"}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
      {!loaded && showImage ? (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700" />
      ) : null}
      {showImage ? (
        <Image
          src={safeSrc}
          alt={alt}
          fill
          className={`object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          sizes="64px"
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          quality={70}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 text-lg font-bold text-emerald-600 dark:from-emerald-950/40 dark:to-teal-950/30 dark:text-emerald-400">
          {(fallbackLetter ?? alt).charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
});

/* ─── Deal card ─────────────────────────────────────────────────────────────── */

interface DineInDealCardProps {
  deal: ShopDeal;
  qty: number;
  priority?: boolean;
  onAdd: (deal: ShopDeal) => void;
  onBump: (key: string, delta: number, name: string) => void;
}

export const DineInDealCard = memo(function DineInDealCard({
  deal,
  qty,
  priority = false,
  onAdd,
  onBump,
}: DineInDealCardProps) {
  const key = `${deal.id}::deal`;
  const handleAdd = useCallback(() => onAdd(deal), [deal, onAdd]);
  const handleMinus = useCallback(() => onBump(key, -1, deal.title), [key, deal.title, onBump]);
  const handlePlus = useCallback(() => onBump(key, 1, deal.title), [key, deal.title, onBump]);

  return (
    <article className="tm-dine-deal-card flex w-[9.75rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]">
      <DineInThumb
        src={deal.image_url}
        alt={deal.title}
        size="deal"
        priority={priority}
        fallbackLetter="🏷️"
      />
      <div className="flex min-h-[7.25rem] flex-1 flex-col p-2.5">
        <p className="line-clamp-2 min-h-[2.5rem] text-xs font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
          {deal.title}
        </p>
        <p className="mt-auto pt-1.5 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatRupees(deal.price ?? 0)}
        </p>
        {qty === 0 ? (
          <button
            type="button"
            onClick={handleAdd}
            className="tm-dine-add-btn mt-2 flex h-8 w-full items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white transition active:scale-[0.98] hover:bg-emerald-700"
          >
            Add
          </button>
        ) : (
          <div className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-1 text-white">
            <button type="button" onClick={handleMinus} className="flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-emerald-700" aria-label="Remove deal">
              <MinusIcon />
            </button>
            <span className="min-w-[1.25rem] text-center text-sm font-bold tabular-nums">{qty}</span>
            <button type="button" onClick={handlePlus} className="flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-emerald-700" aria-label="Add deal">
              <PlusIcon />
            </button>
          </div>
        )}
      </div>
    </article>
  );
});

/* ─── Menu row ──────────────────────────────────────────────────────────────── */

interface DineInMenuRowProps {
  product: Product;
  qty: number;
  priority?: boolean;
  onAdd: (product: Product) => void;
  onRemove: (product: Product) => void;
}

export const DineInMenuRow = memo(function DineInMenuRow({
  product,
  qty,
  priority = false,
  onAdd,
  onRemove,
}: DineInMenuRowProps) {
  const groups: VariantGroup[] = (product.variants as VariantGroup[] | null) ?? [];
  const hasVariants = groups.length > 0;
  const discount = getProductDiscount(product);

  const priceLabel = hasVariants
    ? (() => {
        const { min, max } = variantPriceRange(product.price ?? 0, groups);
        return min === max ? formatRupees(min) : `${formatRupees(min)} – ${formatRupees(max)}`;
      })()
    : formatRupees(product.price);

  const handleAdd = useCallback(() => onAdd(product), [product, onAdd]);
  const handleRemove = useCallback(() => onRemove(product), [product, onRemove]);

  return (
    <div className="tm-dine-menu-row flex items-center gap-3 px-3 py-3">
      <DineInThumb
        src={product.image_url}
        alt={product.name}
        size="row"
        priority={priority}
        fallbackLetter={product.name.charAt(0).toUpperCase()}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <p className="text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
            {product.name}
          </p>
          {discount.hasDiscount ? (
            <span className="mt-0.5 shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
              -{discount.discountPercent}%
            </span>
          ) : null}
        </div>
        {product.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {product.description}
          </p>
        ) : null}
        <p className="mt-1 flex flex-wrap items-baseline gap-1.5">
          <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {priceLabel}
          </span>
          {discount.hasDiscount ? (
            <span className="text-[11px] tabular-nums text-zinc-400 line-through">
              {formatRupees(discount.originalPrice ?? product.price)}
            </span>
          ) : null}
          {hasVariants ? (
            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">· options</span>
          ) : null}
        </p>
      </div>
      {qty === 0 ? (
        <button
          type="button"
          onClick={handleAdd}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-600 text-emerald-600 transition hover:bg-emerald-50 active:scale-95 dark:hover:bg-emerald-900/20"
          aria-label={`Add ${product.name}`}
        >
          <PlusIcon />
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-2 rounded-full bg-emerald-600 px-1.5 py-1 text-white">
          <button
            type="button"
            onClick={handleRemove}
            className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-emerald-700"
            aria-label={`Remove ${product.name}`}
          >
            <MinusIcon />
          </button>
          <span className="w-5 text-center text-sm font-bold tabular-nums">{qty}</span>
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-emerald-700"
            aria-label={`Add more ${product.name}`}
          >
            <PlusIcon />
          </button>
        </div>
      )}
    </div>
  );
});

/* ─── Skeletons ─────────────────────────────────────────────────────────────── */

export function DineInDealsSkeleton() {
  return (
    <div className="tm-dine-scroll flex gap-3 overflow-x-auto pb-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="w-[9.75rem] shrink-0 snap-start overflow-hidden rounded-2xl border border-zinc-100 bg-white dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]"
        >
          <div className="aspect-[4/3] animate-pulse bg-zinc-100 dark:bg-zinc-800" />
          <div className="space-y-2 p-2.5">
            <div className="h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-4 w-14 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-8 w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DineInMenuSkeleton({ sections = 2, rows = 5 }: { sections?: number; rows?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: sections }).map((_, si) => (
        <section key={si}>
          <div className="mb-2 h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]">
            {Array.from({ length: rows }).map((_, ri) => (
              <div key={ri} className="flex items-center gap-3 border-b border-zinc-100 px-3 py-3 last:border-0 dark:border-zinc-800">
                <div className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  <div className="h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  <div className="h-3.5 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function DineInPageSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <div className="sticky top-0 z-20 border-b border-zinc-100 bg-white dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]">
        <div className="h-6 animate-pulse bg-gradient-to-r from-emerald-600 to-teal-600" />
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <div className="h-11 w-11 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
          <div className="h-7 w-16 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="mx-auto max-w-md px-4 pb-3">
          <div className="h-10 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
      <div className="mx-auto max-w-md px-4 pt-4">
        <div className="mb-5">
          <div className="mb-2 h-4 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <DineInDealsSkeleton />
        </div>
        <DineInMenuSkeleton />
      </div>
    </div>
  );
}
