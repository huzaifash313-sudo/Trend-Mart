"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Visual Category Grid Component                                 */
/*                                                                             */
/*  Renders sleek, modern grid cards for category navigation with:             */
/*   - Mobile: compact horizontal scrolling pills with gradient icon circles   */
/*   - Desktop: responsive multi-column grid layout                            */
/*   - Thumbnail/icon image at top                                             */
/*   - Category title text underneath                                         */
/*   - rounded-xl, subtle shadow, hover scaling                               */
/* -------------------------------------------------------------------------- */

import { useMemo } from "react";
import Link from "next/link";
import {
  PRODUCT_CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_GRADIENTS,
} from "@/types";
import type { CategoryWithCount } from "@/services/categoryService";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CategoryGridProps {
  /** Category objects with live shop counts */
  categories: CategoryWithCount[];
  /** Max categories to display (default: all) */
  maxItems?: number;
  /** Compact mode for sidebar / smaller screens */
  compact?: boolean;
  /** Callback when a category card is clicked (for analytics) */
  onCategoryClick?: (category: string) => void;
}

// ─── Category Card Component (Desktop Grid) ────────────────────────────────────

function CategoryCard({
  label,
  icon,
  count,
  gradient,
  compact,
  onClick,
}: {
  label: string;
  icon: string;
  count: number;
  gradient: string;
  compact: boolean;
  onClick?: () => void;
}) {
  const href = `/search?category=${encodeURIComponent(label)}`;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group block overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all duration-300 hover:shadow-xl hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:shadow-emerald-900/20 ${
        compact ? "p-3" : "p-4"
      }`}
      aria-label={`Browse ${label} — ${count} shop${count !== 1 ? "s" : ""}`}
    >
      {/* Thumbnail / Icon Banner */}
      <div
        className={`flex items-center justify-center rounded-xl bg-gradient-to-br ${gradient} mb-3 ${
          compact ? "h-16" : "h-24 sm:h-28"
        }`}
      >
        <span
          className={`select-none ${
            compact ? "text-2xl" : "text-4xl sm:text-5xl"
          }`}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>

      {/* Category Title */}
      <h3
        className={`font-semibold text-zinc-900 truncate dark:text-zinc-100 ${
          compact ? "text-xs" : "text-sm sm:text-base"
        }`}
      >
        {label}
      </h3>

      {/* Shop Count Badge */}
      <div className="mt-1 flex items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          {count}
        </span>
        <span className="text-[0.6rem] text-zinc-400 dark:text-zinc-500">
          shop{count !== 1 ? "s" : ""}
        </span>
      </div>
    </Link>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CategoryGrid({
  categories,
  maxItems,
  compact = false,
  onCategoryClick,
}: CategoryGridProps) {
  // Filter out "All" pseudo-category and apply maxItems limit
  const displayCategories = useMemo(() => {
    let filtered = categories.filter((c) => c.key !== "All");
    if (maxItems && maxItems > 0) {
      filtered = filtered.slice(0, maxItems);
    }
    return filtered;
  }, [categories, maxItems]);

  if (displayCategories.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          No categories available.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Shop categories">
      {/* Section Header */}
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <h2 className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 sm:text-sm sm:font-bold">
          Browse by Category
        </h2>
        {maxItems && displayCategories.length < categories.length - 1 && (
          <Link
            href="/search"
            className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            View All →
          </Link>
        )}
      </div>

      {/* Mobile: Horizontal Scrollable Category Cards (hidden on md+) */}
      <div className="-mx-3 flex gap-2.5 overflow-x-auto px-3 pb-2 scrollbar-none md:hidden">
        {displayCategories.map((cat) => {
          const gradient = CATEGORY_GRADIENTS[cat.key] ?? "from-gray-400 to-zinc-500";
          return (
            <Link
              key={cat.key}
              href={`/search?category=${encodeURIComponent(cat.label)}`}
              onClick={() => onCategoryClick?.(cat.label)}
              className="group flex shrink-0 items-center gap-2.5 rounded-2xl border border-zinc-200/80 bg-white px-3.5 py-2.5 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-emerald-500 active:scale-[0.98] dark:border-zinc-700/60 dark:bg-zinc-800/80"
              aria-label={`Browse ${cat.label} — ${cat.count} shop${cat.count !== 1 ? "s" : ""}`}
            >
              {/* Gradient Icon circle */}
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-sm`}
              >
                <span className="text-base leading-none" aria-hidden="true">
                  {cat.icon}
                </span>
              </div>

              {/* Text content */}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[0.7rem] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
                  {cat.label}
                </h3>
                <p className="mt-0.5 text-[0.6rem] font-medium text-zinc-400 dark:text-zinc-500">
                  {cat.count} shop{cat.count !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Chevron indicator */}
              <svg
                className="h-3.5 w-3.5 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 dark:text-zinc-600"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          );
        })}
      </div>

      {/* Desktop: Responsive Grid (hidden on mobile) */}
      <div className="hidden gap-2.5 sm:gap-3 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {displayCategories.map((cat) => (
          <CategoryCard
            key={cat.key}
            label={cat.label}
            icon={cat.icon}
            count={cat.count}
            gradient={CATEGORY_GRADIENTS[cat.key] ?? "from-gray-400 to-zinc-500"}
            compact={compact}
            onClick={() => onCategoryClick?.(cat.label)}
          />
        ))}
      </div>
    </section>
  );
}