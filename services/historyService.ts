/* -------------------------------------------------------------------------- */
/*  TrendsMart — Browsing History Service (localStorage)                        */
/*  Automatically tracks up to the last 5 viewed shop profiles and products.   */
/* -------------------------------------------------------------------------- */

import { scopedKey } from "@/lib/clientScope";

const STORAGE_BASE = "trendsmart_history";
const MAX_ITEMS = 5;

function storageKey(): string {
  return scopedKey(STORAGE_BASE);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrowsingHistoryItem {
  id: string;
  type: "shop" | "product";
  name: string;
  /** The shop's name (if this is a product, we store the parent shop name). */
  shopName?: string;
  /** Optional thumbnail / logo URL for display purposes. */
  imageUrl?: string;
  /** The shop ID (product items link through their parent shop). */
  shopId?: string;
  viewedAt: number; // timestamp
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAll(): BrowsingHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? (JSON.parse(raw) as BrowsingHistoryItem[]) : [];
  } catch {
    return [];
  }
}

function saveAll(items: BrowsingHistoryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(items));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Record a view event for a shop or product.
 * Automatically keeps only the last `MAX_ITEMS` unique items.
 * If the same item already exists, it's moved to the front.
 */
export function recordView(item: Omit<BrowsingHistoryItem, "viewedAt">): void {
  const items = getAll();

  // Remove existing entry for the same id
  const filtered = items.filter((i) => i.id !== item.id);

  // Add to front
  filtered.unshift({
    ...item,
    viewedAt: Date.now(),
  });

  // Keep only the last MAX_ITEMS
  saveAll(filtered.slice(0, MAX_ITEMS));
}

/**
 * Get the most recently viewed items, newest first.
 */
export function getHistory(): BrowsingHistoryItem[] {
  return getAll().sort((a, b) => b.viewedAt - a.viewedAt);
}

/**
 * Get the count of browsing history entries.
 */
export function getHistoryCount(): number {
  return getAll().length;
}

/**
 * Remove a specific item by id.
 */
export function removeFromHistory(id: string): void {
  const items = getAll().filter((item) => item.id !== id);
  saveAll(items);
}

/**
 * Clear all browsing history.
 */
export function clearHistory(): void {
  saveAll([]);
}