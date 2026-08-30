"use client";

import { useRef } from "react";
import {
  WEEKDAY_LABELS,
  addDaysToDateKey,
  formatOfferDayLabel,
  listCalendarDayKeys,
  toPkDateKey,
  weekdayFromDateKey,
} from "@/lib/dealSchedule";

interface DealDayDateFilterProps {
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string | null) => void;
  daysAhead?: number;
}

function CalendarIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-3 w-3 shrink-0 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** Weekday chips + compact date dropdown (right). */
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
    ? formatOfferDayLabel(selectedDateKey, todayKey)
    : "Date";

  return (
    <section aria-label="Filter deals by day or date" className="mt-2.5 mb-2">
      <div className="flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
          {WEEKDAY_LABELS.map((label, weekday) => {
            const active = selectedWeekday === weekday && selectedDateKey != null;
            const nextKey = calendarKeys.find((k) => weekdayFromDateKey(k) === weekday);
            return (
              <button
                key={label}
                type="button"
                onClick={() => pickWeekday(weekday)}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none transition ${
                  active
                    ? "bg-amber-500 text-zinc-900 shadow-sm shadow-amber-500/25"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
                aria-pressed={active}
                title={nextKey ? formatOfferDayLabel(nextKey, todayKey) : label}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
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
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold leading-none transition-colors ${
              selectedDateKey
                ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600"
            }`}
            aria-label={selectedDateKey ? `Selected date: ${dateLabel}. Click to change.` : "Pick a date"}
            aria-haspopup="dialog"
          >
            <CalendarIcon />
            <span className="max-w-[4.5rem] truncate">{dateLabel}</span>
            <ChevronDownIcon />
          </button>
          {selectedDateKey ? (
            <button
              type="button"
              onClick={() => onSelectDate(null)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              aria-label="Clear date filter"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
