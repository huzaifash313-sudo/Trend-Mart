"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Homepage Category Icon Rail                                   */
/*                                                                             */
/*  Colourful, icon-first category tiles that live UNDER the brand video      */
/*  (instead of plain text tabs above it).                                    */
/*   - Each category gets its own gradient circle + emoji                     */
/*   - Active tile shows a glowing ring so the current filter is obvious      */
/*   - Mobile: compact swipeable row · Desktop: multi-column wrap of the      */
/*     categories that actually have live shops (cap keeps it tidy)           */
/*   - Tapping a tile filters the shop grid below (same as the old pills)     */
/* -------------------------------------------------------------------------- */

import { useMemo } from "react";
import Link from "next/link";
import type { ShopCategory } from "@/types";
import { CATEGORY_GRADIENTS, CATEGORY_ICONS } from "@/types";

/* Stable gradient for the "All" pseudo-tile */
const ALL_GRADIENT = "from-teal-400 via-emerald-500 to-green-600";
const DEFAULT_GRADIENT = "from-gray-400 to-zinc-500";

const MAX_TILES = 10;

export interface HomeCategoriesProps {
  /** Ordered categories — "All" first, affinity-reordered on client. */
  categories: readonly ShopCategory[];
  /** Live-shop counts per category (used to hide empty categories). */
  counts: ReadonlyMap<string, number>;
  activeCategory: ShopCategory;
  onSelect: (category: ShopCategory) => void;
}

function gradientFor(category: string): string {
  if (category === "All") return ALL_GRADIENT;
  return CATEGORY_GRADIENTS[category] ?? DEFAULT_GRADIENT;
}

function iconFor(category: string): string {
  return category === "All" ? "🏪" : CATEGORY_ICONS[category] ?? "🛍️";
}

export default function HomeCategories({
  categories,
  counts,
  activeCategory,
  onSelect,
}: HomeCategoriesProps) {
  /* Only show tiles for categories that currently have live shops (All first).
     Guarantee the active filter is always reachable, even when it was picked
     from a URL/param and sits outside the popular cap. */
  const tiles = useMemo(() => {
    const hasShops = (c: ShopCategory) =>
      c === "All" || (counts.get(c) ?? 0) > 0;

    const list: ShopCategory[] = [];
    for (const cat of categories) {
      if (!hasShops(cat)) continue;
      if (cat !== "All" && list.filter((c) => c !== "All").length >= MAX_TILES) break;
      list.push(cat);
    }

    if (activeCategory !== "All" && !list.includes(activeCategory)) {
      list.splice(1, 0, activeCategory);
      if (list.length > MAX_TILES + 1) list.pop();
    }

    return list;
  }, [categories, counts, activeCategory]);

  if (tiles.length === 0) return null;

  return (
    <section aria-label="Browse by category" className="tm-home-cats">
      <div className="tm-home-cats-head">
        <h2 className="tm-home-cats-title">Shop by category</h2>
        <Link href="/search" className="tm-home-cats-more">
          All categories
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>

      {/* Mobile: swipeable row (fade edges) · md+: wrapping icon grid */}
      <div className="tm-home-cats-grid md:flex-row md:flex-wrap">
        {tiles.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSelect(cat)}
              aria-pressed={isActive}
              aria-label={`${cat} shops`}
              className={`tm-home-cat-tile${isActive ? " is-active" : ""}`}
            >
              <span
                className={`tm-home-cat-icon bg-gradient-to-br ${gradientFor(cat)}`}
                aria-hidden="true"
              >
                <span className="tm-home-cat-emoji">{iconFor(cat)}</span>
              </span>
              <span className="tm-home-cat-label">{cat === "All" ? "All" : cat}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
