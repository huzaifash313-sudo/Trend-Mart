"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Navbar                                                                     */
/* -------------------------------------------------------------------------- */

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const onSearchPage = pathname === "/search" || pathname.startsWith("/search/");
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
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/90">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        {/* Hamburger */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 dark:text-[color:var(--tm-muted)] dark:hover:bg-[color:var(--tm-elevated)]"
          aria-label="Open menu"
        >
          <HamburgerIcon />
        </button>

        {/* Logo */}
        <Link
          href="/"
          className="inline-flex shrink-0 items-center text-base font-bold tracking-tight text-emerald-600 dark:text-emerald-400 sm:text-lg"
        >
          TrendMart
        </Link>

        {/* Location — desktop only */}
        <div className="hidden shrink-0 sm:block">
          <LocationPicker />
        </div>

        {/* Single search control — bar on sm+, icon on mobile; hide on /search */}
        {!onSearchPage ? (
          <button
            type="button"
            onClick={navigateToSearch}
            className="ml-auto inline-flex min-h-9 min-w-9 max-w-md flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 text-sm text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-white dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-elevated)] dark:text-[color:var(--tm-muted)] dark:hover:border-zinc-600 sm:justify-start sm:px-4"
            aria-label="Search shops"
          >
            <SearchIcon />
            <span className="hidden truncate sm:inline">Search shops…</span>
          </button>
        ) : (
          <div className="ml-auto min-w-0 flex-1" />
        )}

        {/* Auth */}
        {loading ? (
          <div className="h-9 w-16 shrink-0 animate-pulse rounded-xl bg-zinc-200 dark:bg-[color:var(--tm-elevated)]" />
        ) : session ? (
          <Link
            href={dashHref}
            className="inline-flex h-9 max-w-[5.5rem] shrink-0 items-center justify-center truncate rounded-xl border border-zinc-300 px-2 text-[0.7rem] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-[color:var(--tm-border)] dark:text-[color:var(--tm-text)] dark:hover:bg-[color:var(--tm-elevated)] sm:max-w-none sm:px-4 sm:text-sm"
          >
            {dashLabel === "Dashboard" ? (
              <>
                <span className="sm:hidden">Dash</span>
                <span className="hidden sm:inline">Dashboard</span>
              </>
            ) : (
              dashLabel
            )}
          </Link>
        ) : (
          <a
            href="/login"
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 sm:px-4 sm:text-sm"
          >
            Sign In
          </a>
        )}
      </div>

      {/* Location row on mobile only */}
      <div className="border-t border-zinc-100 px-3 py-1.5 sm:hidden dark:border-[color:var(--tm-border)]">
        <LocationPicker />
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
