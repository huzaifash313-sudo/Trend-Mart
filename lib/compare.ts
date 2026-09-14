"use client";

/**
 * Product compare tray — max 3 products, same category only (local).
 */

import { scopedKey } from "@/lib/clientScope";

const KEY = "trendsmart_compare_v1";
export const COMPARE_MAX = 3;

export interface CompareItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  imageUrl?: string | null;
  shopId?: string;
  shopName?: string | null;
  avgRating?: number | null;
  reviewCount?: number | null;
  /** Display label (shop type or category name). */
  category?: string | null;
  /**
   * Stable key for same-category gate.
   * Prefer product category_id, then sub_category_id, then shop category string.
   */
  categoryKey?: string | null;
  href?: string;
  addedAt: number;
}

function storageKey() {
  return scopedKey(KEY);
}

function normalizeCategoryKey(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function resolveCompareCategoryKey(opts: {
  categoryId?: string | null;
  subCategoryId?: string | null;
  shopCategory?: string | null;
  category?: string | null;
}): string {
  const id = (opts.categoryId ?? "").trim();
  if (id) return `cat:${id.toLowerCase()}`;
  const sub = (opts.subCategoryId ?? "").trim();
  if (sub) return `sub:${sub.toLowerCase()}`;
  const shop = (opts.shopCategory ?? opts.category ?? "").trim();
  if (shop) return `shop:${shop.toLowerCase()}`;
  return "";
}

function read(): CompareItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const arr = JSON.parse(raw) as CompareItem[];
    return Array.isArray(arr) ? arr.slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}

function write(items: CompareItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(items.slice(0, COMPARE_MAX)));
    window.dispatchEvent(new CustomEvent("trendsmart:compare-changed"));
  } catch {
    /* ignore */
  }
}

export function getCompareItems(): CompareItem[] {
  return read();
}

export function isInCompare(id: string): boolean {
  return read().some((x) => x.id === id);
}

export function toggleCompare(item: Omit<CompareItem, "addedAt">): {
  ok: boolean;
  items: CompareItem[];
  error?: string;
} {
  const list = read();
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    write(list);
    return { ok: true, items: list };
  }
  if (list.length >= COMPARE_MAX) {
    return {
      ok: false,
      items: list,
      error: `Compare max ${COMPARE_MAX} products — remove one first`,
    };
  }

  const nextKey = normalizeCategoryKey(item.categoryKey || item.category);
  if (list.length > 0) {
    const existingKey = normalizeCategoryKey(
      list[0].categoryKey || list[0].category,
    );
    if (!nextKey || !existingKey || nextKey !== existingKey) {
      return {
        ok: false,
        items: list,
        error: "Compare only works within the same category",
      };
    }
  }

  const next = [
    ...list,
    {
      ...item,
      categoryKey: item.categoryKey || item.category || null,
      addedAt: Date.now(),
    },
  ];
  write(next);
  return { ok: true, items: next };
}

export function removeFromCompare(id: string): CompareItem[] {
  const next = read().filter((x) => x.id !== id);
  write(next);
  return next;
}

export function clearCompare(): void {
  write([]);
}

/**
 * Relative 0–100 score within the current compare set.
 * Higher = better value overall (price, rating, reviews, discount).
 */
export function scoreCompareItems(items: CompareItem[]): Map<string, number> {
  const scores = new Map<string, number>();
  if (items.length === 0) return scores;
  if (items.length === 1) {
    scores.set(items[0].id, 80);
    return scores;
  }

  const prices = items.map((i) => Math.max(0, i.price));
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const ratings = items.map((i) => Math.max(0, Number(i.avgRating) || 0));
  const maxR = Math.max(...ratings, 1);
  const reviews = items.map((i) => Math.max(0, Number(i.reviewCount) || 0));
  const maxRev = Math.max(...reviews, 1);

  const raw = items.map((i) => {
    const priceNorm =
      maxP <= minP ? 1 : (maxP - i.price) / Math.max(0.01, maxP - minP);
    const ratingNorm = (Number(i.avgRating) || 0) / maxR;
    const reviewNorm = Math.min(1, (Number(i.reviewCount) || 0) / maxRev);
    const disc =
      i.originalPrice && i.originalPrice > i.price
        ? Math.min(1, (i.originalPrice - i.price) / i.originalPrice)
        : 0;
    // Price 40%, rating 35%, reviews 15%, discount 10%
    const s =
      priceNorm * 40 + ratingNorm * 35 + reviewNorm * 15 + disc * 10;
    return { id: i.id, s };
  });

  const minS = Math.min(...raw.map((r) => r.s));
  const maxS = Math.max(...raw.map((r) => r.s));
  for (const r of raw) {
    const scaled =
      maxS <= minS
        ? 75
        : Math.round(55 + ((r.s - minS) / (maxS - minS)) * 40);
    scores.set(r.id, Math.max(50, Math.min(99, scaled)));
  }
  return scores;
}

export function bestCompareId(items: CompareItem[]): string | null {
  if (items.length < 2) return null;
  const scores = scoreCompareItems(items);
  let best: string | null = null;
  let bestScore = -1;
  for (const i of items) {
    const s = scores.get(i.id) ?? 0;
    if (s > bestScore) {
      bestScore = s;
      best = i.id;
    }
  }
  return best;
}
