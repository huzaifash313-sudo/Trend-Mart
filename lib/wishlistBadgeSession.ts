/* -------------------------------------------------------------------------- */
/*  Session wishlist badge — count stays in wishlist; nav badge clears on view */
/* -------------------------------------------------------------------------- */

const SEEN_KEY = "tm_wishlist_badge_seen";
export const WISHLIST_BADGE_EVENT = "tm:wishlist-badge";

function emit(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(WISHLIST_BADGE_EVENT));
  } catch {
    /* ignore */
  }
}

export function getWishlistBadgeSeen(): number {
  if (typeof window === "undefined") return 0;
  try {
    const n = Number(sessionStorage.getItem(SEEN_KEY) ?? "0");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** Call when user opens wishlist — badge hides until count grows again. */
export function markWishlistBadgeSeen(count: number): void {
  if (typeof window === "undefined") return;
  const safe = Math.max(0, Math.floor(Number(count) || 0));
  try {
    sessionStorage.setItem(SEEN_KEY, String(safe));
    emit();
  } catch {
    /* ignore */
  }
}

/**
 * Keep seen ≤ current when items are removed so the next add shows a badge.
 * First visit this tab: baseline to current (no badge until a *new* save).
 * Returns how many “new” items to show on the icon (0 = hide badge).
 */
export function syncWishlistBadgeDelta(currentCount: number): number {
  const current = Math.max(0, Math.floor(Number(currentCount) || 0));
  if (typeof window !== "undefined") {
    try {
      if (sessionStorage.getItem(SEEN_KEY) === null) {
        sessionStorage.setItem(SEEN_KEY, String(current));
        return 0;
      }
    } catch {
      /* ignore */
    }
  }
  let seen = getWishlistBadgeSeen();
  if (current < seen) {
    markWishlistBadgeSeen(current);
    seen = current;
  }
  return Math.max(0, current - seen);
}
