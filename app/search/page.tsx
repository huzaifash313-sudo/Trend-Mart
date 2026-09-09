import { Suspense } from "react";
import type { Metadata } from "next";
import SearchResultsClient from "./SearchResultsClient";
import { absoluteUrl, SITE_NAME } from "@/lib/metadata";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const q = params.q?.trim();

  // Query result pages are thin / personalized — keep them out of the index
  // while still allowing discovery of the search entry point.
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
 */
export default function SearchPage() {
  return (
    <Suspense>
      <SearchResultsClient />
    </Suspense>
  );
}
