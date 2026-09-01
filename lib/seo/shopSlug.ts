import { generateShopSlug, getShopPath, isUuid } from "@/lib/shopSlug";

/** Canonical public shop path (slug preferred, else id). */
export function getShopSeoPath(
  shop: { id: string; name: string; slug?: string | null },
): string {
  return getShopPath(shop);
}

/** Resolve `/shop/[idOrSlug]` segment to lookup strategy. */
export function resolveShopReference(idOrSlug: string): {
  kind: "uuid" | "slug";
  value: string;
} {
  const decoded = decodeURIComponent(idOrSlug.trim());
  if (isUuid(decoded)) {
    return { kind: "uuid", value: decoded };
  }
  return { kind: "slug", value: decoded };
}

export { generateShopSlug, isUuid };
