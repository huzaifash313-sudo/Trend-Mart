/* -------------------------------------------------------------------------- */
/*  TrendsMart — Mobile performance budgets                                   */
/*  Shared caps so homepage / splash / queries stay aligned.                  */
/* -------------------------------------------------------------------------- */

/** Homepage / infinite-scroll page size for public shops. */
export const PUBLIC_SHOP_PAGE_SIZE = 24;

/** Flat catalog fetch for deals/maps (not full marketplace dump). Was 300. */
export const PUBLIC_SHOP_LIMIT = 48;

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
