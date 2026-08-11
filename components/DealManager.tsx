"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createShopDeal,
  deleteShopDeal,
  fetchDealsByShopId,
  updateShopDealStatus,
} from "@/services/dealService";
import {
  WEEKDAY_LABELS,
  formatDealSchedule,
  type DealScheduleType,
  type ShopDeal,
} from "@/lib/dealSchedule";

interface DealManagerProps {
  shopId: string;
  compact?: boolean;
  onChanged?: () => void;
}

const EMPTY = {
  title: "",
  description: "",
  schedule_type: "weekly" as DealScheduleType,
  weekdays: [] as number[],
  starts_on: "",
  ends_on: "",
  day_of_month: "1",
};

export default function DealManager({ shopId, compact = false, onChanged }: DealManagerProps) {
  const [deals, setDeals] = useState<ShopDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(!compact);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchDealsByShopId(shopId);
    if (result.success) setDeals(result.data);
    else setError(result.error);
    setLoading(false);
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleWeekday = (day: number) => {
    setForm((prev) => {
      const has = prev.weekdays.includes(day);
      return {
        ...prev,
        weekdays: has ? prev.weekdays.filter((d) => d !== day) : [...prev.weekdays, day].sort(),
      };
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await createShopDeal(shopId, {
      title: form.title,
      description: form.description,
      schedule_type: form.schedule_type,
      weekdays: form.weekdays,
      starts_on: form.starts_on || undefined,
      ends_on: form.ends_on || undefined,
      day_of_month: form.day_of_month ? Number(form.day_of_month) : undefined,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setForm(EMPTY);
    setShowForm(false);
    await load();
    onChanged?.();
    window.dispatchEvent(new Event("trendmart:deals-updated"));
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Store deals</h3>
          <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
            Weekly days, date range, or monthly date — shown on banners & offer filters.
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Add deal
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Deal title</label>
            <input
              required
              maxLength={80}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Friday Biryani Deal"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Schedule</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["weekly", "Weekly"],
                  ["date_range", "Date range"],
                  ["monthly", "Monthly"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, schedule_type: key }))}
                  className={`rounded-lg px-2 py-2 text-[0.7rem] font-semibold ${
                    form.schedule_type === key
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {form.schedule_type === "weekly" ? (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, day) => {
                const on = form.weekdays.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${
                      on
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {form.schedule_type === "date_range" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[0.65rem] font-medium text-zinc-500">From</label>
                <input
                  type="date"
                  required
                  value={form.starts_on}
                  onChange={(e) => setForm((f) => ({ ...f, starts_on: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[0.65rem] font-medium text-zinc-500">To</label>
                <input
                  type="date"
                  required
                  value={form.ends_on}
                  onChange={(e) => setForm((f) => ({ ...f, ends_on: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          ) : null}

          {form.schedule_type === "monthly" ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Day of month
              </label>
              <select
                value={form.day_of_month}
                onChange={(e) => setForm((f) => ({ ...f, day_of_month: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Note (optional)
            </label>
            <input
              maxLength={160}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short detail for customers"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save deal"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="text-xs text-zinc-400">Loading deals…</p>
      ) : deals.length === 0 ? (
        <p className="text-xs text-zinc-400">No deals yet. Add weekly, range, or monthly offers.</p>
      ) : (
        <ul className="space-y-2">
          {deals.map((deal) => (
            <li
              key={deal.id}
              className="flex items-start justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{deal.title}</p>
                <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">{formatDealSchedule(deal)}</p>
                {!deal.is_active ? (
                  <span className="mt-0.5 inline-block text-[0.65rem] font-semibold text-amber-600">Paused</span>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    await updateShopDealStatus(deal.id, !deal.is_active);
                    await load();
                    onChanged?.();
                    window.dispatchEvent(new Event("trendmart:deals-updated"));
                  }}
                  className="rounded-lg px-2 py-1 text-[0.65rem] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {deal.is_active ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteShopDeal(deal.id);
                    await load();
                    onChanged?.();
                    window.dispatchEvent(new Event("trendmart:deals-updated"));
                  }}
                  className="rounded-lg px-2 py-1 text-[0.65rem] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
