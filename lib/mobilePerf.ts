/* -------------------------------------------------------------------------- */
/*  TrendsMart — Mobile performance budgets                                   */
/*  Shared caps so homepage / splash / queries stay aligned.                  */
/*  Also: free-tier + low-RAM (≈2 GB) device gates so Soft-launch stays smooth */
/*  without gutting merchant/customer realtime where it matters.              */
/* -------------------------------------------------------------------------- */

/** Homepage / infinite-scroll page size for public shops. */
export const PUBLIC_SHOP_PAGE_SIZE = 24;

/** Flat catalog fetch for deals/maps (not full marketplace dump). Was 300. */
export const PUBLIC_SHOP_LIMIT = 48;

/**
 * Nearby / city geo candidate pool — large enough that “Nearest” isn’t limited
 * to the first alphabetical/rating page of infinite scroll.
 */
export const GEO_SHOP_CANDIDATE_LIMIT = 96;

/** Active stories seed for homepage tray. */
export const PUBLIC_STORY_LIMIT = 48;

/** First page of products on a shop storefront (load-more continues). */
export const SHOP_STOREFRONT_PRODUCT_LIMIT = 24;

/** Client fuzzy search pool per query leg (was 250). */
export const MARKETPLACE_SEARCH_POOL = 96;

/**
 * @deprecated Prefer VirtualizedGrid windowing — do not tail-slice lists
 * (that jumps scroll). Kept for any legacy callers.
 */
export const MAX_MOUNTED_PRODUCTS = 96;

/** Virtualize grids once item count exceeds this (lower = smoother mobile). */
export const VIRTUALIZE_AFTER = 12;

/* ── Free-tier / soft-launch caps ─────────────────────────────────────────── */

/** Analytics log retention (days) — protects Free 500 MB DB. */
export const ANALYTICS_RETENTION_DAYS = 30;

/** Dedupe window for product_click per browser (ms). */
export const PRODUCT_CLICK_DEDUPE_MS = 10 * 60 * 1000;

/**
 * Keep this fraction of product_click events (0–1). Shop views stay fully
 * counted (already 45-min deduped). Cuts analytics_logs + trigger writes.
 */
export const PRODUCT_CLICK_SAMPLE_RATE = 0.35;

/** Newest chat messages per thread open (was 500 oldest). */
export const CHAT_MESSAGE_PAGE_SIZE = 80;

/** Soft cap when geo falls back to a DB fetch. */
export const GEO_SHOP_FETCH_CAP = 96;

/** Dashboard analytics: max orders in the selected time window. */
export const ANALYTICS_ORDERS_CAP = 400;

/** Dashboard analytics: max products for click_count / top-N. */
export const ANALYTICS_PRODUCTS_CAP = 200;

/* ── Low-end device detection (2 GB RAM phones) ──────────────────────────── */

type NavWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
  hardwareConcurrency?: number;
};

/** True on ≈2 GB RAM phones, Save-Data, 2G, or very weak CPU. */
export function isLowEndDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const nav = navigator as NavWithHints;
    if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory <= 2) {
      return true;
    }
    if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) {
      // Weak CPU alone isn't enough on desktop; combine with coarse pointer / narrow view.
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const narrow = window.matchMedia("(max-width: 640px)").matches;
      if (coarse && narrow && nav.hardwareConcurrency <= 4) {
        // Many 2–3 GB Androids report 4–8 cores; deviceMemory is the stronger signal.
        // Only treat ≤2 cores as low-end without deviceMemory.
        if (nav.hardwareConcurrency <= 2) return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Skip autoplay video, marquees, and other decode-heavy chrome. */
export function shouldSkipHeavyMedia(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  } catch {
    /* ignore */
  }
  try {
    const c = (navigator as NavWithHints).connection;
    if (c?.saveData || c?.effectiveType === "slow-2g" || c?.effectiveType === "2g") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return isLowEndDevice();
}

/** Tighter LazyMount prefetch on weak phones (fewer early mounts). */
export function getLazyMountRootMargin(): string {
  return shouldSkipHeavyMedia() ? "160px 0px" : "400px 0px";
}

/** Infinite-scroll sentinel prefetch distance. */
export function getFeedSentinelRootMargin(): string {
  return shouldSkipHeavyMedia() ? "120px 0px" : "320px 0px";
}

/** How many shop feed chunks to keep mounted (unused — grids stay virtualized). */
export function getMaxMountedFeedChunks(): number {
  return shouldSkipHeavyMedia() ? 2 : 6;
}
