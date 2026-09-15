"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { AlertCounts } from "@/services/alertService";
import { formatAlertSummary } from "@/services/alertService";

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

function AlertPopover({ counts, onClose }: { counts: AlertCounts; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Alerts</h3>
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
        {counts.total === 0 && <p className="mt-3 text-center text-xs text-zinc-400">All caught up — no alerts.</p>}
      </div>
    </>
  );
}

export type DashboardNavbarProps = {
  loading: boolean;
  shopId: string | null;
  storeHref: string | null;
  dineIn: boolean;
  alertCounts: AlertCounts;
  onOpenMenu: () => void;
  onSignOut: () => void;
};

/** Slim top bar — nav lives in the sidebar / mobile drawer. */
export default function DashboardNavbar({
  loading,
  shopId,
  storeHref,
  dineIn,
  alertCounts,
  onOpenMenu,
  onSignOut,
}: DashboardNavbarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const togglePopover = useCallback(() => setPopoverOpen((p) => !p), []);
  const closePopover = useCallback(() => setPopoverOpen(false), []);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="flex h-12 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50 lg:hidden dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-label="Open dashboard menu"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden>
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>

        <div className="min-w-0 flex-1 lg:hidden">
          <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">Dashboard</p>
          <p className="truncate text-[10px] font-medium text-zinc-500">Menu · manage your store</p>
        </div>

        <p className="hidden min-w-0 flex-1 truncate text-sm font-semibold text-zinc-600 dark:text-zinc-300 lg:block">
          Merchant dashboard
        </p>

        {!loading && storeHref ? (
          <Link
            href={storeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 sm:gap-1.5 sm:px-2.5 sm:text-xs"
            aria-label="View my store"
          >
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="hidden sm:inline">View store</span>
            <span className="sm:hidden">Store</span>
          </Link>
        ) : null}

        {!loading && shopId && dineIn ? (
          <Link
            href="/dashboard/tables"
            className="hidden items-center gap-1 rounded-lg border border-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 sm:inline-flex sm:text-xs dark:hover:bg-emerald-900/20"
          >
            Dine-In
          </Link>
        ) : null}

        {!loading && shopId ? (
          <div className="relative">
            <button
              type="button"
              onClick={togglePopover}
              className="relative rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              aria-label={`Alerts — ${formatAlertSummary(alertCounts)}`}
              aria-expanded={popoverOpen}
            >
              <BellIcon />
              {alertCounts.total > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-zinc-950">
                  {alertCounts.total > 99 ? "99+" : alertCounts.total}
                </span>
              ) : null}
            </button>
            {popoverOpen ? <AlertPopover counts={alertCounts} onClose={closePopover} /> : null}
          </div>
        ) : null}

        {loading ? (
          <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        ) : null}

        <button
          type="button"
          onClick={onSignOut}
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 sm:px-3 sm:text-sm dark:text-red-400 dark:hover:bg-red-900/20"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
