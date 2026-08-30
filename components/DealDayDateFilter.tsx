"use client";

import { useRef } from "react";
import {
  WEEKDAY_LABELS,
  addDaysToDateKey,
  listCalendarDayKeys,
  toPkDateKey,
  weekdayFromDateKey,
} from "@/lib/dealSchedule";

interface DealDayDateFilterProps {
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string | null) => void;
  daysAhead?: number;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function formatCompactDateLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today";
  if (dateKey === addDaysToDateKey(todayKey, 1)) return "Tomorrow";
  const day = Number(dateKey.slice(8, 10));
  const month = Number(dateKey.slice(5, 7));
  return `${day} ${MONTH_SHORT[(month || 1) - 1] ?? ""}`;
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/** Weekday quick-picks + date picker — two clean rows. */
export default function DealDayDateFilter({
  selectedDateKey,
  onSelectDate,
  daysAhead = 14,
}: DealDayDateFilterProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const todayKey = toPkDateKey();
  const calendarKeys = listCalendarDayKeys(daysAhead, todayKey);
  const selectedWeekday =
    selectedDateKey != null ? weekdayFromDateKey(selectedDateKey) : null;
  const maxDate = addDaysToDateKey(todayKey, 60);

  const pickWeekday = (weekday: number) => {
    const match = calendarKeys.find((k) => weekdayFromDateKey(k) === weekday);
    if (!match) return;
    onSelectDate(selectedDateKey === match ? null : match);
  };

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch {
        /* fall through */
      }
    }
    input.click();
  };

  const dateLabel = selectedDateKey
    ? formatCompactDateLabel(selectedDateKey, todayKey)
    : "Pick a date";

  return (
    <section
      aria-label="Filter deals by day or date"
      className="mb-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-2.5 dark:border-zinc-800/80 dark:bg-zinc-900/40"
    >
      {/* Weekday chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-2">
        {WEEKDAY_LABELS.map((label, weekday) => {
          const active = selectedWeekday === weekday && selectedDateKey != null;
          const nextKey = calendarKeys.find((k) => weekdayFromDateKey(k) === weekday);
          const chipDate = nextKey ? formatCompactDateLabel(nextKey, todayKey) : null;

          return (
            <button
              key={label}
              type="button"
              onClick={() => pickWeekday(weekday)}
              disabled={!nextKey}
              className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl transition-all ${
                active
                  ? "bg-amber-500 text-zinc-900 shadow-md shadow-amber-500/25"
                  : nextKey
                    ? "bg-white text-zinc-600 ring-1 ring-zinc-200/80 hover:bg-zinc-50 hover:ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-700 dark:hover:ring-zinc-600"
                    : "cursor-not-allowed bg-zinc-100/60 text-zinc-300 ring-1 ring-zinc-100 dark:bg-zinc-900/60 dark:text-zinc-600 dark:ring-zinc-800"
              }`}
              aria-pressed={active}
              title={chipDate ? `${label} · ${chipDate}` : `${label} — not in range`}
            >
              <span className="text-[10px] font-bold leading-none">{label}</span>
              {nextKey ? (
                <span className={`mt-0.5 text-[9px] font-medium leading-none ${active ? "text-zinc-800/70" : "text-zinc-400 dark:text-zinc-500"}`}>
                  {Number(nextKey.slice(8, 10))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Date picker row */}
      <div className="flex items-center gap-1.5">
        <input
          ref={dateInputRef}
          type="date"
          value={selectedDateKey ?? ""}
          min={todayKey}
          max={maxDate}
          onChange={(e) => onSelectDate(e.target.value || null)}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={openDatePicker}
          className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
            selectedDateKey
              ? "border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100"
              : "border-zinc-200/80 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600"
          }`}
          aria-label={selectedDateKey ? `Selected: ${dateLabel}. Click to change.` : "Pick a date"}
          aria-haspopup="dialog"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className={selectedDateKey ? "text-amber-600 dark:text-amber-400" : "text-zinc-400"}>
              <CalendarIcon />
            </span>
            <span className="truncate text-[12px] font-semibold">{dateLabel}</span>
          </span>
          <ChevronDownIcon />
        </button>
        {selectedDateKey ? (
          <button
            type="button"
            onClick={() => onSelectDate(null)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-400 ring-1 ring-zinc-200/80 transition-colors hover:bg-zinc-50 hover:text-zinc-600 dark:bg-zinc-800 dark:text-zinc-500 dark:ring-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            aria-label="Clear date filter"
          >
            <ClearIcon />
          </button>
        ) : null}
      </div>
    </section>
  );
}
