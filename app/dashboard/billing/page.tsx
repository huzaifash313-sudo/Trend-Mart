"use client";

/* Merchant billing: 1st-month free plan + affordable ad token packs. */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import {
  fetchSubscription,
  TRENDSMART_MONTHLY_FEE_PKR,
  TRENDSMART_FREE_TRIAL_DAYS,
  type MerchantSubscription,
} from "@/services/subscriptionService";
import {
  fetchTokenBalance,
  fetchTokenPacks,
  startSubscriptionCheckout,
  startTokenCheckout,
  submitProviderForm,
  packTotalTokens,
  type TokenPack,
} from "@/services/billingService";
import { PLAN_COPY, DEFAULT_TOKEN_PACKS } from "@/lib/billing/plans";
import { isPaidFeaturesEnabled } from "@/lib/softLaunch";

function MerchantBillingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!isPaidFeaturesEnabled()) {
      router.replace("/dashboard");
    }
  }, [router]);

  if (!isPaidFeaturesEnabled()) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-center text-sm text-zinc-500">
        Billing is paused during soft launch.
      </div>
    );
  }

  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState("");
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [sub, setSub] = useState<MerchantSubscription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const paidFlag = searchParams.get("paid");

  const refresh = useCallback(async (id: string) => {
    const [bal, packRes, subRes] = await Promise.all([
      fetchTokenBalance(id),
      fetchTokenPacks(),
      fetchSubscription(id),
    ]);
    if (bal.success) setBalance(bal.data);
    if (packRes.success && packRes.data.length) setPacks(packRes.data);
    if (subRes.success) setSub(subRes.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace("/auth");
        return;
      }
      const { data: shop } = await supabase
        .from("shops")
        .select("id, name")
        .eq("owner_id", data.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (shop) {
        setShopId(shop.id as string);
        setShopName((shop.name as string) || "");
        await refresh(shop.id as string);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, router, refresh]);

  useEffect(() => {
    if (paidFlag === "1") {
      addToast("Payment received — tokens / plan updated.", "success");
      if (shopId) void refresh(shopId);
      router.replace("/dashboard/billing", { scroll: false });
    } else if (paidFlag === "0") {
      addToast("Payment not completed.", "error");
      router.replace("/dashboard/billing", { scroll: false });
    }
  }, [paidFlag, addToast, shopId, refresh, router]);

  const trialDaysLeft = useMemo(() => {
    if (!sub?.trial_ends_at) return null;
    const ms = new Date(sub.trial_ends_at).getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
  }, [sub?.trial_ends_at]);

  const buyPack = async (packId: string) => {
    if (!shopId) return;
    setBusy(packId);
    const res = await startTokenCheckout(shopId, packId);
    setBusy(null);
    if (!res.success) {
      addToast(res.error, "error");
      return;
    }
    if (res.data.formFields && res.data.checkoutUrl) {
      submitProviderForm(res.data.checkoutUrl, res.data.formFields);
      return;
    }
    if (res.data.checkoutUrl) {
      window.location.href = res.data.checkoutUrl;
      return;
    }
    addToast("Order created. Complete payment from your gateway.", "info");
  };

  const buySubscription = async () => {
    if (!shopId) return;
    setBusy("sub");
    const res = await startSubscriptionCheckout(shopId);
    setBusy(null);
    if (!res.success) {
      addToast(res.error, "error");
      return;
    }
    if (res.data.formFields && res.data.checkoutUrl) {
      submitProviderForm(res.data.checkoutUrl, res.data.formFields);
      return;
    }
    if (res.data.checkoutUrl) {
      window.location.href = res.data.checkoutUrl;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!shopId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-zinc-500">
        Create a store first, then manage billing here.
      </div>
    );
  }

  const displayPacks =
    packs.length > 0
      ? packs
      : DEFAULT_TOKEN_PACKS.map((p, i) => ({
          id: p.key,
          name: p.name,
          tokens: p.tokens,
          price_pkr: p.pricePkr,
          bonus_tokens: p.bonusTokens,
          is_active: true,
          sort_order: i,
        }));

  return (
    <div className="tm-dashboard-page min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-safe-nav">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Billing</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Plans & Ad Tokens</h1>
          <p className="mt-1 text-sm text-zinc-500">{shopName}</p>
        </div>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{PLAN_COPY.trialTitle}</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{PLAN_COPY.trialBody}</p>
          {trialDaysLeft != null && (
            <p className="mt-3 text-sm font-medium text-emerald-800 dark:text-emerald-300">
              {trialDaysLeft > 0
                ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left on free trial`
                : "Trial ended — renew Standard to keep full access"}
            </p>
          )}
          {!sub && (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              New shops get {TRENDSMART_FREE_TRIAL_DAYS} days free automatically.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{PLAN_COPY.paidTitle}</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{PLAN_COPY.paidBody}</p>
          <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Rs {TRENDSMART_MONTHLY_FEE_PKR.toLocaleString("en-PK")}
            <span className="text-sm font-medium text-zinc-500"> / month</span>
          </p>
          <button
            type="button"
            disabled={busy === "sub"}
            onClick={() => void buySubscription()}
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy === "sub" ? "Starting…" : "Pay monthly plan"}
          </button>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{PLAN_COPY.tokensTitle}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{PLAN_COPY.tokensBody}</p>
            </div>
            <div className="rounded-xl bg-zinc-100 px-4 py-2 text-center dark:bg-zinc-800">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Balance</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                {balance.toLocaleString("en-PK")} tokens
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {displayPacks.map((pack) => {
              const total = packTotalTokens(pack as TokenPack);
              const canBuy = Boolean(packs.find((p) => p.id === pack.id));
              return (
                <div
                  key={pack.id}
                  className="flex flex-col rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
                >
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">{pack.name}</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                    {total}
                    <span className="text-sm font-medium text-zinc-500"> tokens</span>
                  </p>
                  <p className="text-sm text-zinc-500">
                    Rs {Number(pack.price_pkr).toLocaleString("en-PK")}
                    {pack.bonus_tokens > 0 ? ` · +${pack.bonus_tokens} bonus` : ""}
                  </p>
                  <button
                    type="button"
                    disabled={!canBuy || busy === pack.id}
                    onClick={() => void buyPack(pack.id)}
                    className="mt-3 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                  >
                    {busy === pack.id ? "…" : canBuy ? "Buy tokens" : "Run SQL migration"}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            Tip: after buying tokens, open{" "}
            <Link href="/dashboard/ads" className="font-semibold text-emerald-700 underline dark:text-emerald-400">
              Ads
            </Link>{" "}
            → choose a plan → <strong>Publish with tokens</strong> for instant go-live.
          </p>
        </section>
      </main>
    </div>
  );
}

export default function MerchantBillingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <MerchantBillingInner />
    </Suspense>
  );
}
