/* -------------------------------------------------------------------------- */
/*  TrendsMart — App Review Service (localStorage)                              */
/*                                                                            */
/*  Customers can rate the TrendsMart app itself at any time, independent of   */
/*  any shop order. Stored per-device in localStorage so it always works      */
/*  offline and survives refreshes — same pattern as orders, wishlist and     */
/*  theme prefs.                                                              */
/* -------------------------------------------------------------------------- */

export interface AppReview {
  rating: number;
  comment: string;
  updatedAt: string;
}

const STORAGE_KEY = "trendsmart_app_review_v1";

const MAX_COMMENT_LENGTH = 500;

function clampRating(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 5) return 5;
  return n;
}

/** Read the current app review, or null if none has been given. */
export function getAppReview(): AppReview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppReview>;
    if (!parsed || typeof parsed.rating !== "number") return null;
    return {
      rating: clampRating(parsed.rating),
      comment:
        typeof parsed.comment === "string" ? parsed.comment.trim().slice(0, MAX_COMMENT_LENGTH) : "",
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Save (or overwrite) the user's app rating. Returns the stored record. */
export function saveAppReview(rating: number, comment: string): AppReview {
  const review: AppReview = {
    rating: clampRating(rating),
    comment: (comment ?? "").trim().slice(0, MAX_COMMENT_LENGTH),
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(review));
    } catch {
      // Storage full or disabled — review simply won't persist.
    }
  }
  return review;
}
