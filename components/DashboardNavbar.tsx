"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AlertCounts } from "@/services/alertService";
import {
  fetchAlertCounts,
  formatAlertSummary,
  subscribeToAlerts,
} from "@/services/alertService";
import { logError } from "@/services/errorService";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function BellIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line y1="12" x2="12" y2="21" x1="12" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Alert Popover                                                              */
/* -------------------------------------------------------------------------- */

function AlertPopover({ counts, onClose }: { counts: AlertCounts; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Alerts Overview</h3>
        <div className="space-y-1.5">
          <Link href="/dashboard/products" onClick={onClose} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/20">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><PackageIcon /></span>
            <span className="flex-1 text-zinc-700 dark:text-zinc-300">Low Stock</span>
            {counts.lowStock > 0 ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{counts.lowStock}</span> : <span className="text-xs text-zinc-400">—</span>}
          </Link>
          <Link href="/dashboard/orders" onClick={onClose} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"><ClipboardIcon /></span>
            <span className="flex-1 text-zinc-700 dark:text-zinc-300">Pending Orders</span>
            {counts.pendingOrders > 0 ? <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs font-bold text-white">{counts.pendingOrders}</span> : <span className="text-xs text-zinc-400">—</span>}
          </Link>
          <Link href="/dashboard/inquiries" onClick={onClose} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-red-50 dark:hover:bg-red-900/20">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><MessageIcon /></span>
            <span className="flex-1 text-zinc-700 dark:text-zinc-300">Urgent Inquiries</span>
            {counts.urgentInquiries > 0 ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{counts.urgentInquiries}</span> : <span className="text-xs text-zinc-400">—</span>}
          </Link>
        </div>
        {counts.total === 0 && <p className="mt-3 text-center text-xs text-zinc-400">All caught up! No alerts.</p>}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  DashboardNavbar                                                            */
/* -------------------------------------------------------------------------- */

export default function DashboardNavbar() {
  const supabase = createClient();
  const router = useRouter();

  const [shopId, setShopId] = useState<string | null>(null);
  const [alertCounts, setAlertCounts] = useState<AlertCounts>({ lowStock: 0, pendingOrders: 0, urgentInquiries: 0, total: 0 });
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function resolveShop() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id || cancelled) return;
        setShopId(null);
        const { data: shop } = await supabase.from("shops").select("id").eq("owner_id", session.user.id).maybeSingle();
        if (!cancelled && shop?.id) setShopId(shop.id);
      } catch (err) { logError(err, { module: "DashboardNavbar.resolveShop" }); }
      finally { if (!cancelled) setLoading(false); }
    }
    resolveShop();
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    fetchAlertCounts(shopId).then((result) => { if (!cancelled && result.success) setAlertCounts(result.data); });
    const unsubscribe = subscribeToAlerts(shopId, (counts) => { if (!cancelled) setAlertCounts(counts); });
    return () => { cancelled = true; unsubscribe(); };
  }, [shopId]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/");
  }, [supabase, router]);

  const togglePopover = useCallback(() => setPopoverOpen((prev) => !prev), []);
  const closePopover = useCallback(() => setPopoverOpen(false), []);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4">
        {/* Logo */}
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
          TrendMart
        </Link>

        {/* Dashboard label */}
        <span className="hidden sm:inline text-sm font-medium text-zinc-500 dark:text-zinc-400">
          · Dashboard
        </span>

        <div className="flex-1" />

        {/* Visit live storefront */}
        {!loading && shopId && (
          <Link
            href={`/shop/${shopId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 sm:px-3 sm:text-sm"
            aria-label="View my store on TrendMart"
          >
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="hidden sm:inline">View My Store</span>
            <span className="sm:hidden">Store</span>
          </Link>
        )}

        {/* Alert Bell */}
        {!loading && shopId && (
          <div className="relative">
            <button type="button" onClick={togglePopover} className="relative rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 transition-colors dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label={`Alerts — ${formatAlertSummary(alertCounts)}`} aria-expanded={popoverOpen} aria-haspopup="true">
              <BellIcon />
              {alertCounts.total > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-zinc-950">
                  {alertCounts.total > 99 ? "99+" : alertCounts.total}
                </span>
              )}
            </button>
            {popoverOpen && <AlertPopover counts={alertCounts} onClose={closePopover} />}
          </div>
        )}

        {loading && <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />}

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Dashboard navigation">
          <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Overview</Link>
          <Link href="/dashboard/orders" className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Orders</Link>
          <Link href="/dashboard/products" className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Products</Link>
          <Link href="/dashboard/leads" className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Leads</Link>
          <Link href="/dashboard/finances" className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Finances</Link>
          <Link href="/dashboard/ads" className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Ads</Link>
        </nav>

        {/* Sign Out */}
        <button type="button" onClick={handleSignOut} className="shrink-0 rounded-lg border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800">
          Sign Out
        </button>
      </div>
    </header>
  );
}