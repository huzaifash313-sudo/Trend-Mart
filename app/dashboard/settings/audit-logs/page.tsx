"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/types";
import { fetchMyShop } from "@/services/shopService";
import { fetchProductsByShopId } from "@/services/productService";

const PAGE_SIZE = 40;

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

interface ActivityEntry {
  id: string;
  label: string;
  timestamp: string;
  type: "created" | "updated";
}

function buildActivityLog(products: Product[]): ActivityEntry[] {
  const events: ActivityEntry[] = [];
  for (const p of products) {
    if (p.created_at) {
      events.push({
        id: `${p.id}-created`,
        label: `Added "${p.name}"`,
        timestamp: p.created_at,
        type: "created",
      });
    }
  }
  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export default function MerchantAuditLogsPage() {
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const shopResult = await fetchMyShop();
    if (!shopResult.success || !shopResult.data) {
      setLoading(false);
      return;
    }

    setShopId(shopResult.data.id);
    setShopName(shopResult.data.name);

    const prodResult = await fetchProductsByShopId(shopResult.data.id);
    if (prodResult.success) setProducts(prodResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allEntries = useMemo(() => buildActivityLog(products), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allEntries;
    return allEntries.filter((e) => e.label.toLowerCase().includes(q));
  }, [allEntries, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-bg)]">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/90">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2.5">
          <Link
            href="/dashboard/settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Back to settings"
          >
            <ChevronLeftIcon />
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Audit Logs</h1>
            <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {shopName ? `${shopName} · Settings & Preferences` : "Settings & Preferences"}
            </p>
          </div>
        </div>
      </header>

      <main className="page-stack mx-auto max-w-5xl px-3 py-4">
        <section className="mb-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <ClipboardIcon /> Product activity
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {loading
                  ? "Loading…"
                  : `${filtered.length} event${filtered.length === 1 ? "" : "s"} · ${PAGE_SIZE} per page`}
              </p>
            </div>
          </div>

          {!loading && allEntries.length > 0 && (
            <div className="relative mt-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search audit logs…"
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          )}
        </section>

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        )}

        {!loading && !shopId && (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500">No shop found. Create a shop first.</p>
            <Link href="/dashboard" className="mt-2 inline-block text-sm font-medium text-emerald-600 hover:underline">
              Go to Dashboard
            </Link>
          </div>
        )}

        {!loading && shopId && allEntries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No audit events yet. Product adds will appear here.
            </p>
          </div>
        )}

        {!loading && filtered.length === 0 && allEntries.length > 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white py-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500">No logs match your search.</p>
            <button
              type="button"
              onClick={() => setSearch("")}
              className="mt-2 text-xs font-semibold text-emerald-600 hover:underline"
            >
              Clear search
            </button>
          </div>
        )}

        {!loading && paged.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm" role="table" aria-label="Audit logs">
              <thead className="border-b border-zinc-100 dark:border-zinc-800">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Action
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((entry) => (
                  <tr key={entry.id} className="border-t border-zinc-50 dark:border-zinc-800/50">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            entry.type === "created" ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                          aria-hidden="true"
                        />
                        {entry.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-zinc-400 dark:text-zinc-500">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              ← Prev
            </button>
            <p className="text-xs text-zinc-400">
              Page {safePage} of {totalPages}
            </p>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              Next →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
