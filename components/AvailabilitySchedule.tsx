/* -------------------------------------------------------------------------- */
/*  TrendMart — Service Provider Availability & Working Hours Toggle (Prompt 5) */
/*                                                                             */
/*  Lets service professionals configure working days, active time slots,      */
/*  and emergency availability flags. Also used on the public storefront to    */
/*  show real-time status ("Available Now" vs. "Off Duty").                    */
/* -------------------------------------------------------------------------- */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AvailabilityDay {
  id?: string;
  shop_id?: string;
  day_of_week: number; // 0=Sun...6=Sat
  is_working_day: boolean;
  start_time: string; // "09:00"
  end_time: string; // "18:00"
  emergency_available: boolean;
}

interface AvailabilityScheduleProps {
  shopId: string;
  /** When true, renders a compact read-only status indicator (storefront). */
  compact?: boolean;
  /** When compact mode, show "Available Now" / "Off Duty" badge. */
  showLiveStatus?: boolean;
  /** Called when availability data is loaded (for parent components). */
  onDataLoaded?: (days: AvailabilityDay[]) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DAY_LABELS: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

const DAY_SHORT: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse "HH:MM" to total minutes since midnight. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Check if the provider is currently "available" based on schedule. */
function isCurrentlyAvailable(days: AvailabilityDay[]): { available: boolean; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const today = days.find(d => d.day_of_week === dayOfWeek);

  if (!today || !today.is_working_day) {
    // Find next working day
    const nextDay = days.find(d => d.day_of_week > dayOfWeek && d.is_working_day)
      ?? days.find(d => d.is_working_day);

    const nextLabel = nextDay
      ? `Opens ${DAY_LABELS[nextDay.day_of_week]} at ${nextDay.start_time}`
      : "Currently Off Duty";

    return { available: false, label: nextLabel };
  }

  const startMin = timeToMinutes(today.start_time);
  const endMin = timeToMinutes(today.end_time);

  if (currentMinutes >= startMin && currentMinutes < endMin) {
    return {
      available: true,
      label: `Available Now — Until ${today.end_time}`,
    };
  }

  if (currentMinutes < startMin) {
    return {
      available: false,
      label: `Opens Today at ${today.start_time}`,
    };
  }

  // Past closing time — find next working day
  const nextDay = days.find(d => d.day_of_week > dayOfWeek && d.is_working_day)
    ?? days.find(d => d.is_working_day);

  const nextLabel = nextDay
    ? `Opens ${DAY_LABELS[nextDay.day_of_week]} at ${nextDay.start_time}`
    : "Closed for Today";

  return { available: false, label: nextLabel };
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function ClockIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>); }
function ZapIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>); }
function SpinnerIcon() { return (<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>); }

// ─── Component ──────────────────────────────────────────────────────────────

