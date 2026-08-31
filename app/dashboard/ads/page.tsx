"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Merchant Promotional Ad Requests                              */
/*                                                                             */
/*  Lets a merchant request a sponsored homepage banner slot. Requests always */
/*  start as "pending" and only appear on the storefront once a Super-Admin   */
/*  approves them (see `services/adsService.ts` + the DB guard trigger).      */
/* -------------------------------------------------------------------------- */

import { useState, useEffect, useCallback, useMemo, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmProvider";
import ImageUpload from "@/components/ImageUpload";
import AdCreativePreview from "@/components/AdCreativePreview";
import ToggleSwitch from "@/components/ToggleSwitch";
import {
  fetchShopAds,
  createAdRequest,
  updateAdCreative,
  setAdActive,
  deleteAd,
  fetchActiveAdPlans,
  resolveAdPlacements,
} from "@/services/adsService";
import type { PromotionalAd, PromotionalAdFormData, AdPlan, AdPlacementChoice } from "@/types";
import { AD_PLACEMENT_LABELS, AD_PLACEMENT_OPTIONS } from "@/types";

// ─── Icons ──────────────────────────────────────────────────────────────────

function MegaphoneIcon() {
  return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>);
}
function PlusIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>); }
function TrashIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>); }
function EyeIcon() { return (<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>); }
function CursorClickIcon() { return (<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 9l6 12 2-6 6-2z" /></svg>); }

const EMPTY_FORM: PromotionalAdFormData = {
  title: "",
  subtitle: "",
  image_url: "",
  link_url: "",
  badge_label: "Sale",
  placement: "homepage_top",
  starts_at: "",
  ends_at: "",
};

function StatusBadge({ status }: { status: PromotionalAd["status"] }) {
  const map = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  } as const;
  const labels = { pending: "Pending Review", approved: "Approved", rejected: "Rejected" } as const;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function MerchantAdsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { addToast } = useToast();
  const { confirm } = useConfirm();

  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState("");
  const [loading, setLoading] = useState(true);
  const [ads, setAds] = useState<PromotionalAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromotionalAdFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [plans, setPlans] = useState<AdPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [placementChoice, setPlacementChoice] = useState<AdPlacementChoice>("homepage_top");

  // ── Load pricing plans ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetchActiveAdPlans().then((res) => {
      if (!cancelled && res.success) setPlans(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Resolve merchant's shop ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function resolveShop() {
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
      if (!cancelled) {
        if (shop) {
          setShopId(shop.id as string);
          setShopName((shop.name as string) ?? "");
        }
        setLoading(false);
      }
    }
    resolveShop();
    return () => { cancelled = true; };
  }, [supabase, router]);

  // ── Load ad requests ─────────────────────────────────────────────────────
  const loadAds = useCallback(async (id: string) => {
    setAdsLoading(true);
    const result = await fetchShopAds(id);
    if (result.success) setAds(result.data);
    setAdsLoading(false);
  }, []);

  useEffect(() => {
    if (shopId) loadAds(shopId);
  }, [shopId, loadAds]);

  // ── Form handlers ────────────────────────────────────────────────────────
  const handleEdit = useCallback((ad: PromotionalAd) => {
    setEditingId(ad.id);
    setForm({
      title: ad.title,
      subtitle: ad.subtitle ?? "",
      image_url: ad.image_url,
      link_url: ad.link_url,
      badge_label: ad.badge_label ?? "",
      placement: ad.placement,
      starts_at: ad.starts_at ? ad.starts_at.slice(0, 10) : "",
      ends_at: ad.ends_at ? ad.ends_at.slice(0, 10) : "",
    });
    setPlacementChoice(ad.placement);
    setShowForm(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setSelectedPlanId("");
    setPlacementChoice("homepage_top");
    setForm(EMPTY_FORM);
    setError(null);
  }, []);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!shopId) return;
    if (!form.title.trim()) { setError("Please enter a title."); return; }
    if (!form.image_url.trim()) { setError("Please upload a banner image."); return; }
    if (!form.link_url.trim()) { setError("Please enter where this ad should link to."); return; }

    setSaving(true);
    setError(null);

    if (editingId) {
      const result = await updateAdCreative(editingId, {
        ...form,
        placement: placementChoice === "all_pages" ? form.placement : placementChoice,
      });
      if (result.success) {
        addToast("Ad updated — it will be re-reviewed by our team.", "success");
        await loadAds(shopId);
        handleCancel();
      } else {
        setError(result.error);
      }
      setSaving(false);
      return;
    }

    const placements = resolveAdPlacements(placementChoice);
    let failed = false;
    for (const placement of placements) {
      const result = await createAdRequest(
        shopId,
        { ...form, placement },
        selectedPlanId || null,
      );
      if (!result.success) {
        setError(result.error);
        failed = true;
        break;
      }
    }

    if (!failed) {
      addToast(
        placements.length > 1
          ? `Ad requests submitted for ${placements.length} pages!`
          : "Ad request submitted for review!",
        "success",
      );
      await loadAds(shopId);
      handleCancel();
    }
    setSaving(false);
  }, [shopId, editingId, form, selectedPlanId, placementChoice, addToast, loadAds, handleCancel]);

  const handleToggleActive = useCallback(async (ad: PromotionalAd) => {
    const result = await setAdActive(ad.id, !ad.is_active);
    if (result.success) {
      setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, is_active: !ad.is_active } : a)));
    } else {
      addToast(result.error, "error");
    }
  }, [addToast]);

  const handleDelete = useCallback(async (adId: string) => {
    if (!(await confirm("Delete this ad request permanently?"))) return;
    setDeletingId(adId);
    const result = await deleteAd(adId);
    if (result.success) {
      setAds((prev) => prev.filter((a) => a.id !== adId));
      addToast("Ad deleted.", "info");
    } else {
      addToast(result.error, "error");
    }
    setDeletingId(null);
  }, [addToast, confirm]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!shopId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          You need an approved store before you can request promotional ads.
        </p>
      </div>
    );
  }

  return (
    <div className="tm-dashboard-page min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-safe-nav">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              Promote
            </p>
            <h1 className="tm-font-display flex items-center gap-2 text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
              <MegaphoneIcon /> Ads
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Feature {shopName || "your store"} on home, store, deals, or products — or all pages at once.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              ← Dashboard
            </Link>
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <PlusIcon /> Request Ad Slot
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
          Pick a pricing plan below, submit your creative, and the TrendsMart team will review it
          before it goes live — usually within 24 hours. Payment is coordinated separately.
        </div>

        {/* ── Pricing plans ──────────────────────────────────────────────── */}
        {plans.length > 0 && !showForm && (
          <section>
            <h2 className="mb-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
              💰 Sponsored Banner Pricing
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="tm-panel p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    {plan.duration_days} day{plan.duration_days !== 1 ? "s" : ""}
                  </p>
                  <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    Rs. {plan.price.toLocaleString("en-PK")}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{plan.name}</p>
                  {plan.description && (
                    <p className="mt-2 text-xs text-zinc-400">{plan.description}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Form ──────────────────────────────────────────────────────── */}
        {showForm && (
          <form onSubmit={handleSubmit} className="tm-panel space-y-4 p-5">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {editingId ? "Edit Ad Request" : "New Ad Request"}
            </h2>

            {!editingId && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Where should this ad appear? *
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {AD_PLACEMENT_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-center text-xs font-semibold transition-colors ${
                        placementChoice === opt.value
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300"
                          : "border-zinc-200 text-zinc-600 hover:border-emerald-300 dark:border-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="ad-placement"
                        value={opt.value}
                        checked={placementChoice === opt.value}
                        onChange={() => setPlacementChoice(opt.value)}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!editingId && plans.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Pricing plan *
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {plans.map((plan) => (
                    <label
                      key={plan.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors ${
                        selectedPlanId === plan.id
                          ? "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-900/20"
                          : "border-zinc-200 hover:border-emerald-300 dark:border-zinc-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="ad-plan"
                        value={plan.id}
                        checked={selectedPlanId === plan.id}
                        onChange={() => setSelectedPlanId(plan.id)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {plan.duration_days}d — Rs. {plan.price.toLocaleString("en-PK")}
                        </span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{plan.name}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Live storefront preview — exact copy of the homepage card */}
            <div className="tm-panel p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Storefront preview
              </p>
              <div className="mx-auto w-full max-w-md">
                <AdCreativePreview form={form} />
              </div>
            </div>

            <ImageUpload
              label="Banner Image (wide, e.g. 1600×900)"
              currentUrl={form.image_url}
              onUploaded={(url) => setForm((f) => ({ ...f, image_url: url }))}
              folder="ads"
              fileId={editingId ?? "new-ad"}
              showPreview
              aspect="video"
              fallbackType="generic"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Title *</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ad title"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Badge Label</label>
                <input
                  type="text"
                  maxLength={24}
                  value={form.badge_label}
                  onChange={(e) => setForm((f) => ({ ...f, badge_label: e.target.value }))}
                  placeholder="Tags"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Subtitle <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                maxLength={220}
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                placeholder="Ad description"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Link To *</label>
              <input
                type="text"
                required
                value={form.link_url}
                onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
                placeholder={`/shop/${shopId}`}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <p className="mt-1 text-xs text-zinc-400">
                Usually your own store page: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/shop/{shopId}</code>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Start Date <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  type="date"
                  value={form.starts_at}
                  onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  End Date <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  type="date"
                  value={form.ends_at}
                  onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Submitting…" : editingId ? "Save Changes" : "Submit for Review"}
              </button>
              <button type="button" onClick={handleCancel} className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* ── Ad Requests List ─────────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Your Ad Requests ({ads.length})
          </h2>
          {adsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="tm-panel h-24 animate-pulse" />
              ))}
            </div>
          ) : ads.length === 0 ? (
            <div className="tm-panel rounded-2xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No ad requests yet</p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                Request a banner slot on home, deals, or products to get more customers.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ads.map((ad) => (
                <div key={ad.id} className="flex gap-3 tm-panel p-4">
                  <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    {ad.image_url && <img src={ad.image_url} alt={ad.title} className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{ad.title}</p>
                      <StatusBadge status={ad.status} />
                    </div>
                    {ad.subtitle && <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{ad.subtitle}</p>}
                    {ad.status === "rejected" && ad.rejection_reason && (
                      <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                        Reason: {ad.rejection_reason}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {AD_PLACEMENT_LABELS[ad.placement] ?? ad.placement}
                      </span>
                      {ad.price_paid != null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                          Rs. {ad.price_paid.toLocaleString("en-PK")} plan
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1"><EyeIcon /> {ad.impression_count.toLocaleString()} views</span>
                      <span className="inline-flex items-center gap-1"><CursorClickIcon /> {ad.click_count.toLocaleString()} clicks</span>
                      {ad.status === "approved" && (
                        <span className="inline-flex items-center gap-1.5">
                          <ToggleSwitch
                            checked={ad.is_active}
                            onChange={() => handleToggleActive(ad)}
                            size="sm"
                            label={`Toggle ${ad.title} active`}
                          />
                          {ad.is_active ? "Live" : "Paused"}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => handleEdit(ad)} className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(ad.id)}
                        disabled={deletingId === ad.id}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        aria-label={`Delete ${ad.title}`}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
