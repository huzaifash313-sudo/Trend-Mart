"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Customer Behaviour Memory (local, privacy-first)              */
/*                                                                             */
/*  Powers personalization without a server round-trip:                       */
/*    - Recently viewed products (a horizontal "pick up where you left off")  */
/*    - Recent searches (type-ahead / "searched before" chips)                */
/*    - Category affinity (a score per category from views / clicks /         */
/*      searches / wishlist adds / orders) — used to reorder "For You" and    */
/*      surface the categories a customer actually cares about.               */
/*                                                                             */
/*  All state lives in localStorage (no PII, no user id) — it survives         */
/*  refresh and app restarts, so a returning customer gets a personalised      */
/*  feed immediately, even before they sign in.                                */
/* -------------------------------------------------------------------------- */

import { sanitizeLight, truncate, sanitizeNumeric } from "@/lib/sanitization";
import { scopedKey } from "@/lib/clientScope";

const RECENT_VIEWS_BASE = "trendsmart_recent_views_v1";
const SEARCH_HISTORY_BASE = "trendsmart_search_history_v1";
const CATEGORY_AFFINITY_BASE = "trendsmart_category_affinity_v1";

function recentViewsKey(): string {
  return scopedKey(RECENT_VIEWS_BASE);
}
function searchHistoryKey(): string {
  return scopedKey(SEARCH_HISTORY_BASE);
}
function categoryAffinityKey(): string {
  return scopedKey(CATEGORY_AFFINITY_BASE);
}

const MAX_RECENT_VIEWS = 24;
const MAX_SEARCH_HISTORY = 12;
const MAX_AFFINITY_ENTRIES = 40;

export interface RecentlyViewedItem {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  shopId?: string;
  shopName?: string | null;
  category?: string | null;
  viewedAt: number;
}

export interface CategoryAffinity {
  category: string;
  score: number;
}

/** Interaction weights — stronger intent = higher score. */
const WEIGHTS = {
  view: 1,
  click: 2,
  search: 2,
  wishlist: 3,
  order: 5,
} as const;

/* ─── Safe read/write helpers ─────────────────────────────────────────────── */

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled — ignore */
  }
}

/* ─── Recently viewed ─────────────────────────────────────────────────────── */

export function trackProductView(input: {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  shopId?: string;
  shopName?: string | null;
  category?: string | null;
}): void {
  const id = sanitizeLight(input.id ?? "").slice(0, 100);
  if (!id) return;

  const items = readJson<RecentlyViewedItem[]>(recentViewsKey(), []);
  const next = items.filter((i) => i.id !== id);
  next.unshift({
    id,
    name: truncate(sanitizeLight(input.name ?? "Product"), 120),
    price: sanitizeNumeric(input.price, 0, 99_999_999, 0),
    imageUrl: input.imageUrl ? input.imageUrl.slice(0, 2048) : null,
    shopId: input.shopId ? sanitizeLight(input.shopId).slice(0, 100) : undefined,
    shopName: input.shopName ? truncate(sanitizeLight(input.shopName), 100) : null,
    category: input.category ? truncate(sanitizeLight(input.category), 60) : null,
    viewedAt: Date.now(),
  });
  writeJson(recentViewsKey(), next.slice(0, MAX_RECENT_VIEWS));
}

export function getRecentlyViewed(): RecentlyViewedItem[] {
  const items = readJson<RecentlyViewedItem[]>(recentViewsKey(), []);
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => i && typeof i.id === "string" && i.id.length > 0)
    .slice(0, MAX_RECENT_VIEWS);
}

/* ─── Search history ──────────────────────────────────────────────────────── */

export function trackSearch(query: string): void {
  const q = sanitizeLight(query ?? "").trim().slice(0, 100);
  if (!q) return;
  const history = readJson<string[]>(searchHistoryKey(), []);
  const next = [q, ...history.filter((h) => h.toLowerCase() !== q.toLowerCase())];
  writeJson(searchHistoryKey(), next.slice(0, MAX_SEARCH_HISTORY));
}

export function getRecentSearches(): string[] {
  const history = readJson<string[]>(searchHistoryKey(), []);
  return Array.isArray(history) ? history.slice(0, MAX_SEARCH_HISTORY) : [];
}

/* ─── Category affinity ───────────────────────────────────────────────────── */

export function trackCategoryInterest(
  category: string | null | undefined,
  weight: keyof typeof WEIGHTS = "view",
): void {
  const cat = sanitizeLight(category ?? "").trim().slice(0, 60);
  if (!cat || cat === "All") return;

  const map = readJson<Record<string, number>>(categoryAffinityKey(), {});
  const add = WEIGHTS[weight] ?? 1;
  map[cat] = (typeof map[cat] === "number" ? map[cat] : 0) + add;

  // Prune to keep the map small.
  const entries = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_AFFINITY_ENTRIES);
  writeJson(categoryAffinityKey(), Object.fromEntries(entries));
}

export function getCategoryAffinity(): CategoryAffinity[] {
  const map = readJson<Record<string, number>>(categoryAffinityKey(), {});
  return Object.entries(map)
    .filter(([, score]) => typeof score === "number" && score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, score]) => ({ category, score }));
}

/** Top N categories by affinity (used to personalise the homepage). */
export function getTopAffinityCategories(limit = 6): string[] {
  return getCategoryAffinity()
    .slice(0, limit)
    .map((a) => a.category);
}
