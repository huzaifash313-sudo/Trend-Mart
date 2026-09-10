import type { Metadata } from "next";
import SearchResultsClient from "./SearchResultsClient";
import { absoluteUrl, SITE_NAME } from "@/lib/metadata";

type PageProps = {
  searchParams: Promise<{ q?: string; type?: string }>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const q = params.q?.trim();

  if (q) {
    return {
      title: `Search: "${q}"`,
      description: `Results for "${q}" on ${SITE_NAME} — products, shops, and deals from local stores.`,
      robots: { index: false, follow: true },
      alternates: { canonical: absoluteUrl("/search") },
      openGraph: {
        title: `Search: "${q}" — ${SITE_NAME}`,
        description: `Find "${q}" across local shops on ${SITE_NAME}.`,
        url: absoluteUrl(`/search?q=${encodeURIComponent(q)}`),
      },
    };
  }

  return {
    title: "Search",
    description: `Search products, shops, and deals across ${SITE_NAME}.`,
    robots: { index: false, follow: true },
    alternates: { canonical: absoluteUrl("/search") },
  };
}

/**
 * Unified search results page — products, shops, and deals from /api/search.
 * URL state comes from the server so first paint is not blocked by Suspense.
 */
export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const typeRaw = params.type?.trim() ?? "all";
  const initialType =
    typeRaw === "products" || typeRaw === "product"
      ? "products"
      : typeRaw === "shops" || typeRaw === "shop"
        ? "shops"
        : typeRaw === "deals" || typeRaw === "deal"
          ? "deals"
          : "all";

  return <SearchResultsClient initialQ={q} initialType={initialType} />;
}
