import type { Metadata } from "next";
import ProductsPageClient from "./ProductsPageClient";
import { buildProductsListingMetadata } from "@/lib/seo/listingMetadata";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return undefined;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  return buildProductsListingMetadata({
    q: pickParam(params.q),
    category: pickParam(params.category),
  });
}

export default function ProductsPage() {
  return <ProductsPageClient />;
}
