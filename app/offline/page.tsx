import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're Offline — TrendMart",
  robots: { index: false, follow: false },
};

/**
 * Offline fallback page served by the service worker (public/sw.js) when a
 * page navigation fails due to no network connection. Kept fully static
 * (no client-side data fetching) so it renders instantly from the cache.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-[color:var(--tm-surface)]">
      <div className="mb-4 text-6xl">📡</div>
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        TrendMart couldn&apos;t reach the network. Check your connection — items already in your
        cart are safely saved on this device and will sync once you&apos;re back online.
      </p>
      {/* Intentional hard navigation (not next/link) — forces a real network
          request so the browser/service worker can re-check connectivity,
          rather than a client-side route transition that would silently
          no-op while offline. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        Try Again
      </a>
    </div>
  );
}
