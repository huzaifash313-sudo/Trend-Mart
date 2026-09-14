/* -------------------------------------------------------------------------- */
/*  Pure review rules — pagination, name lock, anti-spam helpers              */
/* -------------------------------------------------------------------------- */

export const REVIEW_PAGE_SIZE = 8;
export const MAX_REVIEWS_PER_IP_PER_DAY = 3;
export const REVIEW_IP_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Public-facing review policy bullets (UI + legal cross-link). */
export const REVIEW_POLICY_POINTS = [
  "Only verified buyers with a Delivered order can leave a review.",
  "One review per product (and one overall shop review) per account.",
  "Your display name is locked to your account — no fake names.",
  "Reviews must be honest; spam, abuse, or fake ratings may be removed.",
  "Shop owners may reply but cannot rate their own store or products.",
  "You may delete your own review; ratings then recalculate automatically.",
] as const;

export type ReviewSortMode = "newest" | "highest" | "lowest";

export function sortReviews<T extends { rating: number; created_at?: string }>(
  items: T[],
  mode: ReviewSortMode,
): T[] {
  const copy = [...items];
  if (mode === "highest") {
    copy.sort((a, b) => b.rating - a.rating || String(b.created_at).localeCompare(String(a.created_at)));
  } else if (mode === "lowest") {
    copy.sort((a, b) => a.rating - b.rating || String(b.created_at).localeCompare(String(a.created_at)));
  } else {
    copy.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }
  return copy;
}

export function filterReviewsByStars<T extends { rating: number }>(
  items: T[],
  stars: number | null,
): T[] {
  if (!stars || stars < 1 || stars > 5) return items;
  return items.filter((r) => Math.round(r.rating) === stars);
}

export function paginateReviews<T>(items: T[], page: number, pageSize = REVIEW_PAGE_SIZE) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeSize = Math.min(50, Math.max(1, pageSize));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const currentPage = Math.min(safePage, totalPages);
  const start = (currentPage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    page: currentPage,
    pageSize: safeSize,
    total,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  };
}

export function lockedDisplayName(
  fullName?: string | null,
  metadataName?: string | null,
  email?: string | null,
): string {
  const fromProfile = (fullName ?? "").trim();
  if (fromProfile.length >= 2) return fromProfile.slice(0, 60);
  const fromMeta = (metadataName ?? "").trim();
  if (fromMeta.length >= 2) return fromMeta.slice(0, 60);
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  if (local.length >= 2) return local.slice(0, 60);
  return "";
}

export function normalizePhoneDigits(phone?: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function phonesMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizePhoneDigits(a);
  const right = normalizePhoneDigits(b);
  if (!left || !right) return false;
  const aLast = left.slice(-10);
  const bLast = right.slice(-10);
  return aLast.length >= 10 && aLast === bLast;
}
