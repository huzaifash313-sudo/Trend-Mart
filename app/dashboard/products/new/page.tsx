"use client";

/* -------------------------------------------------------------------------- */
/*  Multi-item product batch creator                                           */
/*  Sub-categories come from the merchant shop's main category.                */
/* -------------------------------------------------------------------------- */

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Shop } from "@/types";
import { fetchMyShops } from "@/services/shopService";
import { useToast } from "@/components/Toast";
import BulkProductCreator from "@/components/BulkProductCreator";

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export default function NewProductPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) {
        if (!data.user) router.replace("/auth");
        else setUserId(data.user.id);
        setAuthLoading(false);
      }
    }
    checkAuth();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadShops() {
      const result = await fetchMyShops();
      if (cancelled) return;
      if (result.success) {
        const myShops = result.data;
        setShops(myShops);
        if (myShops.length > 0) {
          const saved =
            typeof window !== "undefined"
              ? localStorage.getItem("trendmart_active_shop")
              : null;
          const match = saved ? myShops.find((s) => s.id === saved) : null;
          setActiveShopId(match?.id ?? myShops[0].id);
        }
      } else {
        addToast(result.error || "Failed to load your shops.", "error");
      }
    }
    loadShops();
    return () => {
      cancelled = true;
    };
  }, [userId, addToast]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const activeShop = shops.find((s) => s.id === activeShopId);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-bg)]">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/dashboard/products"
              className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
            >
              <ArrowLeftIcon />
              Products
            </Link>
            <h1 className="truncate text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              Batch Add Products
            </h1>
          </div>

          {shops.length > 1 && (
            <select
              value={activeShopId ?? ""}
              onChange={(e) => {
                setActiveShopId(e.target.value);
                if (e.target.value) {
                  localStorage.setItem("trendmart_active_shop", e.target.value);
                }
              }}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              aria-label="Select shop"
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-5 sm:px-4">
        {!activeShop && (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Create a shop on your dashboard first, then come back to add products.
            <Link href="/dashboard" className="ml-2 font-semibold underline">
              Go to Dashboard
            </Link>
          </div>
        )}

        {activeShop && (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Adding to <span className="font-semibold text-zinc-900 dark:text-zinc-100">{activeShop.name}</span>
              {" · "}
              Sub-categories for{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {activeShop.category}
              </span>
            </p>
            <BulkProductCreator
              shopId={activeShop.id}
              shopCategory={activeShop.category}
              onToast={addToast}
              onCreated={() => {
                addToast("You can keep adding more, or manage inventory anytime.", "info");
              }}
            />
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href="/dashboard/products"
                className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Manage inventory →
              </Link>
              <Link
                href={`/shop/${activeShop.id}`}
                target="_blank"
                className="font-semibold text-zinc-500 hover:underline dark:text-zinc-400"
              >
                View storefront
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
