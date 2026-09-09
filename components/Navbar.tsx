"use client";

import { useState, useEffect, useLayoutEffect, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SidebarDrawer from "@/components/SidebarDrawer";
import NavbarNotificationButton from "@/components/NavbarNotificationButton";
import { useCart } from "@/context/CartContext";
import { getShopPath } from "@/lib/shopSlug";
import { isCartDockActive } from "@/lib/cartDockSession";
import { getFavoriteCount } from "@/services/wishlistService";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function HamburgerIcon() {
  return (
    <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function SearchNavIcon() {
  return (
    <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CartNavIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function WishlistNavIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/** Soft living backdrop behind the Gemini-style sticky brand bar. */
function TrendBackdrop() {
  const line =
    "M8 72 L48 58 L78 64 L120 42 L152 50 L200 28 L236 36 L286 18 L322 24 L368 10";

  return (
    <div className="tm-navbar-fx" aria-hidden="true">
      <div className="tm-navbar-bg-shift" />
      <div className="tm-navbar-soft-glow" />

      <svg
        className="tm-navbar-trend-svg"
        viewBox="0 0 400 90"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="tmTrendStroke" x1="0" y1="0" x2="400" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--tm-brand-300)" />
            <stop offset="45%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="var(--tm-sea-300)" />
          </linearGradient>
          <linearGradient id="tmTrendUnder" x1="0" y1="0" x2="0" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--tm-brand-400)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--tm-sea-500)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path
          className="tm-navbar-trend-area"
          d={`${line} L400 90 L0 90 Z`}
          fill="url(#tmTrendUnder)"
        />
        <path
          d={line}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          className="tm-navbar-trend-line"
          d={line}
          stroke="url(#tmTrendStroke)"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          className="tm-navbar-trend-arrow"
          d="M352 6 L392 6 L392 34 Z"
          fill="var(--tm-brand-200)"
        />
      </svg>
    </div>
  );
}

function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="tm-navbar-logo" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/trendsmart-mark.png?v=16"
        alt=""
        width={size}
        height={size}
        className="tm-navbar-logo-img h-full w-full object-contain"
        decoding="async"
      />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Navbar — Gemini-style sticky brand bar                                     */
/* -------------------------------------------------------------------------- */

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { totalItems } = useCart();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [portalReady, setPortalReady] = useState(false);
  const [cartDockActive, setCartDockActive] = useState(false);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [suggestItems, setSuggestItems] = useState<
    { type: string; id: string; label: string; href: string }[]
  >([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestAbort = useRef<AbortController | null>(null);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    setSearchOpen(false);
    setSearchQuery("");
    setSuggestItems([]);
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/");
    }
  };

  useEffect(() => {
    setCartDockActive(isCartDockActive());
    const onDock = () => setCartDockActive(isCartDockActive());
    window.addEventListener("tm:cart-dock", onDock);
    return () => window.removeEventListener("tm:cart-dock", onDock);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getFavoriteCount().then((n) => {
        if (!cancelled) setWishlistCount(Math.max(0, Number(n) || 0));
      });
    };
    refresh();
    window.addEventListener("favoritesUpdated", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("favoritesUpdated", refresh);
    };
  }, [pathname]);

  // Live navbar suggestions (products / shops / deals) — debounce 280ms
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestItems([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      suggestAbort.current?.abort();
      const ctrl = new AbortController();
      suggestAbort.current = ctrl;
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=4`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          results?: {
            type: string;
            id: string;
            name?: string;
            title?: string;
            path?: string;
            slug?: string | null;
            shop_slug?: string | null;
            shop_id?: string;
          }[];
        };
        const items = (json.results ?? []).slice(0, 6).map((r) => {
          if (r.type === "product") {
            return {
              type: "product",
              id: r.id,
              label: r.name ?? "Product",
              href: r.path || `/products?product=${encodeURIComponent(r.id)}`,
            };
          }
          if (r.type === "shop") {
            return {
              type: "shop",
              id: r.id,
              label: r.name ?? "Shop",
              href: getShopPath({
                id: r.id,
                name: r.name ?? "Shop",
                slug: r.slug ?? null,
              }),
            };
          }
          return {
            type: "deal",
            id: r.id,
            label: r.title ?? r.name ?? "Deal",
            href:
              r.path ||
              `/deals?q=${encodeURIComponent(r.title ?? q)}&filter=all`,
          };
        });
        setSuggestItems(items);
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") setSuggestItems([]);
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      suggestAbort.current?.abort();
    };
  }, [searchQuery]);

  // Auto-focus when mobile search opens
  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  // Standalone flows — these pages bring their own chrome (no navbar/sidebar).
  // Login keeps the normal storefront header so users can browse home/cart easily.
  const isStandalone =
    pathname === "/offline" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/t/");

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Drive the page offset so the whole storefront shifts for the pinned sidebar.
  useLayoutEffect(() => {
    if (isStandalone) return;
    const root = document.documentElement;
    if (sidebarOpen) {
      root.classList.add("tm-sidebar-open");
      root.classList.remove("tm-sidebar-collapsed");
    } else {
      root.classList.remove("tm-sidebar-open");
      root.classList.add("tm-sidebar-collapsed");
    }
    return () => {
      root.classList.remove("tm-sidebar-open");
      root.classList.remove("tm-sidebar-collapsed");
    };
  }, [isStandalone, sidebarOpen]);

  if (isStandalone) {
    return null;
  }

  return (
    <header className="tm-navbar-wrap">
      <div className="tm-navbar">
        <div className="tm-navbar-border" aria-hidden="true" />
        <TrendBackdrop />

        <div className="tm-navbar-inner">
          {/* Hamburger — mobile: opens drawer; desktop: toggles persistent sidebar */}
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(true);             // mobile drawer (hidden on desktop by CSS)
              setSidebarOpen((prev) => !prev); // desktop persistent sidebar toggle
            }}
            className="tm-navbar-icon-btn"
            aria-label="Toggle navigation menu"
          >
            <HamburgerIcon />
          </button>

          <Link href="/" className="tm-navbar-brand" aria-label="TrendsMart home">
            <BrandMark />
            <span className="tm-navbar-wordmark">TrendsMart</span>
          </Link>

          {/* ── Desktop search bar (lg+) — solid white pill, clearly visible on teal ── */}
          <form
            onSubmit={handleSearchSubmit}
            className="relative mx-2 hidden min-w-0 flex-1 lg:flex xl:mx-3"
            role="search"
          >
            <label className="relative flex w-full items-center">
              <span className="pointer-events-none absolute left-3.5 text-zinc-400">
                <SearchNavIcon />
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search shops, products, deals…"
                aria-label="Search shops and products"
                aria-autocomplete="list"
                className="w-full rounded-full border-0 bg-white py-[9px] pl-11 pr-5 text-sm text-zinc-800 placeholder:text-zinc-400 shadow-sm outline-none ring-0 transition-shadow focus:shadow-md focus:ring-2 focus:ring-white/60 dark:bg-white/15 dark:text-white dark:placeholder:text-white/50 dark:focus:ring-white/30"
              />
            </label>
            {suggestItems.length > 0 ? (
              <ul
                className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-72 overflow-auto rounded-2xl border border-zinc-200 bg-white py-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
                role="listbox"
              >
                {suggestItems.map((item) => (
                  <li key={`${item.type}-${item.id}`} role="option">
                    <Link
                      href={item.href}
                      onClick={() => {
                        setSearchQuery("");
                        setSuggestItems([]);
                      }}
                      className="flex items-center gap-2 px-3.5 py-2 text-sm text-zinc-800 hover:bg-emerald-50 dark:text-zinc-100 dark:hover:bg-emerald-950/40"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                        {item.type}
                      </span>
                      <span className="truncate font-medium">{item.label}</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <button
                    type="submit"
                    className="w-full px-3.5 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                  >
                    See all results for &ldquo;{searchQuery.trim()}&rdquo;
                  </button>
                </li>
              </ul>
            ) : null}
          </form>

          {/* ── Right-side actions (search + cart + alerts + wishlist) ── */}
          <div className="tm-navbar-actions">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="tm-navbar-icon-btn lg:hidden"
              aria-label="Search"
            >
              <SearchNavIcon />
            </button>

            <Link
              href="/cart"
              className="tm-navbar-icon-btn relative"
              aria-label={`Cart${totalItems > 0 ? `, ${totalItems} items` : ""}`}
            >
              <CartNavIcon />
              {totalItems > 0 && cartDockActive && (
                <span className="tm-navbar-badge" aria-hidden="true">
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </Link>

            <NavbarNotificationButton />

            <Link
              href="/wishlist"
              className="tm-navbar-icon-btn relative"
              aria-label={`Wishlist${wishlistCount > 0 ? `, ${wishlistCount} saved` : ""}`}
            >
              <WishlistNavIcon />
              {wishlistCount > 0 && (
                <span className="tm-navbar-badge" aria-hidden="true">
                  {wishlistCount > 99 ? "99+" : wishlistCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* ── Mobile full-screen search overlay ── */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-[200] flex flex-col bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSearchOpen(false)}
        >
          <form
            onSubmit={handleSearchSubmit}
            className="m-3 mt-[calc(var(--tm-navbar-sticky-offset,3.875rem)+0.75rem)]"
            onClick={(e) => e.stopPropagation()}
            role="search"
          >
            <label className="relative flex items-center">
              <span className="pointer-events-none absolute left-4 text-zinc-400">
                <SearchNavIcon />
              </span>
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search shops, products…"
                aria-label="Search shops and products"
                className="w-full rounded-2xl border border-zinc-200 bg-white py-3.5 pl-11 pr-16 text-base text-zinc-900 shadow-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <button
                type="submit"
                className="absolute right-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
              >
                Search
              </button>
            </label>
            {suggestItems.length > 0 ? (
              <ul className="mt-2 max-h-64 overflow-auto rounded-2xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                {suggestItems.map((item) => (
                  <li key={`m-${item.type}-${item.id}`}>
                    <Link
                      href={item.href}
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchQuery("");
                        setSuggestItems([]);
                      }}
                      className="flex items-center gap-2 px-3.5 py-2.5 text-sm text-zinc-800 hover:bg-emerald-50 dark:text-zinc-100 dark:hover:bg-emerald-950/40"
                    >
                      <span className="text-[10px] font-bold uppercase text-zinc-400">
                        {item.type}
                      </span>
                      <span className="truncate font-medium">{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </form>
        </div>
      )}

      {portalReady
        ? createPortal(
            <>
              <SidebarDrawer
                variant="drawer"
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
              />
              <SidebarDrawer
                variant="persistent"
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
              />
            </>,
            document.body,
          )
        : null}
    </header>
  );
}
