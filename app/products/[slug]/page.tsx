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
      {/* Indexable HTML for crawlers — compact so it doesn't fight the client UI. */}
      <div className="mx-auto w-full max-w-lg px-3 pt-3">
        <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {product.name}
        </h1>
        {product.description ? (
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {product.description}
          </p>
        ) : null}
        <p className="mt-1.5 text-base font-bold text-emerald-600 dark:text-emerald-400">
          {formatRupees(product.price)}
          {typeof original === "number" && original > product.price ? (
            <span className="ml-2 text-sm font-normal text-zinc-400 line-through">
              {formatRupees(original)}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          From{" "}
          <Link
            href={shopHref}
            className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            {product.shop.name}
          </Link>
          {product.shop.location ? ` · ${product.shop.location}` : ""}
          {" · "}
          <span className="text-zinc-400">TrendsMart</span>
        </p>
      </div>
      <ProductDetailClient code={lookupCode} suppressHeading />
    </>
  );
}
