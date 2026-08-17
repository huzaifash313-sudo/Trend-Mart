"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMyShop } from "@/services/shopService";

/* -------------------------------------------------------------------------- */
/*  Dashboard → Storefront redirect                                            */
/*                                                                             */
/*  Clicking "Dashboard" now drops the merchant straight onto their live       */
/*  storefront (owner mode), where they can manage profile, coupons, deals     */
/*  and products in one place — no separate dashboard to bounce between.       */
/*  Analytics lives at /dashboard/analytics.                                   */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchMyShop();
      if (cancelled) return;

      if (result.success) {
        if (result.data) {
          router.replace(`/shop/${result.data.id}`);
        } else {
          router.replace("/account/become-merchant");
        }
        return;
      }

      setError(result.error || "Could not load your store.");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      {error ? (
        <div className="text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 text-xs font-semibold text-emerald-600 underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      )}
    </div>
  );
}
