"use client";

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

/** Compact weekday row + date picker (right corner). */
export default function DealDayDateFilter({
  selectedDateKey,
  onSelectDate,
  daysAhead = 14,
}: DealDayDateFilterProps) {
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

  return (
    <section aria-label="Filter deals by day or date" className="mb-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none">
          {WEEKDAY_LABELS.map((label, weekday) => {
            const active = selectedWeekday === weekday && selectedDateKey != null;
            const nextKey = calendarKeys.find((k) => weekdayFromDateKey(k) === weekday);
            return (
              <button
                key={label}
                type="button"
                onClick={() => pickWeekday(weekday)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "bg-amber-500 text-zinc-900 shadow-sm shadow-amber-500/30"
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

        <div className="flex shrink-0 items-center gap-1">
          <label className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            <input
              type="date"
              value={selectedDateKey ?? ""}
              min={todayKey}
              max={maxDate}
              onChange={(e) => onSelectDate(e.target.value || null)}
              className="max-w-[8.5rem] border-0 bg-transparent p-0 text-[11px] font-semibold text-zinc-800 outline-none dark:text-zinc-100"
              aria-label="Pick a calendar date"
            />
          </label>
          {selectedDateKey ? (
            <button
              type="button"
              onClick={() => onSelectDate(null)}
              className="rounded-full px-1.5 py-1 text-[10px] font-semibold text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
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
