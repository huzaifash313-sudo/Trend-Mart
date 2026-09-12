/* TrendsMart — static brand marketing media (public/media) */

/** Homepage brand promo reel — muted autoplay loop (deferred; not LCP).
 *  `?v=3` after lightweight re-encode (same 1080p look, smaller file).
 */
export const BRAND_PROMO_VIDEO = "/media/brand/promo-reel.mp4?v=3";

/**
 * Lightweight poster for LCP — paints immediately via next/image.
 * Prefer a dedicated WebP in /public/media/brand when available; og-default
 * is already optimized for social + hero fallback.
 */
export const BRAND_PROMO_POSTER = "/og-default.png";
