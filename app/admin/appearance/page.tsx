"use client";

import BrandThemeAdminPanel from "@/components/admin/BrandThemeAdminPanel";

export default function AdminAppearancePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Super Admin
        </p>
        <h1 className="tm-font-display mt-1 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          Appearance
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Platform brand colors for the entire TrendsMart UI. Layout stays the same — only the
          color system changes.
        </p>
      </header>

      <BrandThemeAdminPanel />
    </div>
  );
}
