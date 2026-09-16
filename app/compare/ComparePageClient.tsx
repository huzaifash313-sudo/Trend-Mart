"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  bestCompareId,
  clearCompare,
  getCompareItems,
  removeFromCompare,
  scoreCompareItems,
  type CompareItem,
} from "@/lib/compare";
import { useLocale } from "@/context/LocaleContext";
import { formatPrice, formatRupees } from "@/lib/formatters";
import { getSafeImageUrl } from "@/services/storageService";
import CompactRating from "@/components/CompactRating";

export default function ComparePageClient() {
  const { t } = useLocale();
  const [items, setItems] = useState<CompareItem[]>([]);

  const refresh = useCallback(() => setItems(getCompareItems()), []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("trendsmart:compare-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("trendsmart:compare-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  const scores = useMemo(() => scoreCompareItems(items), [items]);
  const bestId = useMemo(() => bestCompareId(items), [items]);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          {t("compare.open")}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">{t("compare.empty")}</p>
        <p className="mt-1 text-xs text-zinc-400">{t("compare.sameCategoryHint")}</p>
        <Link
          href="/products"
          className="mt-4 inline-block rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"
        >
          {t("compare.browse")}
        </Link>
      </div>
    );
  }

  const rows: { label: string; render: (i: CompareItem) => ReactNode }[] = [
    {
      label: t("compare.score"),
      render: (i) => {
        const s = scores.get(i.id) ?? 0;
        const isBest = bestId === i.id;
        return (
          <div className="flex flex-col items-center gap-1">
            <span
              className={`inline-flex min-w-[3.25rem] items-center justify-center rounded-full px-2.5 py-1 text-sm font-black tabular-nums ${
                isBest
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              {s}
            </span>
            {isBest ? (
              <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                {t("compare.best")}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      label: t("compare.photo"),
      render: (i) => {
        const src = getSafeImageUrl(i.imageUrl, "product", "card");
        return src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={src} alt="" className="mx-auto h-24 w-24 rounded-lg object-cover" />
        ) : (
          <span className="text-2xl text-zinc-300">?</span>
        );
      },
    },
    {
      label: t("compare.name"),
      render: (i) => (
        <Link
          href={i.href || `/products/${i.id}`}
          className="font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          {i.name}
        </Link>
      ),
    },
    {
      label: t("compare.price"),
      render: (i) => (
        <span className="font-bold tabular-nums">
          {formatPrice(i.price)}
          {i.originalPrice && i.originalPrice > i.price ? (
            <span className="ml-1 text-xs font-normal text-zinc-400 line-through">
              {formatRupees(i.originalPrice)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      label: t("compare.shop"),
      render: (i) => i.shopName || "—",
    },
    {
      label: t("compare.rating"),
      render: (i) =>
        i.avgRating != null ? (
          <CompactRating average={i.avgRating} count={i.reviewCount ?? 0} />
        ) : (
          "—"
        ),
    },
    {
      label: t("compare.category"),
      render: (i) => i.category || "—",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {t("compare.open")}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">{t("compare.scoreHint")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            clearCompare();
            refresh();
          }}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-600"
        >
          {t("compare.clear")}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800">
              <th className="w-24 whitespace-nowrap p-3 text-[10px] uppercase text-zinc-400" />
              {items.map((i) => (
                <th key={i.id} className="p-2 text-center">
                  <button
                    type="button"
                    className="text-[10px] font-bold text-rose-500"
                    onClick={() => {
                      removeFromCompare(i.id);
                      refresh();
                    }}
                  >
                    {t("compare.removeItem")}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <th className="whitespace-nowrap p-3 text-[11px] font-semibold text-zinc-500">
                  {row.label}
                </th>
                {items.map((i) => (
                  <td key={i.id} className="p-3 text-center align-middle">
                    {row.render(i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
