"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  fetchAllAdPlansForAdmin,
  createAdPlan,
  updateAdPlan,
  setAdPlanActive,
  deleteAdPlan,
} from "@/services/adminService";
import { useConfirm } from "@/components/ConfirmProvider";
import type { AdPlan, AdPlanFormData, PromoAdPlacement } from "@/types";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Ad Pricing Plans Manager (Super-Admin Ads tab)                 */
/*  Admin can add/edit plan pricing, toggle availability, and delete plans.    */
/*  These plans power the pricing picker merchants see when requesting ads.    */
/* -------------------------------------------------------------------------- */

const EMPTY_FORM: AdPlanFormData = {
  name: "",
  placement: "homepage_top",
  duration_days: "7",
  price: "",
  description: "",
  is_active: true,
};

function formatPrice(price: number): string {
  return `Rs. ${price.toLocaleString("en-PK")}`;
}

export default function AdPlansManager() {
  const { confirm } = useConfirm();

  const [plans, setPlans] = useState<AdPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AdPlanFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    const result = await fetchAllAdPlansForAdmin();
    if (result.success) setPlans(result.data);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const startAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  };

  const startEdit = (plan: AdPlan) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      placement: plan.placement,
      duration_days: String(plan.duration_days),
      price: String(plan.price),
      description: plan.description ?? "",
      is_active: plan.is_active,
    });
    setError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Plan name is required.");
      return;
    }
    if (!form.price || Number(form.price) < 0) {
      setError("Enter a valid price (0 or more).");
      return;
    }
    setSaving(true);
    setError(null);
    const result = editingId
      ? await updateAdPlan(editingId, form)
      : await createAdPlan(form);
    setSaving(false);
    if (result.success) {
      await loadPlans();
      setShowForm(false);
      setMessage(editingId ? "Plan updated." : "Plan created.");
      setTimeout(() => setMessage(null), 2500);
    } else {
      setError(result.error);
    }
  };

  const handleToggle = async (plan: AdPlan) => {
    setTogglingId(plan.id);
    const result = await setAdPlanActive(plan.id, !plan.is_active);
    setTogglingId(null);
    if (result.success) {
      setPlans((prev) =>
        prev.map((p) => (p.id === plan.id ? { ...p, is_active: !plan.is_active } : p)),
      );
    } else {
      setMessage(result.error);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  const handleDelete = async (plan: AdPlan) => {
    if (!(await confirm(`Delete the "${plan.name}" plan? Existing ad requests keep their pricing.`))) {
      return;
    }
    const result = await deleteAdPlan(plan.id);
    if (result.success) {
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
    } else {
      setMessage(result.error);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">💰 Ad Pricing Plans</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Merchants pick one of these plans when requesting a sponsored banner. This is your ad revenue model.
          </p>
        </div>
        <button
          type="button"
          onClick={startAdd}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shrink-0"
        >
          {showForm ? "Cancel" : "+ New Plan"}
        </button>
      </div>

      {message && (
        <div className="px-5 py-2 text-sm text-emerald-600 dark:text-emerald-400">{message}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 space-y-3 bg-zinc-50 dark:bg-zinc-800/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">Plan name *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Homepage Banner — 7 Days"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">Placement</span>
              <select
                value={form.placement}
                onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value as PromoAdPlacement }))}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              >
                <option value="homepage_top">Home page</option>
                <option value="store_top">Store page</option>
                <option value="deals_top">Deals page</option>
                <option value="products_top">Products page</option>
                <option value="homepage_feed">Home feed</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">Duration (days) *</span>
              <input
                type="number"
                min={1}
                value={form.duration_days}
                onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">Price (Rs.) *</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">
              Description <span className="font-normal">(optional)</span>
            </span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What does this plan include?"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-zinc-300 text-emerald-600"
            />
            Active (visible to merchants)
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId ? "Save Changes" : "Create Plan"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="px-5 py-10 text-center text-zinc-400">Loading plans…</div>
      ) : plans.length === 0 ? (
        <div className="px-5 py-10 text-center text-zinc-400">
          <div className="text-3xl mb-2">💸</div>
          <p>No pricing plans yet. Create one to start selling ad placements.</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {plans.map((plan) => (
            <div key={plan.id} className="px-5 py-4 flex flex-wrap items-center gap-3">
              <div className="flex-grow min-w-[180px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{plan.name}</span>
                  {!plan.is_active && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.65rem] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      Hidden
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {plan.placement === "homepage_top" ? "Homepage Top" : "Homepage Feed"} · {plan.duration_days} day{plan.duration_days !== 1 ? "s" : ""}
                  {plan.description ? ` · ${plan.description}` : ""}
                </div>
              </div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatPrice(plan.price)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggle(plan)}
                  disabled={togglingId === plan.id}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors ${
                    plan.is_active
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {plan.is_active ? "Live" : "Paused"}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(plan)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(plan)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
