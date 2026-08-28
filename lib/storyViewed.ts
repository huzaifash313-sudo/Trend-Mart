/* -------------------------------------------------------------------------- */
/*  Story “seen” tracking — unseen rings first, viewed move to the end        */
/* -------------------------------------------------------------------------- */

import type { Story } from "@/types";

const STORAGE_KEY = "trendmart_viewed_stories";
/** Keep viewed IDs roughly for story lifetime (24h) + buffer */
const MAX_AGE_MS = 36 * 60 * 60 * 1000;

type ViewedMap = Record<string, number>; // storyId → viewedAt ms

function readMap(): ViewedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    const out: ViewedMap = {};
    for (const [id, ts] of Object.entries(parsed as ViewedMap)) {
      if (typeof ts === "number" && now - ts < MAX_AGE_MS) out[id] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: ViewedMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* no-op */
  }
}

export function isStoryViewed(storyId: string): boolean {
  return !!readMap()[storyId];
}

export function getViewedStoryIds(): Set<string> {
  return new Set(Object.keys(readMap()));
}

/** Mark a story as viewed (moves to end of tray after refresh). */
export function markStoryViewed(storyId: string): void {
  if (!storyId) return;
  const map = readMap();
  map[storyId] = Date.now();
  writeMap(map);
  try {
    window.dispatchEvent(new CustomEvent("storiesViewedUpdated"));
  } catch {
    /* no-op */
  }
}

/** Unseen first (newest among unseen), then viewed (newest among viewed).
 *  Accepts an optional server/hydration-safe viewed set — pass it from React
 *  state so SSR and the first client render agree (no localStorage during
 *  render). */
export function sortStoriesUnseenFirst(
  stories: Story[],
  viewedIds?: ReadonlySet<string>,
): Story[] {
  const viewed = viewedIds ?? getViewedStoryIds();
  const unseen = stories
    .filter((s) => !viewed.has(s.id))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const seen = stories
    .filter((s) => viewed.has(s.id))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  return [...unseen, ...seen];
}
