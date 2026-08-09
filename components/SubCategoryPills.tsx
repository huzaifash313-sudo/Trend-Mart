"use client";

/* -------------------------------------------------------------------------- */
/*  Daraz-style sub-category tabs (homepage, search, shop storefront)         */
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

  if (!loading && availableIds && visible.length === 0) return null;
  if (!loading && visible.length === 0) return null;

  const chips = [
    ...visible.filter((s) => !s.is_others),
    ...visible.filter((s) => s.is_others),
  ];

  return (
    <section className={`tm-cat-bar tm-cat-bar--sub ${className}`} aria-label={label}>
      <div className="tm-cat-scroll px-1 scrollbar-none">
        <button
          type="button"
          onClick={() => onSelect(null, null)}
          className={`tm-cat-tab${!selectedId ? " is-active" : ""}`}
          aria-pressed={!selectedId}
        >
          <span className="tm-cat-tab-label">All</span>
          <span className="tm-cat-tab-line" aria-hidden="true" />
        </button>
        {chips.map((sub) => {
          const active = selectedId === sub.id;
          const labelText = sub.is_others ? "Others" : sub.name;
          return (
            <button
              key={sub.id}
              type="button"
              onClick={() => onSelect(sub.id, sub)}
              className={`tm-cat-tab${active ? " is-active" : ""}`}
              aria-pressed={active}
            >
              <span className="tm-cat-tab-label">{labelText}</span>
              <span className="tm-cat-tab-line" aria-hidden="true" />
            </button>
          );
        })}
        {loading ? (
          <span className="shrink-0 self-center px-2 text-[0.65rem] text-zinc-400 animate-pulse">
            Loading…
          </span>
        ) : null}
      </div>
    </section>
  );
}
