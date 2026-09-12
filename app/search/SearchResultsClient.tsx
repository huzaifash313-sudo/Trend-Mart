"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { suggestSearchCorrections } from "@/lib/fuzzySearch";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import SearchInput from "@/components/SearchInput";
import { getSafeImageUrl } from "@/services/storageService";
import { formatRupees } from "@/lib/formatters";
import { getShopPath } from "@/lib/shopSlug";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type ResultType = "product" | "shop" | "deal";

interface ProductResult {
  type: "product";
  id: string;
  name: string;
  price: number;
  original_price: number | null;
  discount_pct: number;
  image_url: string | null;
  shop_id: string;
  shop_name: string;
  shop_slug: string | null;
  short_code?: string | null;
  path?: string | null;
  score: number;
}

interface ShopResult {
  type: "shop";
  id: string;
  name: string;
  slug: string | null;
  category: string;
  location: string;
  logo_url: string | null;
  avg_rating: number;
  score: number;
}

interface DealResult {
  type: "deal";
  id: string;
  title: string;
  badge_text: string | null;
  image_url: string | null;
  is_featured: boolean;
  price: number;
  original_price: number | null;
  discount_pct: number;
  shop_id: string;
  shop_name: string;
  shop_slug: string | null;
  path?: string | null;
  score: number;
}

type SearchResult = ProductResult | ShopResult | DealResult;

interface SearchResponse {
  query: string;
  results: SearchResult[];
  related?: SearchResult[];
  counts: { products: number; shops: number; deals: number };
  hasMore?: boolean;
  nextOffset?: number;
}

/* -------------------------------------------------------------------------- */
/*  Small result cards                                                         */
/* -------------------------------------------------------------------------- */

function DiscountBadge({ pct }: { pct: number }) {
  if (pct <= 0) return null;
  return (
    <span className="absolute left-2 top-2 z-10 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
      {pct}% OFF
    </span>
  );
}

