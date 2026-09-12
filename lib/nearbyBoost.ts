/* Soft nearby ranking + compact area labels — discovery UX without hard filters. */

import { formatDistance } from "@/services/geoRadiusService";

/** Higher = prefer earlier in feed. Far / unknown shops stay visible (score 0). */
export function softNearbyBoostScore(distanceKm: number | null | undefined): number {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  if (distanceKm <= 5) return 4;
  if (distanceKm <= 12) return 3;
  if (distanceKm <= 25) return 2;
  if (distanceKm <= 50) return 1;
  return 0;
}

/**
 * Stable soft-rank: nearby first within each boost band, then keep relative order.
 * Does NOT remove far shops — only reorders.
 */
export function sortWithNearbyBoost<T>(
  items: T[],
  getDistanceKm: (item: T) => number | null | undefined,
): T[] {
  if (items.length < 2) return items;
  return items
    .map((item, index) => ({
      item,
      index,
      boost: softNearbyBoostScore(getDistanceKm(item)),
      dist: getDistanceKm(item),
    }))
    .sort((a, b) => {
      if (b.boost !== a.boost) return b.boost - a.boost;
      const da = a.dist != null && Number.isFinite(a.dist) ? a.dist : Number.POSITIVE_INFINITY;
      const db = b.dist != null && Number.isFinite(b.dist) ? b.dist : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.index - b.index;
    })
    .map((row) => row.item);
}

/** First city/area token for a compact chip (keeps cards tidy). */
export function shortAreaLabel(location: string | null | undefined): string | null {
  const raw = (location ?? "").trim();
  if (!raw) return null;
  const first = (raw.split(",")[0] ?? raw).trim();
  if (!first) return null;
  return first.length > 18 ? `${first.slice(0, 16)}…` : first;
}

/**
 * One short hint for cards: prefer distance when known, else city/area text.
 * Returns null when nothing useful — caller should hide the chip.
 */
export function locationHintLabel(
  distanceKm: number | null | undefined,
  locationText?: string | null,
): string | null {
  if (distanceKm != null && Number.isFinite(distanceKm) && distanceKm >= 0) {
    return formatDistance(distanceKm);
  }
  return shortAreaLabel(locationText);
}
