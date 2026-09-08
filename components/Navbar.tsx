"use client";

import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SidebarDrawer from "@/components/SidebarDrawer";
import NavbarNotificationButton from "@/components/NavbarNotificationButton";
import { useCart } from "@/context/CartContext";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function HamburgerIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    setSearchOpen(false);
    setSearchQuery("");
    if (q) {
      router.push(`/?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/");
    }
  };

  // Auto-focus when mobile search opens
  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  // Standalone flows — admin console and QR dine-in scan pages bring their own chrome.
  const isStandalone =
    pathname === "/offline" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/t/");

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Drive the page offset so the whole storefront shifts for the pinned sidebar.
  // The desktop sidebar is intentionally ALWAYS open — there is no collapse
  // control, so we never restore a "closed" preference.
  useLayoutEffect(() => {
    if (isStandalone) return;
    const root = document.documentElement;
    root.classList.add("tm-sidebar-open");
    root.classList.remove("tm-sidebar-collapsed");
    return () => {
      root.classList.remove("tm-sidebar-open");
      root.classList.remove("tm-sidebar-collapsed");
    };
  }, [isStandalone]);

  if (isStandalone) {
    return null;
  }

  return (
    <header className="tm-navbar-wrap">
      <div className="tm-navbar">
        <div className="tm-navbar-border" aria-hidden="true" />
        <TrendBackdrop />

        <div className="tm-navbar-inner">
          {/* Hamburger — mobile only (<1024px) */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="tm-navbar-icon-btn tm-navbar-menu-btn"
            aria-label="Open navigation menu"
          >
            <HamburgerIcon />
          </button>

          <Link href="/" className="tm-navbar-brand" aria-label="TrendsMart home">
            <BrandMark />
            <span className="tm-navbar-wordmark">
              {"TrendsMart".split("").map((ch, i) => (
                <span
                  key={i}
                  className="tm-navbar-wordmark-letter"
                  style={{ "--letter-i": i } as CSSProperties}
                >
                  {ch}
                </span>
              ))}
            </span>
          </Link>

          {/* ── Desktop search bar (lg+) — sits center of navbar ── */}
          <form
            onSubmit={handleSearchSubmit}
            className="mx-4 hidden flex-1 lg:flex"
            role="search"
          >
            <label className="relative flex w-full max-w-md items-center">
              <span className="pointer-events-none absolute left-3 text-white/60">
                <SearchNavIcon />
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search shops, products…"
                aria-label="Search shops and products"
                className="w-full rounded-full border border-white/20 bg-white/10 py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/55 backdrop-blur-sm transition focus:border-white/40 focus:bg-white/18 focus:outline-none focus:ring-2 focus:ring-white/25"
              />
            </label>
          </form>

          {/* ── Right-side action icons ── */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 lg:ml-0">
            {/* Mobile search icon — opens overlay (hidden at lg+ via CSS, not Tailwind
                utility, because tm-navbar-icon-btn is unlayered CSS that beats lg:hidden) */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="tm-navbar-icon-btn tm-navbar-search-mobile-btn"
              aria-label="Search"
            >
              <SearchNavIcon />
            </button>

            {/* Cart icon with item-count badge */}
            <Link
              href="/cart"
              className="tm-navbar-icon-btn relative"
              aria-label={`Cart${totalItems > 0 ? `, ${totalItems} items` : ""}`}
            >
              <CartNavIcon />
              {totalItems > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-[color:var(--tm-surface)]"
                  aria-hidden="true"
                >
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </Link>

            <NavbarNotificationButton />
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
                onClose={() => setSidebarOpen(true)}
              />
            </>,
            document.body,
          )
        : null}
    </header>
  );
}
