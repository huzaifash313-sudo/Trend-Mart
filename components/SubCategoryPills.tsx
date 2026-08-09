"use client";

/* -------------------------------------------------------------------------- */
/*  Interactive sub-category filter chips (homepage, search, shop storefront) */
/* -------------------------------------------------------------------------- */

import { useEffect, useState } from "react";
import {
  fetchSubCategories,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";

export interface SubCategoryPillsProps {
  /** Parent main category (e.g. shop.category or selected homepage category). */
  mainCategory: string | null | undefined;
  /** Currently selected sub-category id, or "" / null for All. */
  selectedId?: string | null;
  onSelect: (subCategoryId: string | null, sub?: SubCategoryWithMeta | null) => void;
  /** Optional: only show subs that appear in this id set (shop product inventory). */
  availableIds?: Set<string> | null;
  className?: string;
  label?: string;
}

export default function SubCategoryPills({
  mainCategory,
  selectedId = null,
  onSelect,
  availableIds = null,
  className = "",
  label = "Sub-categories",
}: SubCategoryPillsProps) {
  const [subs, setSubs] = useState<SubCategoryWithMeta[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mainCategory || mainCategory === "All") {
      setSubs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchSubCategories(mainCategory).then((result) => {
      if (cancelled) return;
      if (result.success) setSubs(result.data);
      else setSubs([]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [mainCategory]);

  if (!mainCategory || mainCategory === "All") return null;

  const visible = availableIds
    ? subs.filter((s) => availableIds.has(s.id) || s.is_others)
    : subs;

  // When filtering by inventory, drop empty lists (no products tagged yet)
  if (!loading && availableIds && visible.length === 0) return null;
  if (!loading && visible.length === 0) return null;

  const chips = [
    ...visible.filter((s) => !s.is_others),
    ...visible.filter((s) => s.is_others),
  ];

  return (
    <section className={className} aria-label={label}>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => onSelect(null, null)}
          className={`chip shrink-0 rounded-full border px-3 text-[0.7rem] font-medium transition-colors ${
            !selectedId
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)] dark:text-[color:var(--tm-muted)]"
          }`}
          aria-pressed={!selectedId}
        >
          All
        </button>
        {chips.map((sub) => {
          const active = selectedId === sub.id;
          const labelText = sub.is_others ? "Others" : sub.name;
          return (
            <button
              key={sub.id}
              type="button"
              onClick={() => onSelect(sub.id, sub)}
              className={`chip shrink-0 rounded-full border px-3 text-[0.7rem] font-medium transition-colors ${
                active
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)] dark:text-[color:var(--tm-muted)]"
              }`}
              aria-pressed={active}
            >
              {sub.icon ? <span className="mr-1" aria-hidden="true">{sub.icon}</span> : null}
              {labelText}
            </button>
          );
        })}
        {loading && (
          <span className="chip shrink-0 self-center text-[0.6rem] text-zinc-400 animate-pulse">
            Loading…
          </span>
        )}
      </div>
    </section>
  );
}
