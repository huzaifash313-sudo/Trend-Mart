"use client";

/* -------------------------------------------------------------------------- */
/*  Sub-category browse cards — shown under selected main category             */
/* -------------------------------------------------------------------------- */

import { useEffect, useState } from "react";
import {
  fetchSubCategories,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";
import { CATEGORY_GRADIENTS } from "@/types";

export interface SubCategoryBrowseGridProps {
  mainCategory: string;
  selectedId?: string | null;
  onSelect: (subCategoryId: string | null, sub?: SubCategoryWithMeta | null) => void;
}

export default function SubCategoryBrowseGrid({
  mainCategory,
  selectedId = null,
  onSelect,
}: SubCategoryBrowseGridProps) {
  const [subs, setSubs] = useState<SubCategoryWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const gradient = CATEGORY_GRADIENTS[mainCategory] ?? "from-emerald-400 to-teal-600";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSubCategories(mainCategory).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setSubs(result.data.filter((s) => !s.is_others));
      } else {
        setSubs([]);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [mainCategory]);

  if (!mainCategory || mainCategory === "All") return null;

  return (
    <section aria-label={`${mainCategory} sub-categories`} className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Browse sub-categories
          </h2>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {mainCategory}
          </p>
        </div>
        {selectedId ? (
          <button
            type="button"
            onClick={() => onSelect(null, null)}
            className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Clear filter
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-[color:var(--tm-elevated)]"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {subs.map((sub) => {
            const active = selectedId === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => onSelect(active ? null : sub.id, active ? null : sub)}
                className={`group overflow-hidden rounded-2xl border text-left transition-all duration-200 ${
                  active
                    ? "border-emerald-500 bg-emerald-50 shadow-md ring-2 ring-emerald-500/30 dark:border-emerald-400 dark:bg-emerald-950/40"
                    : "border-zinc-200 bg-white hover:scale-[1.02] hover:shadow-md dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]"
                }`}
                aria-pressed={active}
              >
                <div
                  className={`flex h-14 items-center justify-center bg-gradient-to-br ${gradient} sm:h-16`}
                >
                  <span className="text-2xl sm:text-3xl" aria-hidden="true">
                    {sub.icon || "📦"}
                  </span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {sub.name}
                  </p>
                  {sub.description ? (
                    <p className="mt-0.5 line-clamp-1 text-[0.6rem] text-zinc-400 dark:text-zinc-500">
                      {sub.description}
                    </p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
