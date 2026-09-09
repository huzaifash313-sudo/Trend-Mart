/* -------------------------------------------------------------------------- */
/*  Shared responsive image hints for marketplace cards                        */
/*  Keep Next/Image `sizes` tight so mobile never pulls 640px for ~150px tiles */
/* -------------------------------------------------------------------------- */

/** Product / deal grid tiles (2–5 columns). */
export const PRODUCT_CARD_IMAGE_SIZES =
  "(max-width: 640px) 160px, (max-width: 1024px) 200px, 220px";

/** Horizontal home deal strip (≈ half card width on phones). */
export const HOME_DEAL_IMAGE_SIZES =
  "(max-width: 640px) 200px, (max-width: 1024px) 240px, 280px";

/** Sponsored / promo carousel cards. */
export const PROMO_CARD_IMAGE_SIZES =
  "(max-width: 640px) 92vw, (max-width: 1024px) 320px, 280px";

/** Card image quality — sharp enough on retina, light on 3G. */
export const PRODUCT_CARD_IMAGE_QUALITY = 60;
