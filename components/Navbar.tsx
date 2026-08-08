"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SidebarDrawer from "@/components/SidebarDrawer";
import LocationPicker from "@/components/LocationPicker";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function HamburgerIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Navbar                                                                     */
/* -------------------------------------------------------------------------- */

export default function Navbar() {
  const router = useRouter();
  const [session, setSession] = useState(false);
  const [dashHref, setDashHref] = useState("/account");
  const [dashLabel, setDashLabel] = useState("Account");
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPortalReady(true); }, []);

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    async function check() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        // Unblock the Sign In / Account button immediately
        setSession(!!data.session);
        setLoading(false);

        if (data.session?.user) {
          try {
            const { detectUserRole, getDashboardPath } = await import("@/services/authService");
            const role = await detectUserRole(data.session.user);
            if (!cancelled) {
              setDashHref(getDashboardPath(role));
              setDashLabel(role === "merchant" || role === "admin" ? "Dashboard" : "Account");
            }
          } catch {
            /* keep default /account */
          }
        }

        const { data: authSub } = supabase.auth.onAuthStateChange(async (_, s) => {
          if (cancelled) return;
          setSession(!!s);
          if (s?.user) {
            try {
              const { detectUserRole, getDashboardPath } = await import("@/services/authService");
              const role = await detectUserRole(s.user);
              if (!cancelled) {
                setDashHref(getDashboardPath(role));
                setDashLabel(role === "merchant" || role === "admin" ? "Dashboard" : "Account");
              }
            } catch {
              if (!cancelled) {
                setDashHref("/account");
                setDashLabel("Account");
              }
            }
          } else {
            setDashHref("/account");
            setDashLabel("Account");
          }
        });
        subscription = authSub.subscription;
      } catch {
        if (!cancelled) {
          setSession(false);
          setLoading(false);
        }
      }
    }

    check();
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  const navigateToSearch = useCallback(() => router.push("/search"), [router]);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        {/* Hamburger — all screens */}
        <button type="button" onClick={() => setDrawerOpen(true)} className="shrink-0 rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="Open menu">
          <HamburgerIcon />
        </button>

        {/* Logo */}
        <Link href="/" className="inline-flex shrink-0 items-center text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
          TrendMart
        </Link>

        {/* Location picker */}
        <div className="hidden sm:block shrink-0">
          <LocationPicker />
        </div>

        {/* Search — desktop */}
        <button type="button" onClick={navigateToSearch} className="hidden sm:flex flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-300 hover:bg-white transition-colors dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500 dark:hover:border-zinc-600 lg:max-w-md" tabIndex={0}>
          <SearchIcon />
          <span>Search shops…</span>
        </button>

        <div className="flex-1 sm:hidden" />

        {/* Mobile search */}
        <button type="button" onClick={navigateToSearch} className="shrink-0 rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 sm:hidden dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="Search">
          <SearchIcon />
        </button>

        {/* Auth */}
        {loading ? (
          <div className="h-8 w-16 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        ) : session ? (
          <Link href={dashHref} className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
            {dashLabel}
          </Link>
        ) : (
          <Link href="/login" className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors dark:bg-emerald-500 dark:hover:bg-emerald-600">
            Sign In
          </Link>
        )}
      </div>

      {portalReady
        ? createPortal(
            <SidebarDrawer
              isOpen={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            />,
            document.body,
          )
        : null}
    </header>
  );
}