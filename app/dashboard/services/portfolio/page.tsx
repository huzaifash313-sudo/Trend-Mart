"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Service Portfolio Dashboard Page (Prompt 4)                     */
/*                                                                             */
/*  Dedicated dashboard page where electricians, AC technicians, camera        */
/*  installers, and other service professionals can manage their before/after  */
/*  project portfolios. Integrates the ServicePortfolioManager component.      */
/* -------------------------------------------------------------------------- */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchMyShop } from "@/services/shopService";
import ServicePortfolioManager from "@/components/ServicePortfolioManager";
import { ErrorState } from "@/components/ErrorState";
import type { Shop } from "@/types";

function SpinnerIcon() {
  return (
    <svg className="h-8 w-8 animate-spin text-orange-600" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function ServicePortfolioPage() {
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const result = await fetchMyShop();
      if (cancelled) return;

      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.data === null) {
        router.push("/dashboard");
        return;
      }

      // Only service-type shops should access this page
      if (result.data.shop_type !== "service") {
        router.push("/dashboard/products");
        return;
      }

      setShop(result.data);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [router]);

  // ── Loading State ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-3">
          <div className="flex justify-center"><SpinnerIcon /></div>
          <p className="text-sm text-zinc-500">Loading portfolio manager...</p>
        </div>
      </div>
    );
  }

  // ── Error State ─────────────────────────────────────────────────────────

  if (error) {
    return (
      <ErrorState
        title="Failed to load"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // ── No shop (should redirect, fallback UI) ─────────────────────────────

  if (!shop) {
    return (
      <ErrorState
        title="No shop found"
        message="Create a service shop before managing your portfolio."
        onRetry={() => router.push("/dashboard")}
      />
    );
  }

  // ── Dashboard Layout ───────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Dashboard
        </button>
        <span>/</span>
        <button
          type="button"
          onClick={() => router.push("/dashboard/services")}
          className="hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Services
        </button>
        <span>/</span>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">Portfolio</span>
      </div>

      {/* Shop context banner */}
      <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
        <h1 className="text-lg font-bold text-orange-800 dark:text-orange-200">
          {shop.name} — Portfolio
        </h1>
        <p className="text-sm text-orange-600 dark:text-orange-400">
          📍 {shop.location} · {shop.category}
        </p>
      </div>

      {/* Portfolio Manager */}
      <ServicePortfolioManager shopId={shop.id} />

      {/* Tips Card */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-800/50">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">💡 Portfolio Tips</h3>
        <ul className="mt-2 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <li>• Add <strong>before and after</strong> photos to visually demonstrate your expertise.</li>
          <li>• Include <strong>client testimonials</strong> — genuine reviews build trust.</li>
          <li>• Keep project descriptions <strong>brief and specific</strong> (mention brands, models, special techniques).</li>
          <li>• Published items appear directly on your public storefront for potential customers.</li>
          <li>• You can toggle visibility anytime — hide works-in-progress until complete.</li>
        </ul>
      </div>
    </div>
  );
}
