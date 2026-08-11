"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import DealCard from "@/components/DealCard";
import {
  formatOfferDayLabel,
  isDealActiveOnDate,
  listOfferDayKeys,
  toPkDateKey,
  type ShopDeal,
} from "@/lib/dealSchedule";
import { fetchActiveDeals } from "@/services/dealService";

type FilterMode = "today" | "featured" | "upcoming" | "all";

function DealsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qParam = searchParams.get("q") ?? "";
  const filterParam = (searchParams.get("filter") as FilterMode | null) ?? "today";

  const [deals, setDeals] = useState<ShopDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(qParam);
  const [filter, setFilter] = useState<FilterMode>(
    ["today", "featured", "upcoming", "all"].includes(filterParam) ? filterParam : "today",
  );
  const [dayKey, setDayKey] = useState<string | null>(null);

  const todayKey = toPkDateKey();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchActiveDeals();
    if (result.success) setDeals(result.data);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const onDeals = () => void load();
    window.addEventListener("trendmart:deals-updated", onDeals);
    return () => window.removeEventListener("trendmart:deals-updated", onDeals);
  }, [load]);

  useEffect(() => {
    setQuery(qParam);
    setFilter(
      ["today", "featured", "upcoming", "all"].includes(filterParam) ? filterParam : "today",
    );
  }, [qParam, filterParam]);

  const syncUrl = useCallback(
    (next: { q?: string; filter?: FilterMode }) => {
      const params = new URLSearchParams();
      const q = next.q !== undefined ? next.q : query;
      const f = next.filter !== undefined ? next.filter : filter;
      if (q.trim()) params.set("q", q.trim());
      if (f && f !== "today") params.set("filter", f);
      const qs = params.toString();
      router.replace(qs ? `/deals?${qs}` : "/deals", { scroll: false });
    },
    [router, query, filter],
  );

  const offerDays = useMemo(() => listOfferDayKeys(deals, 14, todayKey), [deals, todayKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = deals.filter((d) => d.is_active);

    if (dayKey) {
      list = list.filter((d) => isDealActiveOnDate(d, dayKey));
    } else if (filter === "today") {
      list = list.filter((d) => isDealActiveOnDate(d, todayKey));
    } else if (filter === "featured") {
      list = list.filter((d) => d.is_featured && isDealActiveOnDate(d, todayKey));
    } else if (filter === "upcoming") {
      list = list.filter((d) => {
        if (isDealActiveOnDate(d, todayKey)) return false;
        return offerDays.some((k) => k !== todayKey && isDealActiveOnDate(d, k));
      });
    }

    if (q) {
      list = list.filter((d) => {
        const hay = [
          d.title,
          d.description ?? "",
          d.badge_text ?? "",
          d.shop_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return list.slice().sort((a, b) => {
      const af = a.is_featured ? 1 : 0;
      const bf = b.is_featured ? 1 : 0;
      if (bf !== af) return bf - af;
      const ai = a.image_url ? 1 : 0;
      const bi = b.image_url ? 1 : 0;
      if (bi !== ai) return bi - ai;
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
  }, [deals, query, filter, dayKey, todayKey, offerDays]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setDayKey(null);
    syncUrl({ q: query });
  };

  const FILTERS: { value: FilterMode; label: string }[] = [
    { value: "today", label: "Live today" },
    { value: "featured", label: "Featured" },
    { value: "upcoming", label: "Upcoming" },
    { value: "all", label: "All active" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 page-stack px-3 py-3 pb-24 md:px-4 md:py-5 md:pb-8">
      <div className="mb-3">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          TrendMart deals
        </p>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
          All deals
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Browse live offers from local shops — search by title, badge, or store.
        </p>
      </div>

      <form onSubmit={handleSearch} className="mb-3">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search deals, badges, shops…"
            className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-20 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Search deals"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Search
          </button>
        </label>
      </form>

      <div className="mb-3 flex gap-1.5 overflow-x-auto scrollbar-none">
        {FILTERS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setFilter(opt.value);
              setDayKey(null);
              syncUrl({ filter: opt.value });
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
              filter === opt.value && !dayKey
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <Link
          href="/products?sort=for_you"
          className="shrink-0 rounded-full bg-teal-50 px-3 py-1.5 text-[11px] font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
        >
          For You products →
        </Link>
      </div>

      {offerDays.length > 0 ? (
        <section aria-label="Offer days" className="tm-cat-bar mb-3 -mx-3 sm:-mx-4">
          <div className="mb-1 flex items-center justify-between px-2 sm:px-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Jump to day
            </p>
            {dayKey ? (
              <button
                type="button"
                onClick={() => setDayKey(null)}
                className="text-[0.65rem] font-semibold text-zinc-500"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="tm-cat-scroll px-2 scrollbar-none sm:px-3">
            {offerDays.map((key) => {
              const active = dayKey === key;
              const count = deals.filter((d) => isDealActiveOnDate(d, key)).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDayKey(active ? null : key)}
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
      ) : null}

      <p className="mb-2 text-[11px] text-zinc-400 dark:text-zinc-500">
        {loading ? "Loading deals…" : `${filtered.length} deal${filtered.length === 1 ? "" : "s"}`}
      </p>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-10 text-center dark:border-zinc-700">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">No deals match</p>
          <p className="mt-1 text-xs text-zinc-500">
            Try another filter, clear search, or check back on offer days.
          </p>
          <Link
            href="/products"
            className="mt-3 inline-flex rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((deal, i) => (
            <DealCard key={deal.id} deal={deal} priority={i < 4} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DealsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-3 py-8 text-sm text-zinc-400">Loading deals…</div>
      }
    >
      <DealsInner />
    </Suspense>
  );
}
