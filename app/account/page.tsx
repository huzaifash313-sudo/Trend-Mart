"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  detectUserRole,
  claimSignupRole,
  redirectToDashboard,
} from "@/services/authService";
import { getOrderHistory } from "@/services/orderHistoryService";
import { useToast } from "@/components/Toast";

function StatCard({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string | number;
  href: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{value}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
    </Link>
  );
}

export default function CustomerAccountPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const localOrders = useMemo(() => {
    try {
      return getOrderHistory();
    } catch {
      return [];
    }
  }, []);

  const pendingCount = localOrders.filter((o) => {
    // Local history has no live status — treat recent (7d) as "active"
    const age = Date.now() - new Date(o.timestamp).getTime();
    return age < 7 * 24 * 60 * 60 * 1000;
  }).length;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let keepSkeleton = false;
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        // Prefer getSession (local/fast) over getUser so the portal doesn't hang.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;

        if (!user) {
          // Never paint the portal for guests — hard redirect breaks soft-nav loops.
          if (!cancelled) {
            window.location.replace("/login?redirect=/account");
          }
          return;
        }

        const role = await detectUserRole(user);
        if (cancelled) return;

        if (role === "merchant" || role === "admin") {
          keepSkeleton = true;
          redirectToDashboard(role);
          return;
        }

        setEmail(user.email ?? null);
        setEmailVerified(!!user.email_confirmed_at);
        setPhoneVerified(!!user.phone_confirmed_at);
        setAuthed(true);

        try {
          const { data: profile } = await supabase
            .from("user_profiles")
            .select("phone_verified_at")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!cancelled && profile?.phone_verified_at) {
            setPhoneVerified(true);
          }
        } catch {
          /* ignore profile lookup failures */
        }
      } catch {
        if (!cancelled) {
          window.location.replace("/login?redirect=/account");
        }
      } finally {
        if (!cancelled && !keepSkeleton) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleBecomeMerchant = async () => {
    setUpgrading(true);
    try {
      await claimSignupRole("merchant");
      addToast("You're now a merchant — set up your store.", "success");
      window.location.href = "/dashboard";
    } catch {
      addToast("Could not switch to merchant. Try again.", "error");
      setUpgrading(false);
    }
  };

  // Guests must never see portal chrome (orders from localStorage looked "logged in").
  if (loading || !authed) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          Checking your account…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">
              Customer portal
            </p>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">My Account</h1>
            {email ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{email}</p>
            ) : null}
          </div>
          <Link
            href="/"
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            Browse shops
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {/* Verification status */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Verification</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Once done, checkout won&apos;t ask again for the same email/phone.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                emailVerified
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              }`}
            >
              {emailVerified ? "Email verified" : "Email not verified"}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                phoneVerified
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {phoneVerified ? "Phone verified" : "Phone verifies at first order"}
            </span>
          </div>
          {!emailVerified && (
            <Link
              href="/auth/verify-notice?redirect=/account"
              className="mt-3 inline-block text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Verify email →
            </Link>
          )}
        </section>

        {/* Quick stats */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Recent orders"
            value={localOrders.length}
            href="/orders"
            hint="Order history"
          />
          <StatCard
            label="Active (7 days)"
            value={pendingCount}
            href="/orders/tracking"
            hint="Track live status"
          />
          <StatCard
            label="Wishlist"
            value="→"
            href="/wishlist"
            hint="Saved items"
          />
        </section>

        {/* Main actions */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Your shopping</h2>
          {[
            { href: "/orders", title: "My Orders", desc: "Past orders & details" },
            { href: "/orders/tracking", title: "Live Order Tracking", desc: "Pending → Delivered timeline" },
            { href: "/wishlist", title: "Wishlist", desc: "Saved products & shops" },
            { href: "/account/addresses", title: "Delivery Addresses", desc: "Saved checkout addresses" },
            { href: "/auth/settings", title: "Account Settings", desc: "Password & profile" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-shadow hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.desc}</p>
              </div>
              <span className="text-zinc-400" aria-hidden>
                →
              </span>
            </Link>
          ))}
        </section>

        {/* Become merchant */}
        <section className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
          <h2 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
            Want to sell on TrendMart?
          </h2>
          <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/80">
            Switch to a merchant account to open your store dashboard.
          </p>
          <button
            type="button"
            disabled={upgrading}
            onClick={handleBecomeMerchant}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {upgrading ? "Switching…" : "Become a Merchant"}
          </button>
        </section>
      </main>
    </div>
  );
}
