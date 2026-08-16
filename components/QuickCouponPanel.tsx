"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createCoupon, fetchCouponsByShopId, deleteCoupon } from "@/services/couponService";
import type { Coupon } from "@/services/couponService";
import CustomSelect from "@/components/CustomSelect";

interface QuickCouponPanelProps {
  shopId: string;
  onChanged?: () => void;
}

export default function QuickCouponPanel({ shopId, onChanged }: QuickCouponPanelProps) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [expiry, setExpiry] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchCouponsByShopId(shopId);
    if (result.success) setCoupons(result.data);
    setLoading(false);
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const num = Number(value);
    if (!code.trim() || !(num > 0)) {
      setError("Enter a code and discount value.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await createCoupon(
      shopId,
      code.trim(),
      discountType === "percent" ? num : undefined,
      discountType === "amount" ? num : undefined,
      expiry ? new Date(expiry).toISOString() : undefined,
    );
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setCode("");
    setValue("");
    setExpiry("");
    await load();
    onChanged?.();
    window.dispatchEvent(new Event("trendmart:coupons-updated"));
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Coupon codes</h3>
        <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
          Customers apply these at checkout — not stamped on every product.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
        <input
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Code e.g. SAVE10"
          maxLength={24}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm uppercase dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <div className="grid grid-cols-2 gap-2">
          <CustomSelect
            value={discountType}
            onChange={(val) => setDiscountType(val as "percent" | "amount")}
            options={[
              { value: "percent", label: "Percent %" },
              { value: "amount", label: "Fixed Rs." },
            ]}
          />
          <input
            required
            type="number"
            min={1}
            step="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={discountType === "percent" ? "10" : "200"}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <input
          type="date"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          aria-label="Expiry date (optional)"
        />
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Create coupon"}
        </button>
      </form>

      {loading ? (
        <p className="text-xs text-zinc-400">Loading…</p>
      ) : coupons.length === 0 ? (
        <p className="text-xs text-zinc-400">No coupons yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {coupons.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                {c.code}
                <span className="ml-2 text-xs font-medium text-emerald-600">
                  {c.discount_percent != null
                    ? `${c.discount_percent}%`
                    : `Rs. ${Math.round(c.discount_amount || 0)}`}
                </span>
              </span>
              <button
                type="button"
                onClick={async () => {
                  await deleteCoupon(c.id);
                  await load();
                  onChanged?.();
                }}
                className="text-[0.65rem] font-semibold text-red-600"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
