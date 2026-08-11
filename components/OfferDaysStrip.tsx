"use client";

import {
  formatOfferDayLabel,
  isDealActiveOnDate,
  listOfferDayKeys,
  toPkDateKey,
  type ShopDeal,
} from "@/lib/dealSchedule";

interface OfferDaysStripProps {
  deals: ShopDeal[];
  selectedDateKey: string | null;
  onSelect: (dateKey: string | null) => void;
  daysAhead?: number;
  /**
   * `pills` — compact chips under Featured deals (home).
   * `bar` — full category-style tab bar (deals page).
   */
  variant?: "pills" | "bar";
  className?: string;
}

export default function OfferDaysStrip({
  deals,
  selectedDateKey,
  onSelect,
  daysAhead = 14,
  variant = "pills",
  className = "",
}: OfferDaysStripProps) {
  const todayKey = toPkDateKey();
  const keys = listOfferDayKeys(deals, daysAhead, todayKey);

  if (keys.length === 0) return null;

  if (variant === "bar") {
    return (
      <section aria-label="Offer days" className={`tm-cat-bar -mx-3 sm:-mx-4 ${className}`}>
        <div className="mb-1 flex items-center justify-between px-2 sm:px-3">
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Offer days
          </p>
          {selectedDateKey ? (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-[0.65rem] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="tm-cat-scroll px-2 scrollbar-none sm:px-3">
          {keys.map((key) => {
            const active = selectedDateKey === key;
            const count = deals.filter((d) => isDealActiveOnDate(d, key)).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(active ? null : key)}
                className={`tm-cat-tab${active ? " is-active" : ""}`}
                aria-pressed={active}
              >
                <span className="tm-cat-tab-label">{formatOfferDayLabel(key, todayKey)}</span>
                <span className="tm-cat-tab-count">{count}</span>
                <span className="tm-cat-tab-line" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // Compact pills — sits inside the Deals block, not a second filter bar
  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="group" aria-label="Offer days">
      <div className="-mx-0.5 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-0.5 pb-0.5 scrollbar-none">
        {keys.map((key) => {
          const active = selectedDateKey === key;
          const count = deals.filter((d) => isDealActiveOnDate(d, key)).length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(active ? null : key)}
              aria-pressed={active}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                active
                  ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {formatOfferDayLabel(key, todayKey)}
              <span className={`ml-1 ${active ? "text-white/80" : "text-zinc-400"}`}>{count}</span>
            </button>
          );
        })}
      </div>
      {selectedDateKey ? (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="shrink-0 text-[10px] font-semibold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
