import type { Metadata } from "next";
import { generateNoIndexMetadata } from "@/lib/metadata";
import OfflineClient from "./OfflineClient";

export const metadata: Metadata = {
  ...generateNoIndexMetadata("You're Offline", "Trends Mart offline page."),
  robots: { index: false, follow: false },
};

/**
 * Offline fallback page served by the service worker (public/sw.js) when a
 * page navigation fails due to no network connection. Kept fully static
 * (no client-side data fetching) so it renders instantly from the cache.
 */
export default function OfflinePage() {
  return <OfflineClient />;
}
