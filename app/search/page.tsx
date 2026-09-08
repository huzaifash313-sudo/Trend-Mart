import { Suspense } from "react";
import type { Metadata } from "next";
import SearchResultsClient from "./SearchResultsClient";

export const metadata: Metadata = {
  title: "Search — TrendsMart",
  description: "Search products, shops, and deals across TrendsMart.",
};

/**
 * Unified search results page — replaces the old redirect-only stub.
 * Shows products, shops, and deals from a single API call (/api/search).
 */
export default function SearchPage() {
  return (
    <Suspense>
      <SearchResultsClient />
    </Suspense>
  );
}
