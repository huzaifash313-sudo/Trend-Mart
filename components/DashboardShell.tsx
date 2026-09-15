"use client";

import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/services/authService";
import type { AlertCounts } from "@/services/alertService";
import {
  fetchAlertCounts,
  subscribeToAlerts,
} from "@/services/alertService";
import { logError } from "@/services/errorService";
import { isDineInCategory } from "@/types";
import DashboardNavbar from "@/components/DashboardNavbar";
import DashboardNavSmooth from "@/components/DashboardNavSmooth";
import DashboardSidebarNav from "@/components/DashboardSidebarNav";
import BrandLogo from "@/components/BrandLogo";

/** Merchant chrome — skipped on immersive POS so the register can fill the screen. */
export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPos = pathname === "/dashboard/pos" || pathname.startsWith("/dashboard/pos/");
  const supabase = createClient();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [shopCategory, setShopCategory] = useState<string | null>(null);
  const [alertCounts, setAlertCounts] = useState<AlertCounts>({
    lowStock: 0,
    pendingOrders: 0,
    urgentInquiries: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  useEffect(() => {
    let cancelled = false;
    async function resolveShop() {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error || !user?.id || cancelled) return;
        const { data: shop } = await supabase
          .from("shops")
          .select("id, slug, category, name")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (!cancelled && shop?.id) {
          setShopId(shop.id);
          setShopSlug(typeof shop.slug === "string" ? shop.slug : null);
          setShopCategory(typeof shop.category === "string" ? shop.category : null);
          setShopName(typeof shop.name === "string" ? shop.name : null);
        }
      } catch (err) {
        logError(err, { module: "DashboardShell.resolveShop" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void resolveShop();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    fetchAlertCounts(shopId).then((result) => {
      if (!cancelled && result.success) setAlertCounts(result.data);
    });
    const unsubscribe = subscribeToAlerts(shopId, (counts) => {
      if (!cancelled) setAlertCounts(counts);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [shopId]);

  const handleSignOut = useCallback(async () => {
    await signOut({ redirectTo: "/" });
  }, []);

  const dineIn = isDineInCategory(shopCategory);
  const storeHref =
    shopSlug || shopId ? (shopSlug ? `/shop/${shopSlug}` : `/shop/${shopId}`) : null;

  if (isPos) {
    return <>{children}</>;
  }

  function renderSidebar(opts?: { showClose?: boolean }) {
    return (
      <>
        <div className="shrink-0 border-b border-zinc-100 px-3 py-3 dark:border-zinc-800">
          {opts?.showClose ? (
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                aria-label="Close menu"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ) : null}
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 px-1"
            onClick={() => setDrawerOpen(false)}
          >
            <BrandLogo size={36} className="shadow-sm shadow-emerald-600/20" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">
                TrendsMart
              </span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                {shopName?.trim() || "Merchant"}
              </span>
            </span>
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
          <DashboardSidebarNav
            dineIn={dineIn}
            onNavigate={() => setDrawerOpen(false)}
          />
        </div>
        <div className="shrink-0 space-y-2 border-t border-zinc-100 px-3 py-3 dark:border-zinc-800">
          {storeHref ? (
            <Link
              href={storeHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              View my store
            </Link>
          ) : null}
          <Link
            href="/"
            onClick={() => setDrawerOpen(false)}
            className="block rounded-xl border border-zinc-200 px-3 py-2 text-center text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ← Storefront
          </Link>
        </div>
      </>
    );
  }

  return (
    <div
      className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]"
      style={
        {
          ["--tm-navbar-content-height" as string]: "3rem",
          ["--tm-navbar-sticky-offset" as string]: "3rem",
        } as CSSProperties
      }
    >
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-[15.5rem] flex-col overflow-y-auto overscroll-contain border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:flex"
        aria-label="Dashboard sidebar"
      >
        {renderSidebar()}
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[15.5rem] max-w-[88vw] flex-col bg-white shadow-2xl dark:bg-zinc-950">
            {renderSidebar({ showClose: true })}
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col lg:pl-[15.5rem]">
        <DashboardNavbar
          loading={loading}
          shopId={shopId}
          storeHref={storeHref}
          dineIn={dineIn}
          alertCounts={alertCounts}
          onOpenMenu={() => setDrawerOpen(true)}
          onSignOut={handleSignOut}
        />
        <DashboardNavSmooth />
        <div className="tm-route-fade min-w-0 flex-1 overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
