import Link from "next/link";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Custom 404 (not-found)                                        */
/*  Replaces Next's unstyled default with a branded, actionable page.         */
/* -------------------------------------------------------------------------- */

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-7xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
        404
      </p>
      <h1 className="mt-3 text-xl font-bold text-zinc-900 dark:text-zinc-100">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        The page you&apos;re looking for may have moved or no longer exists.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Go to homepage
        </Link>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          Browse products
        </Link>
      </div>
    </div>
  );
}
