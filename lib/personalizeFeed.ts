/* -------------------------------------------------------------------------- */
/*  Client-side For You personalization (affinity + freshness + demotion)     */
/*  Soft-rank only — never removes items from the feed.                       */
/* -------------------------------------------------------------------------- */

import type { MarketplaceProduct } from "@/types";
import {
  getCategoryAffinity,
  getRecentlyViewed,
  getRecentSearches,
} from "@/lib/behavior";

/** Day+hour bucket so a hard refresh mid-day still feels a bit fresh. */
export function feedRotationSalt(now = Date.now()): number {
  const d = new Date(now);
  return d.getFullYear() * 1e6 + (d.getMonth() + 1) * 1e4 + d.getDate() * 100 + d.getHours();
}

function hashMix(id: string, salt: number): number {
  let h = salt >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x9e3779b1);
  }
  return (h >>> 0) % 1000;
}

/**
 * Re-rank a For You list using local behaviour:
 *  - Boost categories the shopper searched / viewed / ordered
 *  - Soft-demote products only viewed (not ordered) so ignored items sink
 *  - Light rotation salt so refresh isn't a frozen catalog
 */
export function personalizeForYouFeed<T extends MarketplaceProduct>(
  items: T[],
  opts?: { now?: number },
): T[] {
  if (items.length < 2) return items;

  const now = opts?.now ?? Date.now();
  const salt = feedRotationSalt(now);
  const affinity = getCategoryAffinity();
  const maxAff = Math.max(1, ...affinity.map((a) => a.score), 1);
  const affMap = new Map(affinity.map((a) => [a.category.toLowerCase(), a.score / maxAff]));

  const searches = getRecentSearches().map((s) => s.toLowerCase());
  const recent = getRecentlyViewed();
  // Viewed once and not re-engaged in last 6h → soft demote (ignored).
  const demote = new Map<string, number>();
  for (const v of recent) {
    const ageH = (now - (v.viewedAt || 0)) / 3_600_000;
    if (ageH < 0.15) continue; // just looked — keep near top briefly
    if (ageH > 72) continue;
    // Older views sink more; recent-but-ignored sink a bit
    const sink = ageH < 6 ? 18 : ageH < 24 ? 28 : 12;
    demote.set(v.id, Math.max(demote.get(v.id) ?? 0, sink));
  }

  return items
    .map((item, index) => {
      const cat = (item.shop_category || "").toLowerCase();
      const affBoost = (affMap.get(cat) ?? 0) * 40;

      const name = `${item.name || ""}`.toLowerCase();
      let searchBoost = 0;
      for (const q of searches) {
        if (q.length >= 2 && (name.includes(q) || cat.includes(q))) {
          searchBoost = Math.max(searchBoost, 22);
        }
      }

      const sink = demote.get(item.id) ?? 0;
      const rotate = hashMix(item.id, salt) / 1000; // 0–1 jitter
      const score = affBoost + searchBoost - sink + rotate * 8;

      return { item, index, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((r) => r.item);
}
