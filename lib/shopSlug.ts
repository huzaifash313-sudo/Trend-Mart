import type { Shop } from "@/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function slugifyShopName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || "shop"
  );
}

export function generateShopSlug(name: string, id?: string | null): string {
  const base = slugifyShopName(name);
  const shortId = id?.replace(/-/g, "").slice(0, 8);
  return shortId ? `${base}-${shortId}` : base;
}

export function getShopPath(
  shop: Pick<Shop, "id" | "name"> & { slug?: string | null },
): string {
  const explicitSlug = shop.slug?.trim();
  if (explicitSlug) return `/shop/${encodeURIComponent(explicitSlug)}`;

  const generatedSlug = generateShopSlug(shop.name, shop.id);
  return `/shop/${encodeURIComponent(shop.id)}?n=${encodeURIComponent(generatedSlug)}`;
}