function ProductCard({ item }: { item: ProductResult }) {
  const img = getSafeImageUrl(item.image_url, "product", "card");
  const href =
    item.path?.trim() ||
    `/products/${encodeURIComponent(item.id)}`;
  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      <DiscountBadge pct={item.discount_pct} />
      <div className="relative aspect-square w-full overflow-hidden bg-zinc-50 dark:bg-zinc-800">
        {img ? (
          <Image
            src={img}
            alt={item.name}
            fill
            sizes="(max-width:640px) 45vw, 200px"
            className="object-cover transition group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl text-zinc-200">🛍️</div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
          {item.name}
        </p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{item.shop_name}</p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400">
            {formatRupees(item.price)}
          </span>
          {item.original_price && item.original_price > item.price ? (
            <span className="text-[11px] text-zinc-400 line-through">
              {formatRupees(item.original_price)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function ShopCard({ item }: { item: ShopResult }) {
  const img = getSafeImageUrl(item.logo_url, "shop", "avatar");
  const href = getShopPath({ id: item.id, name: item.name, slug: item.slug });
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
        {img ? (
          <Image
            src={img}
            alt={item.name}
            fill
            sizes="48px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xl">🏪</div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100">
          {item.name}
        </p>
        <p className="truncate text-[11px] text-zinc-400">{item.category}</p>
        {item.location ? (
          <p className="truncate text-[11px] text-zinc-400">{item.location}</p>
        ) : null}
        {item.avg_rating > 0 ? (
          <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-500">
            ★ {item.avg_rating.toFixed(1)}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function DealCard({ item }: { item: DealResult }) {
  const img = getSafeImageUrl(item.image_url, "product", "card");
  const href =
    item.path?.trim() ||
    `/deals?q=${encodeURIComponent(item.title)}&filter=all`;
  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm transition hover:shadow-md dark:border-amber-900/30 dark:bg-zinc-900"
    >
      {item.is_featured && (
        <span className="absolute right-2 top-2 z-10 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-zinc-900 shadow">
          FEATURED
        </span>
      )}
      <DiscountBadge pct={item.discount_pct} />
      <div className="relative aspect-square w-full overflow-hidden bg-amber-50 dark:bg-amber-950/20">
        {img ? (
          <Image
            src={img}
            alt={item.title}
            fill
            sizes="(max-width:640px) 45vw, 200px"
            className="object-cover transition group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl text-amber-200">%</div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
          {item.title}
        </p>
        {item.badge_text ? (
          <span className="w-fit rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            {item.badge_text}
          </span>
        ) : null}
        <p className="text-[11px] text-zinc-400">{item.shop_name}</p>
        {item.price > 0 ? (
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[14px] font-bold text-amber-600 dark:text-amber-400">
              {formatRupees(item.price)}
            </span>
            {item.original_price && item.original_price > item.price ? (
              <span className="text-[11px] text-zinc-400 line-through">
                {formatRupees(item.original_price)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section headers                                                            */
/* -------------------------------------------------------------------------- */

function SectionHeader({
  icon,
  label,
  count,
  href,
}: {
  icon: string;
  label: string;
  count: number;
  href: string;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
        <span>{icon}</span>
        {label}
        <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {count}
        </span>
      </h2>
      <Link
        href={href}
        className="text-[11px] font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
      >
        See all →
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab filter                                                                 */
/* -------------------------------------------------------------------------- */

type Tab = "all" | "products" | "shops" | "deals";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "products", label: "Products" },
  { value: "shops", label: "Shops" },
  { value: "deals", label: "Deals" },
];

/* -------------------------------------------------------------------------- */
/*  Main client                                                                */
/* -------------------------------------------------------------------------- */

export default function SearchResultsClient({
  initialQ = "",
  initialType = "all",
}: {
  initialQ?: string;
  initialType?: Tab;
}) {
  const router = useRouter();
  const qParam = initialQ;
  const typeParam = initialType;

  const [query, setQuery]       = useState(qParam);
  const [activeTab, setActiveTab] = useState<Tab>(
    TABS.some((t) => t.value === typeParam) ? typeParam : "all",
  );
  const [data, setData]         = useState<SearchResponse | null>(null);
  const [related, setRelated]   = useState<SearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]   = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError]       = useState<string | null>(null);
  const abortRef                = useRef<AbortController | null>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreRef             = useRef<HTMLDivElement | null>(null);
  const dataRef                 = useRef<SearchResponse | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /* ── Core fetch ─────────────────────────────────────────────────────── */
  const doSearch = useCallback(async (q: string, type: Tab, opts?: { append?: boolean; offset?: number }) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setData(null);
      setRelated([]);
      setHasMore(false);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const append = opts?.append === true;
    const offset = opts?.offset ?? 0;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams({
        q: trimmed,
        limit: "12",
        offset: String(offset),
      });
      if (type !== "all") params.set("type", type);
      const res  = await fetch(`/api/search?${params}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error("Search failed");
      const json = (await res.json()) as SearchResponse;

      if (append && dataRef.current) {
        const prev = dataRef.current;
        const seen = new Set(prev.results.map((r) => `${r.type}:${r.id}`));
        const merged = [
          ...prev.results,
          ...json.results.filter((r) => !seen.has(`${r.type}:${r.id}`)),
        ];
        setData({
          ...json,
          results: merged,
          counts: {
            products: merged.filter((r) => r.type === "product").length,
            shops: merged.filter((r) => r.type === "shop").length,
            deals: merged.filter((r) => r.type === "deal").length,
          },
        });
      } else {
        setData(json);
        setRelated(json.related ?? []);
      }
      setHasMore(Boolean(json.hasMore) && (type === "products" || type === "deals"));
      setNextOffset(json.nextOffset ?? offset + 12);
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        setError("Search failed. Please try again.");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  /* ── Run when URL param changes (Enter / tab change) ────────────────── */
  useEffect(() => {
    void doSearch(qParam, activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam, activeTab]);

  /* ── Live / debounced search as user types (400 ms) ─────────────────── */
  useEffect(() => {
    const trimmed = query.trim();
    // Don't re-fire if query matches the URL param (already fetched above)
    if (trimmed === qParam.trim()) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!trimmed) { setData(null); return; }

    debounceRef.current = setTimeout(() => {
      void doSearch(trimmed, activeTab);
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeTab]);

  /* ── Form submit → update URL (persist query in browser history) ────── */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const params = new URLSearchParams({ q });
    if (activeTab !== "all") params.set("type", activeTab);
    router.push(`/search?${params}`);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams({ q: qParam || query });
    if (tab !== "all") params.set("type", tab);
    router.replace(`/search?${params}`, { scroll: false });
  };

  // Split results by type
  const products = useMemo(
    () => (data?.results.filter((r): r is ProductResult => r.type === "product") ?? []),
    [data],
  );
  const shops = useMemo(
    () => (data?.results.filter((r): r is ShopResult => r.type === "shop") ?? []),
    [data],
  );
  const deals = useMemo(
    () => (data?.results.filter((r): r is DealResult => r.type === "deal") ?? []),
    [data],
  );
  const relatedProducts = useMemo(
    () => related.filter((r): r is ProductResult => r.type === "product"),
    [related],
  );
  const relatedDeals = useMemo(
    () => related.filter((r): r is DealResult => r.type === "deal"),
    [related],
  );

  /* ── Infinite scroll (products / deals tabs only — light pages) ─────── */
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore || loading || loadingMore) return;
    if (activeTab !== "products" && activeTab !== "deals") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const q = (qParam || query).trim();
        if (!q) return;
        void doSearch(q, activeTab, { append: true, offset: nextOffset });
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, activeTab, qParam, query, nextOffset, doSearch]);

  const hasResults =
    data && (data.counts.products > 0 || data.counts.shops > 0 || data.counts.deals > 0);

  // "Did you mean" — empty results OR while typing a likely typo
  const suggestions = useMemo(
    () => {
      const source = (qParam || query).trim();
      if (source.length < 2) return [];
      if (hasResults) return [];
      return suggestSearchCorrections(source, 5);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasResults, qParam, query],
  );

  // Keep local input in sync when navigating via suggestion chips / history
  useEffect(() => {
    setQuery(qParam);
  }, [qParam]);

  // Keep tab in sync with browser back/forward on ?type=
  useEffect(() => {
    if (TABS.some((t) => t.value === typeParam)) {
      setActiveTab(typeParam);
    }
  }, [typeParam]);

  // Live correction chips under the bar (before submit) when spelling looks off
  const liveCorrections = useMemo(() => {
    const source = query.trim();
    if (source.length < 3 || loading || hasResults) return [];
    return suggestSearchCorrections(source, 4);
  }, [query, loading, hasResults]);

  // Display query — use live query if URL hasn't been updated yet
  const displayQ = qParam || query.trim();

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 page-stack px-3 py-3 pb-safe-nav md:px-4 md:py-5">
      {/* Search bar */}
      <SearchInput
        value={query}
        onChange={setQuery}
        onSubmit={handleSubmit}
        placeholder="Search products, shops, deals…"
        ariaLabel="Global search"
        showClearButton
        className="mb-2"
      />

      {liveCorrections.length > 0 && !data && query.trim().length >= 3 ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 px-0.5">
          <span className="text-[11px] text-zinc-400">Try:</span>
          {liveCorrections.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuery(s);
                router.push(`/search?q=${encodeURIComponent(s)}`);
              }}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {/* Tab strip */}
      <div className="tm-cat-bar -mx-3 sm:-mx-4 mb-3">
        <div className="tm-cat-scroll flex gap-1.5 px-3 sm:px-4">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTabChange(tab.value)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
                activeTab === tab.value
                  ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {tab.label}
              {data && tab.value !== "all" ? (
                <span className="ml-1 text-[10px] opacity-70">
                  {tab.value === "products"
                    ? data.counts.products
                    : tab.value === "shops"
                      ? data.counts.shops
                      : data.counts.deals}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-zinc-100 dark:border-zinc-800">
                <div className="aspect-square animate-pulse bg-zinc-100 dark:bg-zinc-800" />
                <div className="space-y-1.5 p-2.5">
                  <div className="h-3.5 w-[80%] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  <div className="h-3 w-[50%] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Empty state — query typed but no results */}
      {!loading && !error && displayQ && !hasResults && data && (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800">
            <span className="text-2xl">🔍</span>
          </div>
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
            No results for &ldquo;{displayQ}&rdquo;
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Try different keywords or check the spelling.
          </p>

          {/* "Did you mean" suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">Did you mean?</p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setQuery(s);
                      router.push(`/search?q=${encodeURIComponent(s)}`);
                    }}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href="/products"
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Browse Products
            </Link>
            <Link
              href="/deals"
              className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
            >
              View Deals
            </Link>
          </div>
        </div>
      )}

      {/* No query yet */}
      {!loading && !qParam && !query.trim() && (
        <div className="py-14 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/20">
            <span className="text-2xl">✨</span>
          </div>
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
            Search TrendsMart
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Find products, shops, and deals all in one place.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && hasResults && (
        <div className="space-y-8">
          {/* Products section */}
          {products.length > 0 && (activeTab === "all" || activeTab === "products") && (
            <section aria-label="Products">
              <SectionHeader
                icon="🛍️"
                label="Products"
                count={data!.counts.products}
                href={`/products?q=${encodeURIComponent(qParam)}`}
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {products.map((p) => (
                  <ProductCard key={p.id} item={p} />
                ))}
              </div>
            </section>
          )}

          {/* Shops section */}
          {shops.length > 0 && (activeTab === "all" || activeTab === "shops") && (
            <section aria-label="Shops">
              <SectionHeader
                icon="🏪"
                label="Shops"
                count={data!.counts.shops}
                href={`/search?q=${encodeURIComponent(qParam)}&type=shops`}
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {shops.map((s) => (
                  <ShopCard key={s.id} item={s} />
                ))}
              </div>
            </section>
          )}

          {/* Deals section */}
          {deals.length > 0 && (activeTab === "all" || activeTab === "deals") && (
            <section aria-label="Deals">
              <SectionHeader
                icon="🔥"
                label="Deals"
                count={data!.counts.deals}
                href={`/deals?q=${encodeURIComponent(qParam)}&filter=all`}
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {deals.map((d) => (
                  <DealCard key={d.id} item={d} />
                ))}
              </div>
            </section>
          )}

          {/* Soft matches — related after exact hits */}
          {(relatedProducts.length > 0 || relatedDeals.length > 0) &&
            (activeTab === "all" || activeTab === "products" || activeTab === "deals") && (
            <section aria-label="Related results" className="border-t border-zinc-100 pt-6 dark:border-zinc-800">
              <h2 className="mb-3 text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
                Related
              </h2>
              {relatedProducts.length > 0 && (activeTab === "all" || activeTab === "products") ? (
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {relatedProducts.map((p) => (
                    <ProductCard key={`rel-${p.id}`} item={p} />
                  ))}
                </div>
              ) : null}
              {relatedDeals.length > 0 && (activeTab === "all" || activeTab === "deals") ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {relatedDeals.map((d) => (
                    <DealCard key={`rel-${d.id}`} item={d} />
                  ))}
                </div>
              ) : null}
            </section>
          )}

          <div ref={loadMoreRef} className="h-1" aria-hidden />
          {loadingMore ? (
            <p className="py-3 text-center text-xs text-zinc-400">Loading more…</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
