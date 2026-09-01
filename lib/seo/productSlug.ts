import { isShortCode, looksLikeProductUuid } from "@/lib/shortCode";
import { slugifyShopName } from "@/lib/shopSlug";

/** SEO-friendly slug: `{product-name}-{short_code}` or product UUID fallback. */
export function buildProductSeoSlug(
  name: string,
  shortCode: string | null | undefined,
  id: string,
): string {
  const code = shortCode?.trim();
  if (code) {
    const nameSlug = slugifyShopName(name);
    return nameSlug ? `${nameSlug}-${code}` : code;
  }
  return id;
}

/** Canonical public product path for search engines. */
export function getProductSeoPath(
  name: string,
  shortCode: string | null | undefined,
  id: string,
): string {
  return `/products/${encodeURIComponent(buildProductSeoSlug(name, shortCode, id))}`;
}

export type ProductSlugReference =
  | { kind: "uuid"; value: string }
  | { kind: "short_code"; value: string };

/**
 * Parse `/products/[slug]` or sitemap slug segments back to a DB lookup key.
 * Supports full UUIDs, bare short codes, and `{name-slug}-{shortCode}` URLs.
 */
export function resolveProductSlugReference(slug: string): ProductSlugReference {
  const decoded = decodeURIComponent(slug.trim());
  if (!decoded) return { kind: "short_code", value: "" };

  if (looksLikeProductUuid(decoded)) {
    return { kind: "uuid", value: decoded };
  }

  const dashIdx = decoded.lastIndexOf("-");
  if (dashIdx > 0) {
    const tail = decoded.slice(dashIdx + 1);
    if (isShortCode(tail) && tail.length >= 6) {
      return { kind: "short_code", value: tail };
    }
  }

  if (isShortCode(decoded)) {
    return { kind: "short_code", value: decoded };
  }

  return { kind: "short_code", value: decoded };
}

/** Resolve `/p/[code]` references (UUID or short code). */
export function resolveProductCodeReference(code: string): ProductSlugReference {
  const decoded = decodeURIComponent(code.trim());
  if (looksLikeProductUuid(decoded)) {
    return { kind: "uuid", value: decoded };
  }
  return { kind: "short_code", value: decoded };
}
