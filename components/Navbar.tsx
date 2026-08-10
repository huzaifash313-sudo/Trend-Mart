"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SidebarDrawer from "@/components/SidebarDrawer";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function HamburgerIcon() {
  return (
    <svg className="h-6 w-6 sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/**
 * Full-width trend: line draws start → end.
 * Arrow stays softly visible the whole time (no late pop-in).
 */
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
            <stop className="tm-trend-stop-a" offset="0%" stopColor="#6ee7b7" />
            <stop className="tm-trend-stop-b" offset="45%" stopColor="#ffffff" />
            <stop className="tm-trend-stop-c" offset="100%" stopColor="#5eead4" />
          </linearGradient>
          <linearGradient id="tmTrendUnder" x1="0" y1="0" x2="0" y2="90" gradientUnits="userSpaceOnUse">
            <stop className="tm-trend-fill-top" offset="0%" stopColor="#34d399" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="tmTrendArrow" x1="352" y1="6" x2="392" y2="34" gradientUnits="userSpaceOnUse">
            <stop className="tm-trend-arrow-a" offset="0%" stopColor="#a7f3d0" />
            <stop className="tm-trend-arrow-b" offset="100%" stopColor="#5eead4" />
          </linearGradient>
          <filter id="tmTrendGlow" x="-5%" y="-40%" width="110%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.15" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Soft area under trend */}
        <path
          className="tm-navbar-trend-area"
          d={`${line} L400 90 L0 90 Z`}
          fill="url(#tmTrendUnder)"
        />

        {/* Guide track */}
        <path
          d={line}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Drawing line — start to finish + color cycle */}
        <path
          className="tm-navbar-trend-line"
          d={line}
          pathLength={100}
          stroke="url(#tmTrendStroke)"
          strokeWidth="3.35"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter="url(#tmTrendGlow)"
        />

        {/* Arrow: soft always + green ↔ sea-green shimmer */}
        <path
          className="tm-navbar-trend-arrow"
          d="M352 6 L392 6 L392 34 Z"
          fill="url(#tmTrendArrow)"
        />
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Navbar                                                                     */
/* -------------------------------------------------------------------------- */

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const onProductsPage = pathname === "/products" || pathname.startsWith("/products/");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setPortalReady(true);
  }, []);

  const navigateToProducts = useCallback(() => router.push("/products"), [router]);

  return (
    <header className="tm-navbar-wrap sticky top-0 z-40">
      <div className="tm-navbar">
        <div className="tm-navbar-border" aria-hidden="true" />
        <TrendBackdrop />

        <div className="relative z-[1] mx-auto flex max-w-6xl items-center gap-3 px-3 py-3.5 sm:gap-3.5 sm:px-4 sm:py-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/20 active:scale-95 sm:h-12 sm:w-12"
            aria-label="Open menu"
          >
            <HamburgerIcon />
          </button>

          <Link
            href="/"
            className="inline-flex shrink-0 items-center text-[1.35rem] font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl"
          >
            TrendMart
          </Link>

          <div className="ml-auto flex shrink-0 items-center">
            {!onProductsPage ? (
              <button
                type="button"
                onClick={navigateToProducts}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/40 bg-white/20 text-white shadow-sm backdrop-blur-sm transition-all hover:bg-white/30 active:scale-95 sm:h-12 sm:w-auto sm:gap-2.5 sm:px-4"
                aria-label="Browse products"
              >
                <SearchIcon />
                <span className="hidden text-[0.95rem] font-medium text-white sm:inline">Products</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {portalReady
        ? createPortal(
            <SidebarDrawer
              isOpen={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            />,
            document.body,
          )
        : null}
    </header>
  );
}
