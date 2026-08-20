"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SidebarDrawer from "@/components/SidebarDrawer";
import NavbarNotificationButton from "@/components/NavbarNotificationButton";

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

function SearchIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
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
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="45%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#5eead4" />
          </linearGradient>
          <linearGradient id="tmTrendUnder" x1="0" y1="0" x2="0" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
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
          fill="#a7f3d0"
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
        src="/trendmart-mark.png?v=8"
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
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setPortalReady(true);
  }, []);

  const navigateToSearch = useCallback(() => router.push("/products"), [router]);

  // The admin console has its own layout — never render storefront chrome there.
  if (pathname === "/offline" || pathname.startsWith("/admin")) return null;

  return (
    <header className="tm-navbar-wrap">
      <div className="tm-navbar">
        <div className="tm-navbar-border" aria-hidden="true" />
        <TrendBackdrop />

        <div className="tm-navbar-inner">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="tm-navbar-icon-btn"
            aria-label="Open menu"
          >
            <HamburgerIcon />
          </button>

          <Link href="/" className="tm-navbar-brand" aria-label="TrendMart home">
            <BrandMark />
            <span className="tm-navbar-wordmark">TrendMart</span>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <NavbarNotificationButton />
            <button
              type="button"
              onClick={navigateToSearch}
              className="tm-navbar-search-btn w-10 sm:w-auto"
              aria-label="Search products and shops"
            >
              <SearchIcon />
              <span className="hidden text-sm font-medium text-white sm:inline">Search</span>
            </button>
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
