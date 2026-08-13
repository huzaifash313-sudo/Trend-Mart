"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Merchant Discount Coupon & Promotional Code Engine            */
/*  Prompt 2: Full coupon CRUD dashboard with validation preview              */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createCoupon,
  fetchCouponsByShopId,
  updateCouponStatus,
  deleteCoupon,
  validateCoupon,
} from "@/services/couponService";
import type { Coupon } from "@/services/couponService";
import { formatRupees } from "@/lib/formatters";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function PlusIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>); }
function TrashIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>); }
function TagIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>); }
function CalendarIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>); }
function PercentIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>); }
function ToggleIcon({ active }: { active: boolean }) { return (<div className={`relative h-5 w-9 rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`}><div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${active ? "translate-x-[1.125rem]" : "translate-x-0.5"}`} /></div>); }
function SpinnerIcon() { return (<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>); }
function CheckIcon() { return (<svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>); }
function AlertIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>); }

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type DiscountType = "percentage" | "fixed";

interface CouponFormData {
  code: string;
  discountType: DiscountType;
  discountValue: string; // string to allow empty input during editing
  expiryDate: string;
  /** Minimum order subtotal required for this coupon to apply. */
  minOrderAmount: string;
  /** Maximum number of times this coupon can be used (0 = unlimited). */
  usageLimit: string;
}

interface ValidationPreview {
  subtotal: number;
  discountAmount: number;
  finalAmount: number;
  message: string;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const EMPTY_FORM: CouponFormData = {
  code: "",
  discountType: "percentage",
  discountValue: "",
  expiryDate: "",
  minOrderAmount: "",
  usageLimit: "",
};

const PREVIEW_SUBTOTALS = [500, 1000, 2500, 5000, 10000];

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

interface CouponManagerProps {
  shopId: string;
}

export default function CouponManager({ shopId }: CouponManagerProps) {
  const supabase = useMemo(() => createClient(), []);

  // ── State ───────────────────────────────────────────────────────────────
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CouponFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CouponFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Validation preview
  const [previewSubtotal, setPreviewSubtotal] = useState(1000);

  // ── Fetch coupons on mount ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchCouponsByShopId(shopId);
        if (!cancelled) {
          if (result.success) {
            setCoupons(result.data);
          } else {
            setError(result.error);
          }
        }
      } catch {
        if (!cancelled) setError("Failed to load coupons.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [shopId]);

  // Expose reload function for callers
  const loadCoupons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCouponsByShopId(shopId);
      if (result.success) {
        setCoupons(result.data);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Failed to load coupons.");
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  // ── Validation preview (derived — no effect needed) ─────────────────────
  const preview = useMemo<ValidationPreview | null>(() => {
    const discountValue = parseFloat(form.discountValue);
    if (!form.code.trim() || Number.isNaN(discountValue) || discountValue <= 0) {
      return null;
    }

    let discountAmount = 0;
    if (form.discountType === "percentage") {
      discountAmount = Math.round(previewSubtotal * (Math.min(discountValue, 100) / 100));
    } else {
      discountAmount = Math.min(discountValue, previewSubtotal);
    }

    const minOrder = parseFloat(form.minOrderAmount);
    let message = "";
    let valid = true;

    if (discountAmount > previewSubtotal) {
      discountAmount = previewSubtotal;
    }

    if (minOrder && !Number.isNaN(minOrder) && previewSubtotal < minOrder) {
      valid = false;
      message = `Minimum order of Rs. ${minOrder.toLocaleString()} required`;
    } else if (discountAmount > 0) {
      message = `You save Rs. ${discountAmount.toLocaleString()}`;
    }

    return {
      subtotal: previewSubtotal,
      discountAmount: valid ? discountAmount : 0,
      finalAmount: valid ? previewSubtotal - discountAmount : previewSubtotal,
      message,
    };
  }, [form, previewSubtotal]);

  // ── Form validation ─────────────────────────────────────────────────────
  const validateForm = useCallback((): boolean => {
    const errors: Partial<Record<keyof CouponFormData, string>> = {};

    if (!form.code.trim()) {
      errors.code = "Coupon code is required.";
    } else if (form.code.trim().length < 3) {
      errors.code = "Code must be at least 3 characters.";
    } else if (!/^[A-Z0-9_-]+$/.test(form.code.trim().toUpperCase())) {
      errors.code = "Only letters, numbers, hyphens, and underscores allowed.";
    }

    const discountValue = parseFloat(form.discountValue);
    if (!form.discountValue || Number.isNaN(discountValue)) {
      errors.discountValue = "Discount value is required.";
    } else if (discountValue <= 0) {
      errors.discountValue = "Must be greater than zero.";
    } else if (form.discountType === "percentage" && discountValue > 100) {
      errors.discountValue = "Percentage cannot exceed 100%.";
    }

    const minOrder = parseFloat(form.minOrderAmount);
    if (form.minOrderAmount && (!Number.isNaN(minOrder) && minOrder < 0)) {
      errors.minOrderAmount = "Cannot be negative.";
    }

    const usageLimit = parseInt(form.usageLimit, 10);
    if (form.usageLimit && (!Number.isNaN(usageLimit) && usageLimit < 0)) {
      errors.usageLimit = "Cannot be negative.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form]);

  // ── Submit new coupon ───────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    setSubmitStatus(null);

    try {
      const discountPercent = form.discountType === "percentage" ? parseFloat(form.discountValue) : undefined;
      const discountAmount = form.discountType === "fixed" ? parseFloat(form.discountValue) : undefined;
      const minOrder = parseFloat(form.minOrderAmount);
      const usageLimit = parseInt(form.usageLimit, 10);

      const result = await createCoupon(
        shopId,
        form.code.trim(),
        discountPercent,
        discountAmount,
        form.expiryDate || undefined,
        {
          minOrderAmount: Number.isNaN(minOrder) ? 0 : minOrder,
          usageLimit: Number.isNaN(usageLimit) ? 0 : usageLimit,
        },
      );

      if (result.success) {
        setSubmitStatus({ type: "success", message: `Coupon "${result.data.code}" created!` });
        setForm(EMPTY_FORM);
        setShowForm(false);
        loadCoupons();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("trendmart:coupons-updated"));
        }
      } else {
        setSubmitStatus({ type: "error", message: result.error });
      }
    } catch {
      setSubmitStatus({ type: "error", message: "Failed to create coupon." });
    } finally {
      setSubmitting(false);
    }
  }, [form, shopId, validateForm, loadCoupons]);

  // ── Toggle coupon active status ─────────────────────────────────────────
  const handleToggleActive = useCallback(async (couponId: string, currentActive: boolean) => {
    // Optimistic update
    setCoupons((prev) =>
      prev.map((c) => (c.id === couponId ? { ...c, is_active: !currentActive } : c)),
    );

    try {
      const result = await updateCouponStatus(couponId, !currentActive);
      if (!result.success) {
        // Rollback
        setCoupons((prev) =>
          prev.map((c) => (c.id === couponId ? { ...c, is_active: currentActive } : c)),
        );
      } else if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("trendmart:coupons-updated"));
      }
    } catch {
      // Rollback
      setCoupons((prev) =>
        prev.map((c) => (c.id === couponId ? { ...c, is_active: currentActive } : c)),
      );
    }
  }, []);

  // ── Delete coupon ───────────────────────────────────────────────────────
  const handleDelete = useCallback(async (couponId: string) => {
    const previous = coupons;
    setCoupons((prev) => prev.filter((c) => c.id !== couponId));

    try {
      const result = await deleteCoupon(couponId);
      if (!result.success) {
        setCoupons(previous);
      } else if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("trendmart:coupons-updated"));
      }
    } catch {
      setCoupons(previous);
    }
  }, [coupons]);

  // ── Expiry badge logic ──────────────────────────────────────────────────
  const getExpiryStatus = useCallback((coupon: Coupon): { label: string; color: string } => {
    if (!coupon.expiry_date) return { label: "No expiry", color: "text-zinc-500" };
    const expiry = new Date(coupon.expiry_date);
    const now = new Date();
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: "Expired", color: "text-red-600" };
    if (diffDays <= 7) return { label: `Expires in ${diffDays}d`, color: "text-amber-600" };
    return { label: `Expires ${expiry.toLocaleDateString("en-PK", { month: "short", day: "numeric" })}`, color: "text-emerald-600" };
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            <TagIcon /> Promotional Coupons
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Create discount codes for your customers
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((p) => !p); setSubmitStatus(null); }}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
            showForm
              ? "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
              : "bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700"
          }`}
        >
          <PlusIcon />
          {showForm ? "Cancel" : "New Coupon"}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-800 dark:bg-emerald-900/10">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Code */}
            <div className="sm:col-span-2">
              <label htmlFor="coupon-code" className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Coupon Code *
              </label>
              <input
                id="coupon-code"
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. SUMMER25, EID50"
                maxLength={20}
                className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-zinc-900 focus:outline-none focus:ring-2 ${
                  formErrors.code ? "border-red-300 focus:ring-red-500/20" : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
              />
              {formErrors.code && <p className="mt-1 text-xs text-red-500">{formErrors.code}</p>}
            </div>

            {/* Discount Type */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Discount Type</label>
              <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
                {(["percentage", "fixed"] as DiscountType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, discountType: type }))}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      form.discountType === type
                        ? "bg-white text-emerald-700 shadow-sm dark:bg-zinc-700 dark:text-emerald-400"
                        : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {type === "percentage" ? (<><PercentIcon /> %</>) : "Rs."} {type === "percentage" ? "Percentage" : "Fixed"}
                  </button>
                ))}
              </div>
            </div>

            {/* Discount Value */}
            <div>
              <label htmlFor="coupon-value" className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {form.discountType === "percentage" ? "Discount % *" : "Discount Amount (Rs.) *"}
              </label>
              <input
                id="coupon-value"
                type="number"
                value={form.discountValue}
                onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                placeholder={form.discountType === "percentage" ? "25" : "500"}
                min="1"
                step="1"
                className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                  formErrors.discountValue ? "border-red-300 focus:ring-red-500/20" : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
              />
              {formErrors.discountValue && <p className="mt-1 text-xs text-red-500">{formErrors.discountValue}</p>}
            </div>

            {/* Minimum Order Amount */}
            <div>
              <label htmlFor="coupon-min" className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Min. Order Amount <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="coupon-min"
                type="number"
                value={form.minOrderAmount}
                onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: e.target.value }))}
                placeholder="e.g. 1000"
                min="0"
                step="100"
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              {formErrors.minOrderAmount && <p className="mt-1 text-xs text-red-500">{formErrors.minOrderAmount}</p>}
            </div>

            {/* Usage Limit */}
            <div>
              <label htmlFor="coupon-limit" className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Usage Limit <span className="font-normal text-zinc-400">(0 = unlimited)</span>
              </label>
              <input
                id="coupon-limit"
                type="number"
                value={form.usageLimit}
                onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                placeholder="0"
                min="0"
                step="1"
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Expiry Date */}
            <div className="sm:col-span-2">
              <label htmlFor="coupon-expiry" className="mb-1 flex items-center gap-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                <CalendarIcon /> Expiry Date <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="coupon-expiry"
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Live Validation Preview */}
          {preview && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-800 dark:bg-zinc-800">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Preview at different cart sizes
              </h4>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {PREVIEW_SUBTOTALS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPreviewSubtotal(val)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                      previewSubtotal === val
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {formatRupees(val)}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Subtotal:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatRupees(preview.subtotal)}</span>
              </div>
              {preview.discountAmount > 0 && (
                <div className="flex items-center justify-between text-sm border-t border-zinc-100 pt-1 mt-1 dark:border-zinc-700">
                  <span className="text-emerald-600 dark:text-emerald-400">Discount:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">-{formatRupees(preview.discountAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-base font-bold border-t border-zinc-100 pt-1 mt-1 dark:border-zinc-700">
                <span className="text-zinc-800 dark:text-zinc-200">Total:</span>
                <span className="text-emerald-700 dark:text-emerald-300">{formatRupees(preview.finalAmount)}</span>
              </div>
              {preview.message && (
                <p className={`mt-2 text-xs font-medium ${preview.discountAmount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {preview.discountAmount > 0 ? <CheckIcon /> : <AlertIcon />} {preview.message}
                </p>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="mt-4 flex items-center justify-between">
            {submitStatus && (
              <p className={`text-xs font-semibold ${submitStatus.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
                {submitStatus.message}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <><SpinnerIcon /> Creating...</> : <><PlusIcon /> Create Coupon</>}
            </button>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Coupon List */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <SpinnerIcon />
        </div>
      ) : coupons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-10 text-center dark:border-zinc-700 dark:bg-zinc-800/50">
          <TagIcon />
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No coupons created yet.</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Create your first discount code above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((coupon) => {
            const expiry = getExpiryStatus(coupon);
            return (
              <div
                key={coupon.id}
                className={`flex items-center justify-between rounded-2xl border p-4 transition-all ${
                  coupon.is_active
                    ? "border-emerald-200 bg-white dark:border-emerald-800 dark:bg-zinc-800"
                    : "border-zinc-200 bg-zinc-50 opacity-60 dark:border-zinc-700 dark:bg-zinc-800/50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-sm font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      {coupon.code}
                    </span>
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {coupon.discount_percent
                        ? `${coupon.discount_percent}% OFF`
                        : coupon.discount_amount
                          ? `${formatRupees(coupon.discount_amount)} OFF`
                          : "No discount set"}
                    </span>
                  </div>
                  <p className={`mt-1 text-xs ${expiry.color}`}>{expiry.label}</p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(coupon.id, coupon.is_active)}
                    className="transition-opacity hover:opacity-80"
                    aria-label={coupon.is_active ? "Deactivate coupon" : "Activate coupon"}
                  >
                    <ToggleIcon active={coupon.is_active} />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDelete(coupon.id)}
                    className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                    aria-label="Delete coupon"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}