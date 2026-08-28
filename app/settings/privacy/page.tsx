"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { clearCurrentScopeData } from "@/lib/clientScope";

function ChevronLeftIcon() {
  return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>);
}

function ShieldIcon() {
  return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);
}

function EyeIcon() {
  return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
}

function KeyIcon() {
  return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>);
}

function TrashIcon() {
  return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>);
}

export default function PrivacyPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [, setSession] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        setSession(!!data.session);
      } catch { /* ignore */ }
      setLoading(false);
    }
    check();
  }, []);

  const handleClearCache = useCallback(() => {
    try {
      // Clear the current account's namespaced buyer data (cart, wishlist,
      // history, orders, behaviour memory) — never another account's.
      clearCurrentScopeData();
      // Legacy flat keys + device-level caches from older builds.
      localStorage.removeItem("trendmart_favorites");
      localStorage.removeItem("trendmart_cart");
      localStorage.removeItem("trendmart_history");
      localStorage.removeItem("trendmart_orders");
      localStorage.removeItem("trendmart_active_shop");
      localStorage.removeItem("trendmart_notifications");
      localStorage.removeItem("trendmart_location");
      addToast("Local data cleared successfully!", "success");
    } catch {
      addToast("Failed to clear local data.", "error");
    }
    setShowClearConfirm(false);
  }, [addToast]);

  const handleChangePassword = useCallback(() => {
    router.push("/forgot-password");
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-3">
          <Link href="/settings" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="Back to settings"><ChevronLeftIcon /></Link>
          <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Privacy & Security</h1>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-3 py-5 space-y-4">
        {/* Security Info Card */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
          <div className="flex items-start gap-3">
            <span className="text-xl">🔒</span>
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Your Data is Safe</p>
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                TrendMart uses enterprise-grade security. Your personal information is encrypted and never shared with third parties.
              </p>
            </div>
          </div>
        </div>

        {/* Security Options */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 px-1">Security</h2>
          <div className="trend-card divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {/* Change Password */}
            <button
              type="button"
              onClick={handleChangePassword}
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <span className="flex items-center gap-3">
                <span className="text-zinc-400"><KeyIcon /></span>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">Change Password</span>
              </span>
              <span className="text-xs text-zinc-400">→</span>
            </button>
            {/* Two-Factor Auth */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-3">
                <span className="text-zinc-400"><ShieldIcon /></span>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">Two-Factor Authentication</span>
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.6rem] font-semibold text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">Coming Soon</span>
            </div>
          </div>
        </section>

        {/* Privacy Options */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 px-1">Privacy</h2>
          <div className="trend-card divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {/* View Data */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-3">
                <span className="text-zinc-400"><EyeIcon /></span>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">View My Data</span>
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.6rem] font-semibold text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">Coming Soon</span>
            </div>
            {/* Clear Local Data */}
            <div>
              {showClearConfirm ? (
                <div className="px-4 py-3">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-3">Clear all locally stored data (wishlist, cart, preferences)?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleClearCache} className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors">
                      Yes, Clear Data
                    </button>
                    <button type="button" onClick={() => setShowClearConfirm(false)} className="flex-1 rounded-lg border border-zinc-300 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="flex w-full items-center justify-between px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-red-400"><TrashIcon /></span>
                    <span className="text-sm text-red-600 dark:text-red-400">Clear Local Data</span>
                  </span>
                  <span className="text-xs text-red-400">→</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 pt-4">
          Your privacy is important to us. We never sell your data.
        </p>
      </main>
    </div>
  );
}
