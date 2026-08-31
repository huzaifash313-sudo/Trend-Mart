/* -------------------------------------------------------------------------- */
/*  Story “seen” tracking — unseen rings first, viewed move to the end        */
/* -------------------------------------------------------------------------- */

import type { Story } from "@/types";

const STORAGE_KEY = "trendsmart_viewed_stories";
const VIEWER_KEY_STORAGE = "trendsmart_story_viewer_key";
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

/**
 * Stable anonymous viewer id for unique story-view counting.
 * Prefer auth uid when available (passed in); otherwise a local UUID.
 */
export function getOrCreateStoryViewerKey(authUserId?: string | null): string {
  if (authUserId && authUserId.length >= 8) return authUserId;
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(VIEWER_KEY_STORAGE);
    if (existing && existing.length >= 8) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VIEWER_KEY_STORAGE, id);
    return id;
  } catch {
    return `anon-${Date.now().toString(36)}`;
  }
}

/** Compact view count for badges (12 → "12", 1200 → "1.2k"). */
export function formatStoryViewCount(count: number | null | undefined): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
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
