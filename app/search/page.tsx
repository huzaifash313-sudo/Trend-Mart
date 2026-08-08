"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Shop } from "@/types";
import { SHOP_CATEGORIES, CATEGORY_ICONS, CATEGORY_GRADIENTS } from "@/types";
import { fetchShops } from "@/services/shopService";
import { globalSearch, autocomplete, type GlobalSearchItem, type SearchSuggestion } from "@/services/globalSearchService";
import { ErrorState } from "@/components/ErrorState";
import ShopMediaHeader, { ShopLogoAvatar } from "@/components/ShopMediaHeader";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function SearchIcon() {
  return (
    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
      <path d="M4 19l.5 2L6 21.5 4 22l-.5 2L3 22 1 21.5 3 21l.5-2z" />
      <path d="M20 4l.3 1.2L21.5 5.5 20 5.8l-.3 1.2-.3-1.2L18 5.5l1.2-.3L20 4z" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 9.4 7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.29 7 12 12 20.71 7" /><line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inner Component (reads searchParams via Suspense boundary)                 */
/* -------------------------------------------------------------------------- */

function SearchResultsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read from URL
  const query = searchParams.get("q") ?? "";
  const categoryParam = searchParams.get("category") ?? "";
  const sortParam = searchParams.get("sort") ?? "";
  const minPrice = searchParams.get("minPrice") ?? "";
  const maxPrice = searchParams.get("maxPrice") ?? "";

  // --- Global Search state (Prompt 1: cross-vendor product + shop discovery) ---
  const [globalResults, setGlobalResults] = useState<GlobalSearchItem[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [totalShops, setTotalShops] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [fuzzyExpanded, setFuzzyExpanded] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);

  // --- Legacy shop-only fallback ---
  const [shops, setShops] = useState<Shop[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local filter state (mirrors URL)
  const [localQuery, setLocalQuery] = useState(query);
  const [showFilters, setShowFilters] = useState(false);
  const [searchMode, setSearchMode] = useState<"global" | "shops_only">("global");

  // Build URL-friendly query string from filter state
  const updateUrl = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      const qs = params.toString();
      router.replace(`/search${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, searchParams],
  );

  const sortOptions = useMemo(
    () => [
      { label: "Sort: Default", value: "" },
      { label: "Newest First", value: "newest" },
      { label: "Price: Low to High", value: "price_asc" },
      { label: "Most Popular", value: "popular" },
    ],
    [],
  );

  // Fetch results: global search when a query is present, shops only otherwise
  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      setLoading(true);
      setError(null);

      if (query && searchMode === "global") {
        // Use the high-performance global search engine (Prompt 1)
        const result = await globalSearch(query, { limit: 20 });
        if (!cancelled) {
          if (result.success) {
            setGlobalResults(result.data.results);
            setSuggestions(result.data.suggestions);
            setTotalShops(result.data.totalShops);
            setTotalProducts(result.data.totalProducts);
            setFuzzyExpanded(result.data.fuzzyExpanded);
            setLatencyMs(result.data.latencyMs);
            setShops([]);
          } else {
            setError(result.error);
          }
          setLoading(false);
        }
      } else {
        // Fallback: fetch shops (category browse or shops-only mode)
        const result = await fetchShops({
          category: categoryParam || undefined,
          search: query || undefined,
          publicOnly: true,
        });
        if (!cancelled) {
          if (result.success) {
            setShops(result.data);
            setGlobalResults([]);
            setSuggestions([]);
          } else {
            setError(result.error);
          }
          setLoading(false);
        }
      }
    }

    loadResults();

    return () => {
      cancelled = true;
    };
  }, [query, categoryParam, searchMode]);

  // Handle search submit
  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSearchMode("global");
      updateUrl({ q: localQuery });
    },
    [localQuery, updateUrl],
  );

  // Handle category pill click
  const handleCategorySelect = useCallback(
    (cat: string) => {
      setSearchMode(cat === "All" && !query ? "shops_only" : "global");
      updateUrl({ category: cat === "All" ? "" : cat });
    },
    [updateUrl, query],
  );

  // Handle sort change
  const handleSortChange = useCallback(
    (sort: string) => {
      updateUrl({ sort });
    },
    [updateUrl],
  );

  const handlePriceFilter = useCallback(
    (min: string, max: string) => {
      updateUrl({ minPrice: min, maxPrice: max });
    },
    [updateUrl],
  );

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    router.replace("/search", { scroll: false });
    setLocalQuery("");
    setSearchMode("shops_only");
  }, [router]);

  // Use a suggestion to re-query
  const handleUseSuggestion = useCallback(
    (suggestion: string) => {
      setLocalQuery(suggestion);
      setSearchMode("global");
      updateUrl({ q: suggestion });
    },
    [updateUrl],
  );

  const hasActiveFilters = categoryParam || sortParam || minPrice || maxPrice;

  // --- Client-side filtering for global results ---
  const filteredGlobalResults = useMemo(() => {
    let results = [...globalResults];

    // Filter by category if selected
    if (categoryParam && categoryParam !== "All") {
      // For products, we need to know the shop's category — globalSearch results
      // don't carry shop categories directly, so we skip category filtering
      // on global results for now (shop category is on the shop, not product).
      // Instead we keep shops where category matches.
      results = results.filter((item) => {
        if (item.type === "shop" && item.category) {
          return item.category === categoryParam;
        }
        // Keep all products that match
        return true;
      });
    }

    // Price range filter (affects products only)
    if (minPrice && !isNaN(Number(minPrice))) {
      results = results.filter((item) => item.type === "shop" || (item.price !== undefined && item.price >= Number(minPrice)));
    }
    if (maxPrice && !isNaN(Number(maxPrice))) {
      results = results.filter((item) => item.type === "shop" || (item.price !== undefined && item.price <= Number(maxPrice)));
    }

    // Sorting
    if (sortParam === "price_asc") {
      results.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    } else if (sortParam === "price_desc") {
      results.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    }
    // Default: keep relevance-sorted order from the engine

    return results;
  }, [globalResults, categoryParam, minPrice, maxPrice, sortParam]);

  // --- Client-side sorting for shop-only results ---
  const sortedShops = useMemo(() => {
    const result = [...shops];
    if (sortParam === "newest") {
      result.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
    } else if (sortParam === "price_asc") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortParam === "popular") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [shops, sortParam]);

  // --- Combined result count for display ---
  const totalResultCount = globalResults.length > 0 ? totalShops + totalProducts : sortedShops.length;
  const isGlobalMode = globalResults.length > 0;

  // Toggle between global search and shop-only mode
  const toggleSearchMode = useCallback(() => {
    if (searchMode === "global") {
      setSearchMode("shops_only");
      setGlobalResults([]);
    } else {
      setSearchMode("global");
      if (query) updateUrl({ q: query });
    }
  }, [searchMode, query, updateUrl]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Search toolbar — sits under global Navbar (no second logo / fake search) */}
      <header className="sticky top-[3.25rem] z-30 border-b border-zinc-200 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 sm:top-[3.5rem]">
        <div className="mx-auto max-w-6xl px-4 py-2.5">
          <div className="flex items-center gap-2 sm:gap-3">
            <form onSubmit={handleSearch} className="flex min-w-0 flex-1">
              <div className="relative w-full">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                  <SearchIcon />
                </span>
                <input
                  type="search"
                  autoFocus
                  placeholder="Search products & shops…"
                  value={localQuery}
                  onChange={(e) => setLocalQuery(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  aria-label="Search products and shops"
                />
              </div>
            </form>

            {/* Search mode toggle */}
            {query && (
              <button
                type="button"
                onClick={toggleSearchMode}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  searchMode === "global"
                    ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
                title={searchMode === "global" ? "Smart search (products + shops)" : "Shop search only"}
              >
                <SparklesIcon />
                {searchMode === "global" ? "Smart" : "Shops"}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                showFilters || hasActiveFilters
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              <FilterIcon />
              Filters
              {hasActiveFilters && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                  !
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
        {/* Active filters summary */}
        {(query || categoryParam) && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <SearchIcon />
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {query ? `"${query}"` : "All"}
            </h1>
            {categoryParam && categoryParam !== "All" && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                {categoryParam}
              </span>
            )}
            {isGlobalMode && searchMode === "global" && (
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                🧠 Smart Search {fuzzyExpanded ? "· fuzzy" : ""}{latencyMs > 0 ? ` · ${latencyMs}ms` : ""}
              </span>
            )}
            {!loading && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                — {totalResultCount} result{totalResultCount !== 1 && "s"}
              </span>
            )}
          </div>
        )}

        {/* Spelling suggestions / "Did you mean?" */}
        {suggestions.length > 0 && !loading && (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              {suggestions[0].type === "correction" ? "💡 Did you mean?" : "🔥 Trending Searches"}
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleUseSuggestion(s.text)}
                  className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                >
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <div className="mb-5 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Filter & Sort</h2>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="rounded-full p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                aria-label="Close filters"
              >
                <XIcon />
              </button>
            </div>

            {/* Category Pills */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">Category</label>
              <div className="flex flex-wrap gap-2">
                {SHOP_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategorySelect(cat)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      (cat === "All" && !categoryParam) || categoryParam === cat
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {cat !== "All" && <span className="mr-1" aria-hidden="true">{CATEGORY_ICONS[cat] ?? ""}</span>}
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort Options */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">Sort By</label>
              <div className="flex flex-wrap gap-2">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSortChange(opt.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      sortParam === opt.value || (!sortParam && !opt.value)
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Range */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Price Range (PKR)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={minPrice}
                  onChange={(e) => handlePriceFilter(e.target.value, maxPrice)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <span className="text-xs text-zinc-400">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxPrice}
                  onChange={(e) => handlePriceFilter(minPrice, e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>

            {/* Clear All */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs font-medium text-red-500 hover:text-red-600 dark:hover:text-red-400"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div>
            <div className="mb-5 animate-pulse">
              <div className="mb-2 h-5 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-3 h-28 rounded-xl bg-zinc-200 sm:h-40 dark:bg-zinc-800" />
                  <div className="mb-2 h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="mb-2 h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-10 w-full rounded-full bg-zinc-200 dark:bg-zinc-800" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <ErrorState title="Search failed" message={error} onRetry={() => window.location.reload()} />
        )}

        {/* Empty state */}
        {!loading && !error && totalResultCount === 0 && (
          <div className="py-10 text-center">
            <p className="text-lg font-bold text-zinc-800 dark:text-zinc-200">No results found</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {query || categoryParam
                ? `We couldn't find any items matching "${query || categoryParam}". Try a different search.`
                : "Enter a search term to find products and shops."}
            </p>
            {/* Search Suggestion Chips */}
            <div className="mt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Popular Categories</p>
              <div className="flex flex-wrap justify-center gap-2">
                {(["Fashion & Apparel", "Electronics & Gadgets", "Health & Beauty", "Home & Living", "Books & Stationery"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategorySelect(cat)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                  >
                    {CATEGORY_ICONS[cat] ?? ""} {cat}
                  </button>
                ))}
              </div>
            </div>
            {query || categoryParam ? (
              <button
                type="button"
                onClick={() => router.push("/")}
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Browse All Shops
              </button>
            ) : null}
          </div>
        )}

        {/* Global Search Results Grid (Products + Shops) */}
        {!loading && !error && filteredGlobalResults.length > 0 && (
          <>
            {/* Tab bar showing product/shop counts */}
            {isGlobalMode && (
              <div className="mb-4 flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                  <PackageIcon /> {totalProducts} product{totalProducts !== 1 ? "s" : ""}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  🏪 {totalShops} store{totalShops !== 1 ? "s" : ""}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredGlobalResults.map((item) => {
                if (item.type === "shop") {
                  return (
                    <Link
                      key={`shop-${item.id}`}
                      href={`/shop/${item.id}`}
                      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <ShopMediaHeader
                        shopName={item.name}
                        bannerUrl={item.bannerUrl}
                        logoUrl={item.logoUrl ?? item.imageUrl}
                        size="card"
                        useNextImage={false}
                      >
                        <span className="absolute left-2 top-2 z-[1] rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 sm:left-3 sm:top-3 sm:text-xs dark:bg-emerald-900/60 dark:text-emerald-300">
                          Store
                        </span>
                      </ShopMediaHeader>
                      <div className="space-y-1.5 p-2.5 sm:space-y-2 sm:p-4">
                        <div className="flex items-start gap-2">
                          <ShopLogoAvatar
                            shopName={item.name}
                            logoUrl={item.logoUrl ?? item.imageUrl}
                            useNextImage={false}
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold text-zinc-900 sm:text-base dark:text-zinc-100">
                              {item.name}
                            </h3>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 sm:gap-2 sm:text-sm dark:text-zinc-400">
                              {item.category && (
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium sm:px-2.5 sm:text-xs dark:bg-zinc-800">
                                  {item.category}
                                </span>
                              )}
                              {item.location && (
                                <span className="inline-flex items-center gap-1 truncate">
                                  <PinIcon />{item.location}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {item.snippet && (
                          <p className="hidden truncate text-xs text-zinc-400 sm:block dark:text-zinc-500">{item.snippet}</p>
                        )}
                      </div>
                    </Link>
                  );
                }

                // Product card
                return (
                  <Link
                    key={`product-${item.id}`}
                    href={`/shop/${item.shopId}`}
                    className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-violet-400 to-purple-600 sm:h-40">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="select-none text-4xl font-bold text-white/70 sm:text-5xl">
                          {CATEGORY_ICONS[item.shopName ?? ""] ?? "📦"}
                        </span>
                      )}
                      <span className="absolute left-2 top-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 sm:left-3 sm:top-3 sm:text-xs dark:bg-violet-900/60 dark:text-violet-300">
                        Product
                      </span>
                    </div>
                    <div className="space-y-1.5 p-2.5 sm:space-y-2 sm:p-4">
                      <h3 className="truncate text-sm font-semibold text-zinc-900 sm:text-base dark:text-zinc-100">{item.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
                        {item.price && (
                          <span className="text-base font-bold text-emerald-600 sm:text-lg dark:text-emerald-400">
                            Rs. {item.price.toLocaleString("en-PK")}
                          </span>
                        )}
                        {!item.isAvailable && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600 sm:text-xs">Sold Out</span>
                        )}
                      </div>
                      <p className="hidden text-xs text-zinc-500 sm:block dark:text-zinc-400">
                        {item.shopName && <span>🏪 {item.shopName}</span>}
                        {item.snippet && <span className="ml-2 text-zinc-400">{item.snippet.slice(0, 60)}</span>}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* Legacy Shop Results Grid (fallback) */}
        {!loading && !error && sortedShops.length > 0 && filteredGlobalResults.length === 0 && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {sortedShops.map((shop) => (
              <Link
                key={shop.id}
                href={`/shop/${shop.id}`}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
              >
                {/* Banner + logo — separate slots */}
                <ShopMediaHeader
                  shopName={shop.name}
                  bannerUrl={shop.banner_url}
                  logoUrl={shop.logo_url}
                  size="card"
                  useNextImage={false}
                >
                  {shop.is_live && (
                    <span className="absolute left-2 top-2 z-[1] animate-pulse rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white sm:left-3 sm:top-3 sm:text-xs">
                      LIVE
                    </span>
                  )}
                  {shop.operating_status && (
                    <span className="absolute bottom-2 right-2 z-[1] rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                      {shop.operating_status}
                    </span>
                  )}
                </ShopMediaHeader>

                {/* Info — logo beside name */}
                <div className="space-y-1.5 p-2.5 sm:space-y-2 sm:p-4">
                  <div className="flex items-start gap-2">
                    <ShopLogoAvatar
                      shopName={shop.name}
                      logoUrl={shop.logo_url}
                      useNextImage={false}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-zinc-900 sm:text-base dark:text-zinc-100">
                        {shop.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 sm:gap-2 sm:text-sm dark:text-zinc-400">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium sm:px-2.5 sm:text-xs dark:bg-zinc-800">
                          {shop.category}
                        </span>
                        <span className="inline-flex items-center gap-1 truncate">
                          <PinIcon />
                          {shop.location}
                        </span>
                      </div>
                    </div>
                  </div>
                  {shop.business_hours && (
                    <p className="hidden text-xs text-zinc-400 sm:block dark:text-zinc-500">{shop.business_hours}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Exported Page (wrapped in Suspense for useSearchParams)                    */
/* -------------------------------------------------------------------------- */

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <SearchResultsInner />
    </Suspense>
  );
}