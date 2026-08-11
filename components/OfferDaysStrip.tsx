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
}

export default function OfferDaysStrip({
  deals,
  selectedDateKey,
  onSelect,
  daysAhead = 14,
}: OfferDaysStripProps) {
  const todayKey = toPkDateKey();
  const keys = listOfferDayKeys(deals, daysAhead, todayKey);

  if (keys.length === 0) return null;

  return (
    <section aria-label="Offer days" className="tm-cat-bar -mx-3 sm:-mx-4">
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
