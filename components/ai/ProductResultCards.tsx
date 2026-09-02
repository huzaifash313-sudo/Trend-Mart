"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProductSearchHit } from "@/lib/ai/productSearch";

function rs(n: number): string {
  return `Rs. ${n.toLocaleString("en-PK")}`;
}

function distLabel(km: number | null): string | null {
  if (km == null || Number.isNaN(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)} km`;
}

export function ProductResultCards({ products }: { products: ProductSearchHit[] }) {
  if (!products.length) return null;

  return (
    <div className="mt-2 space-y-2">
      {products.map((p) => (
        <article
          key={p.id}
          className="overflow-hidden rounded-2xl border border-emerald-100/90 bg-white shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900"
        >
          <div className="flex gap-3 p-2.5">
            <Link
              href={p.productPath}
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-emerald-50 dark:bg-zinc-800"
            >
              {p.imageUrl ? (
                <Image
                  src={p.imageUrl}
                  alt={p.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                  unoptimized
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[0.65rem] font-bold text-emerald-600">
                  TM
                </span>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={p.productPath} className="line-clamp-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {p.name}
              </Link>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {p.shopName}
                {p.shopLocation ? ` · ${p.shopLocation}` : ""}
                {distLabel(p.distanceKm) ? ` · ${distLabel(p.distanceKm)}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{rs(p.price)}</span>
                {p.originalPrice && p.originalPrice > p.price ? (
                  <span className="text-[0.65rem] text-zinc-400 line-through">{rs(p.originalPrice)}</span>
                ) : null}
                {p.discountPct > 0 ? (
                  <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[0.55rem] font-bold text-rose-600">
                    {p.discountPct}% OFF
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex border-t border-emerald-50 dark:border-emerald-900/30">
            <Link
              href={p.productPath}
              className="flex-1 py-2 text-center text-[0.7rem] font-bold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
            >
              Open product
            </Link>
            <Link
              href={p.shopPath}
              className="flex-1 border-l border-emerald-50 py-2 text-center text-[0.7rem] font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-emerald-900/30 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
            >
              Visit shop
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
