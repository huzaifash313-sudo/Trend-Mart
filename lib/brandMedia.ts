/* TrendsMart — static brand marketing media (public/media) */

/** Homepage brand promo reel — muted autoplay loop (deferred; not LCP).
 *  `?v=3` after lightweight re-encode (same 1080p look, smaller file).
 */
export const BRAND_PROMO_VIDEO = "/media/brand/promo-reel.mp4?v=3";

/**
 * First frame of the promo reel — matches playback after intro skip.
 * No query string: next/image localPatterns reject `?v=` on local paths.
 */
export const BRAND_PROMO_POSTER = "/media/brand/promo-poster.webp";
