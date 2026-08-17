"use client";

import {
  WEEKDAY_LABELS,
  addDaysToDateKey,
  formatOfferDayLabel,
  isDealActiveOnDate,
  listCalendarDayKeys,
  toPkDateKey,
  weekdayFromDateKey,
  type ShopDeal,
} from "@/lib/dealSchedule";

interface DealDayDateFilterProps {
  deals: ShopDeal[];
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string | null) => void;
  daysAhead?: number;
}

/**
 * Always-visible day + date filter for /deals.
 * - Weekday chips (Sun–Sat)
 * - Next N calendar days with counts
 * - Native date picker for any date
 */
export default function DealDayDateFilter({
  deals,
  selectedDateKey,
  onSelectDate,
  daysAhead = 14,
}: DealDayDateFilterProps) {
  const todayKey = toPkDateKey();
  const calendarKeys = listCalendarDayKeys(daysAhead, todayKey);
  const selectedWeekday =
    selectedDateKey != null ? weekdayFromDateKey(selectedDateKey) : null;
  const maxDate = addDaysToDateKey(todayKey, 60);

  const countOn = (key: string) =>
    deals.filter((d) => d.is_active && isDealActiveOnDate(d, key)).length;

  const pickWeekday = (weekday: number) => {
    // Prefer the next occurrence within the visible calendar strip
    const match = calendarKeys.find((k) => weekdayFromDateKey(k) === weekday);
    if (!match) return;
    onSelectDate(selectedDateKey === match ? null : match);
  };

  return (
    <section
      aria-label="Filter deals by day or date"
      className="mb-3 space-y-2.5 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/80 to-emerald-50/40 p-3 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-emerald-950/20"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            By day / date
          </p>
          <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
            {selectedDateKey
              ? `Showing deals on ${formatOfferDayLabel(selectedDateKey, todayKey)}`
              : "Pick a weekday or date to see whose deals run that day"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            <span className="text-zinc-400">Date</span>
            <input
              type="date"
              value={selectedDateKey ?? ""}
              min={todayKey}
              max={maxDate}
              onChange={(e) => {
                const v = e.target.value;
                onSelectDate(v || null);
              }}
              className="max-w-[9.5rem] border-0 bg-transparent p-0 text-[11px] font-semibold text-zinc-800 outline-none dark:text-zinc-100"
              aria-label="Pick a calendar date"
            />
          </label>
          {selectedDateKey ? (
            <button
              type="button"
              onClick={() => onSelectDate(null)}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Clear day
            </button>
          ) : null}
        </div>
      </div>

      {/* Weekday chips — labels only; counts live on the date strip below
          so a number cannot paint over Sun/Mon/Tue. */}
      <div className="relative z-10 flex gap-1.5 overflow-x-auto overflow-y-hidden scrollbar-none">
        {WEEKDAY_LABELS.map((label, weekday) => {
          const active = selectedWeekday === weekday && selectedDateKey != null;
          const nextKey = calendarKeys.find((k) => weekdayFromDateKey(k) === weekday);
          return (
            <button
              key={label}
              type="button"
              onClick={() => pickWeekday(weekday)}
              className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                active
                  ? "bg-amber-500 text-zinc-900 shadow-sm shadow-amber-500/30"
                  : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700"
              }`}
              aria-pressed={active}
              title={nextKey ? formatOfferDayLabel(nextKey, todayKey) : label}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Calendar day strip — always visible */}
      <div className="tm-cat-bar relative z-0 -mx-1 overflow-hidden">
        <div className="tm-cat-scroll px-1 scrollbar-none">
          {calendarKeys.map((key) => {
            const active = selectedDateKey === key;
            const count = countOn(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDate(active ? null : key)}
                className={`tm-cat-tab${active ? " is-active" : ""}`}
                aria-pressed={active}
              >
                <span className="tm-cat-tab-label">{formatOfferDayLabel(key, todayKey)}</span>
                {count > 0 ? <span className="tm-cat-tab-count">{count}</span> : null}
                <span className="tm-cat-tab-line" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
