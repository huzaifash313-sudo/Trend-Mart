"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { detectUserRole, signOut } from "@/services/authService";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M10 8.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" /><path d="M17 8.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" /><path d="M7 13.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" /><path d="M17 13.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.12-5.6A1 1 0 0 1 5.1 3h13.8a1 1 0 0 1 .98.8L21 9" /><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /><path d="M9 21V9h6v12" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Settings Page                                                              */
/* -------------------------------------------------------------------------- */

export default function SettingsPage() {
  const [session, setSession] = useState(false);
  const [isMerchant, setIsMerchant] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarInitial, setAvatarInitial] = useState("?");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          setSession(!!data.session);
          const user = data.session?.user ?? null;
          const email = user?.email ?? null;
          setUserEmail(email);
          setAvatarInitial(email?.charAt(0).toUpperCase() ?? "U");
          if (user) {
            const role = await detectUserRole(user);
            if (!cancelled) setIsMerchant(role === "merchant" || role === "admin");
          }
        }
      } catch {
        if (!cancelled) setSession(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut({ redirectTo: "/" });
    } catch {
      window.location.assign("/");
    }
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-[color:var(--tm-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/90">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-2.5">
          <Link href="/" className="btn-compact inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-emerald-400 dark:hover:bg-emerald-950" aria-label="Go back">
            <ChevronLeftIcon />
          </Link>
          <h1 className="text-sm font-bold text-zinc-900 dark:text-emerald-300">Settings</h1>
        </div>
      </header>

      <main className="page-stack mx-auto w-full max-w-2xl flex-1 px-3 py-4">
        {/* ── Profile Card ─────────────────────────────────────────── */}
        <section className="trend-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600">
              <span className="text-lg font-bold text-white">{avatarInitial}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {session ? userEmail ?? "User" : "Guest User"}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {session ? "Signed in" : "Not signed in"}
              </p>
            </div>
            {!session && (
              <Link href="/login" className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">
                Sign In
              </Link>
            )}
          </div>
        </section>

        {/* ── Preferences ──────────────────────────────────────────── */}
        <section aria-label="Preferences">
          <h2 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-emerald-600 px-1">
            Preferences
          </h2>
          <div className="trend-card divide-y divide-zinc-100 dark:divide-[color:var(--tm-border)] overflow-hidden dark:bg-[color:var(--tm-surface)]">
            <Link href="/settings/location" className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-emerald-950/40 transition-colors">
              <span className="flex items-center gap-3">
                <span className="text-zinc-400 dark:text-emerald-500"><PinIcon /></span>
                <span>
                  <span className="block text-sm text-zinc-700 dark:text-emerald-300">Location</span>
                  <span className="block text-[0.65rem] text-zinc-400 dark:text-emerald-700">Area, city, GPS pin for nearby shops</span>
                </span>
              </span>
              <ChevronRightIcon />
            </Link>
            <Link href="/settings/appearance" className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-emerald-950/40 transition-colors">
              <span className="flex items-center gap-3">
                <span className="text-zinc-400 dark:text-emerald-500"><PaletteIcon /></span>
                <span>
                  <span className="block text-sm text-zinc-700 dark:text-emerald-300">Appearance</span>
                  <span className="block text-[0.65rem] text-zinc-400 dark:text-emerald-700">Theme, font size, storefront display</span>
                </span>
              </span>
              <ChevronRightIcon />
            </Link>
            <Link href="/settings/notifications" className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-emerald-950/40 transition-colors">
              <span className="flex items-center gap-3">
                <span className="text-zinc-400 dark:text-emerald-500"><BellIcon /></span>
                <span>
                  <span className="block text-sm text-zinc-700 dark:text-emerald-300">Notifications</span>
                  <span className="block text-[0.65rem] text-zinc-400 dark:text-emerald-700">Orders, promos, merchant alerts</span>
                </span>
              </span>
              <ChevronRightIcon />
            </Link>
            <Link href="/settings/privacy" className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-emerald-950/40 transition-colors">
              <span className="flex items-center gap-3">
                <span className="text-zinc-400 dark:text-emerald-500"><ShieldIcon /></span>
                <span className="text-sm text-zinc-700 dark:text-emerald-300">Privacy &amp; Security</span>
              </span>
              <ChevronRightIcon />
            </Link>
          </div>
        </section>

        {/* ── Account ──────────────────────────────────────────────── */}
        <section aria-label="Account">
          <h2 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-emerald-600 px-1">
            Account
          </h2>
          <div className="trend-card divide-y divide-zinc-100 dark:divide-[color:var(--tm-border)] overflow-hidden dark:bg-[color:var(--tm-surface)]">
            {session && isMerchant && (
              <>
                <Link href="/dashboard" className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-emerald-950/40 transition-colors">
                  <span className="flex items-center gap-3">
                    <span className="text-zinc-400 dark:text-emerald-500"><StoreIcon /></span>
                    <span className="text-sm text-zinc-700 dark:text-emerald-300">Merchant Dashboard</span>
                  </span>
                  <ChevronRightIcon />
                </Link>
                <Link href="/dashboard/settings" className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-emerald-950/40 transition-colors">
                  <span className="flex items-center gap-3">
                    <span className="text-zinc-400 dark:text-emerald-500"><SettingsIcon /></span>
                    <span>
                      <span className="block text-sm text-zinc-700 dark:text-emerald-300">Store Settings</span>
                      <span className="block text-[0.65rem] text-zinc-400 dark:text-emerald-700">Name, location, delivery, visibility</span>
                    </span>
                  </span>
                  <ChevronRightIcon />
                </Link>
              </>
            )}
            <Link href="/wishlist" className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-emerald-950/40 transition-colors">
              <span className="flex items-center gap-3">
                <span className="text-zinc-400 dark:text-emerald-500"><HeartIcon /></span>
                <span className="text-sm text-zinc-700 dark:text-emerald-300">My Wishlist</span>
              </span>
              <ChevronRightIcon />
            </Link>
          </div>
        </section>

        {/* ── Sign Out ─────────────────────────────────────────────── */}
        {session && (
          <section aria-label="Session">
            <button
              type="button"
              onClick={handleSignOut}
              className="trend-card flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
            >
              <SignOutIcon />
              Sign Out
            </button>
          </section>
        )}

        {/* ── About ────────────────────────────────────────────────── */}
        <section aria-label="About">
          <p className="text-center text-[0.65rem] text-zinc-400 dark:text-zinc-500">
            TrendsMart v1.0 · Built for local commerce 🇵🇰
          </p>
        </section>
      </main>
    </div>
  );
}