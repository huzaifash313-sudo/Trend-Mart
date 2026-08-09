/* -------------------------------------------------------------------------- */
/*  Product gallery helpers — cover + extra images                             */
/* -------------------------------------------------------------------------- */

import type { Product } from "@/types";

const MAX_PRODUCT_IMAGES = 6;

/** Normalize a product's gallery into a clean URL list (cover first). */
export function getProductImages(
  product: Pick<Product, "image_url" | "images"> | null | undefined,
): string[] {
  if (!product) return [];
  const fromGallery = Array.isArray(product.images)
    ? product.images.filter((u): u is string => typeof u === "string" && !!u.trim())
    : [];
  const cover = product.image_url?.trim() || "";
  const merged = cover
    ? [cover, ...fromGallery.filter((u) => u !== cover)]
    : fromGallery;
  // Dedupe while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of merged) {
    const t = url.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_PRODUCT_IMAGES) break;
  }
  return out;
}

/** Cap / clean a form gallery list and derive cover URL. */
export function normalizeProductGallery(urls: string[]): {
  image_url: string;
  images: string[];
} {
  const seen = new Set<string>();
  const images: string[] = [];
  for (const url of urls) {
    const t = (url ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    images.push(t);
    if (images.length >= MAX_PRODUCT_IMAGES) break;
  }
  return {
    image_url: images[0] ?? "",
    images,
  };
}

export { MAX_PRODUCT_IMAGES };
