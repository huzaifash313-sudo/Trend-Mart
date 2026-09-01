import { looksLikeProductUuid } from "@/lib/shortCode";
import { slugifyShopName } from "@/lib/shopSlug";

/** SEO slug: `{title-slug}--{deal-uuid}` (double hyphen separates id). */
export function buildDealSeoSlug(title: string, id: string): string {
  const base = slugifyShopName(title);
  return base ? `${base}--${id}` : id;
}

export function getDealSeoPath(title: string, id: string): string {
  return `/deals/${encodeURIComponent(buildDealSeoSlug(title, id))}`;
}

/** Parse `/deals/[slug]` back to a deal UUID. */
export function parseDealIdFromSlug(slug: string): string | null {
  const decoded = decodeURIComponent(slug.trim());
  if (!decoded) return null;
  if (looksLikeProductUuid(decoded)) return decoded;

  const sep = decoded.lastIndexOf("--");
  if (sep >= 0) {
    const id = decoded.slice(sep + 2);
    if (looksLikeProductUuid(id)) return id;
  }

  return null;
}
