"use client";

import { useState, useEffect, useLayoutEffect, useCallback, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SidebarDrawer from "@/components/SidebarDrawer";
import NavbarNotificationButton from "@/components/NavbarNotificationButton";
import { useMediaQuery } from "@/hooks/useMediaQuery";

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
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [portalReady, setPortalReady] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Standalone flows — admin console and QR dine-in scan pages bring their own chrome.
  const isStandalone =
    pathname === "/offline" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/t/");

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Restore the user's last desktop sidebar preference (auto-open by default).
  useLayoutEffect(() => {
    try {
      if (localStorage.getItem("trendsmart_sidebar_open_v1") === "0") {
        setSidebarOpen(false);
      }
    } catch { /* ignore */ }
  }, []);

  // Drive the page offset so the whole storefront shifts for the pinned sidebar.
  useLayoutEffect(() => {
    if (isStandalone) return;
    const root = document.documentElement;
    root.classList.toggle("tm-sidebar-open", sidebarOpen);
    root.classList.toggle("tm-sidebar-collapsed", !sidebarOpen);
    return () => {
      root.classList.remove("tm-sidebar-open");
      root.classList.remove("tm-sidebar-collapsed");
    };
  }, [isStandalone, sidebarOpen]);

  const navigateToSearch = useCallback(() => router.push("/products"), [router]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("trendsmart_sidebar_open_v1", next ? "1" : "0");
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleHamburger = useCallback(() => {
    if (isDesktop) {
      toggleSidebar();
    } else {
      setDrawerOpen(true);
    }
  }, [isDesktop, toggleSidebar]);

  if (isStandalone) {
    return null;
  }

  return (
    <header className="tm-navbar-wrap">
      <div className="tm-navbar">
        <div className="tm-navbar-border" aria-hidden="true" />
        <TrendBackdrop />

        <div className="tm-navbar-inner">
          <button
            type="button"
            onClick={handleHamburger}
            className="tm-navbar-icon-btn"
            aria-label="Toggle navigation menu"
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
            <>
              <SidebarDrawer
                variant="drawer"
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
              />
              <SidebarDrawer
                variant="persistent"
                isOpen={sidebarOpen}
                onClose={toggleSidebar}
              />
            </>,
            document.body,
          )
        : null}
    </header>
  );
}
