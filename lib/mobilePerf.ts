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

/** Products loaded with a shop storefront detail page. */
export const SHOP_STOREFRONT_PRODUCT_LIMIT = 48;

/** Client fuzzy search pool per query leg (was 250). */
export const MARKETPLACE_SEARCH_POOL = 96;

/** Keep at most this many product cards mounted while infinite-scrolling. */
export const MAX_MOUNTED_PRODUCTS = 96;

/** Virtualize grids once item count exceeds this. */
export const VIRTUALIZE_AFTER = 24;
