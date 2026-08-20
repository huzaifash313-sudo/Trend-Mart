"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Account Banned                                                 */
/*  Shown to customers/merchants whose account was restricted by a Super-Admin */
/*  (User moderation → Ban). They can still browse the public storefront.      */
/* -------------------------------------------------------------------------- */

export default function BannedPage() {
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        window.location.replace("/login");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-[color:var(--tm-surface)]">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl dark:bg-red-900/30">
          🚫
        </div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Account suspended
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Your TrendMart account has been suspended by the platform team. You can
          still browse shops and products, but you won&apos;t be able to place
          orders or use your dashboard.
        </p>
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          Think this is a mistake? Contact us via the{" "}
          <Link href="/support" className="font-semibold text-emerald-600 underline dark:text-emerald-400">
            Support Desk
          </Link>
          .
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/"
            className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Continue browsing
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