export default function AvailabilitySchedule({
  shopId,
  compact = false,
  showLiveStatus = false,
  onDataLoaded,
}: AvailabilityScheduleProps) {
  const supabase = createClient();

  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load schedule ───────────────────────────────────────────────────────

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from("service_availability")
        .select("*")
        .eq("shop_id", shopId)
        .order("day_of_week", { ascending: true });

      if (dbError) throw dbError;

      if (data && data.length > 0) {
        setDays(data as AvailabilityDay[]);
        onDataLoaded?.(data as AvailabilityDay[]);
      } else {
        // Create default schedule (Mon-Sat working, Sun off)
        const defaults: AvailabilityDay[] = [0, 1, 2, 3, 4, 5, 6].map(d => ({
          day_of_week: d,
          is_working_day: d !== 0, // Sunday off
          start_time: "09:00",
          end_time: "18:00",
          emergency_available: false,
        }));
        setDays(defaults);
        onDataLoaded?.(defaults);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule.");
    } finally {
      setLoading(false);
    }
  }, [supabase, shopId, onDataLoaded]);

  useEffect(() => {
    loadSchedule();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // ── Save schedule ───────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const upserts = days.map(day => ({
        shop_id: shopId,
        day_of_week: day.day_of_week,
        is_working_day: day.is_working_day,
        start_time: day.start_time,
        end_time: day.end_time,
        emergency_available: day.emergency_available,
      }));

      const { error: dbError } = await supabase
        .from("service_availability")
        .upsert(upserts, { onConflict: "shop_id,day_of_week" });

      if (dbError) throw dbError;

      // Success — the parent can show a toast
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }, [supabase, shopId, days]);

  // ── Day toggle ──────────────────────────────────────────────────────────

  const toggleWorkingDay = useCallback((dayOfWeek: number) => {
    setDays(prev => prev.map(d =>
      d.day_of_week === dayOfWeek ? { ...d, is_working_day: !d.is_working_day } : d
    ));
  }, []);

  const updateTime = useCallback((dayOfWeek: number, field: "start_time" | "end_time", value: string) => {
    setDays(prev => prev.map(d =>
      d.day_of_week === dayOfWeek ? { ...d, [field]: value } : d
    ));
  }, []);

  const toggleEmergency = useCallback((dayOfWeek: number) => {
    setDays(prev => prev.map(d =>
      d.day_of_week === dayOfWeek ? { ...d, emergency_available: !d.emergency_available } : d
    ));
  }, []);

  // ── Live status computation ────────────────────────────────────────────

  const liveStatus = useMemo(() => {
    if (!showLiveStatus || days.length === 0) return null;
    return isCurrentlyAvailable(days);
  }, [showLiveStatus, days]);

  // ── Compact storefront view ────────────────────────────────────────────

  if (compact) {
    if (loading) {
      return (
        <div className="animate-pulse inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800">
          <div className="h-2 w-2 rounded-full bg-zinc-300" />
          <div className="h-3 w-20 rounded bg-zinc-200 dark:bg-zinc-700" />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {/* Live Status Badge */}
        {liveStatus && (
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
            liveStatus.available
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}>
            <span className={`h-2 w-2 rounded-full ${
              liveStatus.available ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
            }`} />
            {liveStatus.label}
          </div>
        )}

        {/* Day pill strip */}
        <div className="flex flex-wrap gap-1">
          {days.filter(d => d.is_working_day).map(day => (
            <span
              key={day.day_of_week}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
            >
              <ClockIcon />
              {DAY_SHORT[day.day_of_week]} {day.start_time}–{day.end_time}
              {day.emergency_available && (
                <span className="ml-0.5 text-red-500" title="Emergency available"><ZapIcon /></span>
              )}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // ── Full management view (dashboard) ──────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SpinnerIcon />
        <span className="ml-2 text-sm text-zinc-500">Loading schedule...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Working Hours</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Configure your business days, active hours, and emergency availability.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-600/25 transition-all hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <><SpinnerIcon /> Saving...</> : "Save Schedule"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Live Status Banner */}
      {liveStatus && (
        <div className={`rounded-xl border p-4 ${
          liveStatus.available
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
            : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50"
        }`}>
          <div className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${
              liveStatus.available ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
            }`} />
            <span className={`text-sm font-semibold ${
              liveStatus.available
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-zinc-600 dark:text-zinc-400"
            }`}>
              {liveStatus.available ? "You are currently showing as AVAILABLE" : "You are showing as OFF DUTY"}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {liveStatus.label} — This is what customers see on your storefront.
          </p>
        </div>
      )}

      {/* Day-by-Day Configuration */}
      <div className="space-y-3">
        {days.map(day => (
          <div
            key={day.day_of_week}
            className={`rounded-xl border p-4 transition-colors ${
              day.is_working_day
                ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                : "border-dashed border-zinc-200 bg-zinc-50/50 opacity-60 dark:border-zinc-800 dark:bg-zinc-800/20"
            }`}
          >
            <div className="flex items-center gap-4">
              {/* Day toggle */}
              <button
                type="button"
                onClick={() => toggleWorkingDay(day.day_of_week)}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                  day.is_working_day
                    ? "bg-orange-600 text-white"
                    : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
                }`}
                title={`Toggle ${DAY_LABELS[day.day_of_week]}`}
              >
                {DAY_SHORT[day.day_of_week]}
              </button>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${day.is_working_day ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 line-through dark:text-zinc-500"}`}>
                  {DAY_LABELS[day.day_of_week]}
                </p>

                {day.is_working_day ? (
                  <div className="mt-2 flex items-center gap-3">
                    {/* Start time */}
                    <div className="flex items-center gap-1.5">
                      <ClockIcon />
                      <input
                        type="time"
                        value={day.start_time}
                        onChange={(e) => updateTime(day.day_of_week, "start_time", e.target.value)}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-900 focus:border-orange-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                      <span className="text-xs text-zinc-400">to</span>
                      <input
                        type="time"
                        value={day.end_time}
                        onChange={(e) => updateTime(day.day_of_week, "end_time", e.target.value)}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-900 focus:border-orange-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </div>

                    {/* Emergency Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleEmergency(day.day_of_week)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        day.emergency_available
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      <ZapIcon />
                      {day.emergency_available ? "Emergency OK" : "No Emergency"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Day off — not accepting appointments</p>
                )}
              </div>

              {/* Status dot */}
              <div className={`h-2 w-2 rounded-full shrink-0 ${
                day.is_working_day ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
              }`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
