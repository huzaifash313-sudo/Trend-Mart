"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMyShop } from "@/services/shopService";
import { fetchMyDineInShop } from "@/services/dineInService";

/* -------------------------------------------------------------------------- */
/*  Dashboard → Storefront redirect                                            */
/*                                                                             */
/*  Clicking "Dashboard" drops the merchant onto their live storefront        */
/*  (owner mode). When the user owns multiple shops (e.g. retail + a          */
/*  restaurant), the dine-in restaurant shop is preferred so the QR/kitchen    */
/*  flows land on the right store; otherwise fall back to the newest shop.     */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Prefer the dine-in shop (restaurant/cafe) so multi-shop merchants land
      // on the store that runs QR tables + kitchen.
      const dineIn = await fetchMyDineInShop();
      if (cancelled) return;
      if (dineIn.success && dineIn.data) {
        router.replace(`/shop/${dineIn.data.id}`);
        return;
      }

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
