/** Default locality when a shop has no location on file (TrendsMart home market). */
export const DEFAULT_PRODUCT_LOCALITY = "Gujranwala";

export interface ProductImageAltOptions {
  /** Zero-based gallery index */
  index?: number;
  /** Total images in the gallery */
  total?: number;
  /** Override locality (shop city/area) */
  location?: string | null;
}

/**
 * Build a non-empty, keyword-rich alt string for product images.
 * Example: "Chicken Biryani in Gujranwala — photo 2 of 4"
 */
export function buildProductImageAlt(
  productName: string,
  options?: ProductImageAltOptions,
): string {
  const name = productName.trim() || "Product";
  const locality =
    options?.location?.trim() || DEFAULT_PRODUCT_LOCALITY;
  const base = `${name} in ${locality}`;

  const index = options?.index;
  const total = options?.total;
  if (
    typeof index === "number" &&
    typeof total === "number" &&
    total > 1 &&
    index >= 0
  ) {
    return `${base} — photo ${index + 1} of ${total}`;
  }

  return base;
}

/** Alt for shop logo avatars. */
export function buildShopLogoAlt(
  shopName: string,
  location?: string | null,
): string {
  const name = shopName.trim() || "Local store";
  const locality = location?.trim() || DEFAULT_PRODUCT_LOCALITY;
  return `${name} logo — local shop in ${locality}`;
}

/** Alt for shop banner / cover images. */
export function buildShopBannerAlt(
  shopName: string,
  location?: string | null,
  category?: string | null,
): string {
  const name = shopName.trim() || "Local store";
  const locality = location?.trim() || DEFAULT_PRODUCT_LOCALITY;
  const cat = category?.trim();
  return cat
    ? `${name} — ${cat} store in ${locality}`
    : `${name} storefront in ${locality}`;
}
