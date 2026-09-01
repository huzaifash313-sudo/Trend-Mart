import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetailClient from "@/components/product/ProductDetailClient";
import ProductStructuredData from "@/components/seo/ProductStructuredData";
import { fetchProductForSeoBySlug } from "@/lib/seo/fetchProductForSeo";
import { generateProductSlugMetadata } from "@/lib/seo/productMetadata";

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

  return (
    <>
      <ProductStructuredData product={product} />
      <ProductDetailClient code={lookupCode} />
    </>
  );
}
