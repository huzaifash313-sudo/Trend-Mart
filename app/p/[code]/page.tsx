import { redirect, notFound } from "next/navigation";
import { fetchProductForSeoByCode } from "@/lib/seo/fetchProductForSeo";
import { getProductSeoPath } from "@/lib/seo/productSlug";

/**
 * Short links `/p/[code]` always 308 to the canonical SEO product URL so
 * Google consolidates ranking signals on `/products/[slug]`.
 */
export default async function ProductShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const product = await fetchProductForSeoByCode(decodeURIComponent(code));
  if (!product) {
    notFound();
  }
  redirect(getProductSeoPath(product.name, product.short_code, product.id));
}
