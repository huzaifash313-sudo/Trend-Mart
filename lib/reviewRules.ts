/* -------------------------------------------------------------------------- */
/*  Pure review rules — pagination, name lock, anti-spam helpers              */
/* -------------------------------------------------------------------------- */

export const REVIEW_PAGE_SIZE = 8;
export const MAX_REVIEWS_PER_IP_PER_DAY = 3;
export const REVIEW_IP_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

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
