import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductDetailClient from "@/components/product/ProductDetailClient";
import ProductStructuredData from "@/components/seo/ProductStructuredData";
import { fetchProductForSeoBySlug } from "@/lib/seo/fetchProductForSeo";
import { generateProductSlugMetadata } from "@/lib/seo/productMetadata";
import { getShopPath } from "@/lib/shopSlug";
import { formatRupees } from "@/lib/formatters";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return generateProductSlugMetadata(decodeURIComponent(slug));
}

export default async function ProductSeoPage({ params }: PageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const product = await fetchProductForSeoBySlug(decodedSlug);

  if (!product) {
    notFound();
  }

  const lookupCode = product.short_code?.trim() || product.id;
  const shopHref = getShopPath({
    id: product.shop.id,
    name: product.shop.name,
    slug: product.shop.slug,
  });
  const original =
    product.original_price ?? product.compare_at_price ?? null;

  return (
    <>
      <ProductStructuredData product={product} />
      {/* Crawlable copy — visually hidden so it doesn't duplicate the client UI. */}
      <div className="sr-only">
        <h1>{product.name}</h1>
        {product.description ? <p>{product.description}</p> : null}
        <p>
          {formatRupees(product.price)}
          {typeof original === "number" && original > product.price
            ? ` (was ${formatRupees(original)})`
            : ""}
        </p>
        <p>
          From{" "}
          <Link href={shopHref}>{product.shop.name}</Link>
          {product.shop.location ? ` · ${product.shop.location}` : ""}
          {" · TrendsMart"}
        </p>
      </div>
      <ProductDetailClient code={lookupCode} />
    </>
  );
}
