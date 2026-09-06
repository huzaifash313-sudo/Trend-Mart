"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/services/authService";
import { SHOP_CATEGORIES, CATEGORY_ICONS, isDineInCategory } from "@/types";
import PwaInstallTip from "@/components/PwaInstallTip";

/* -------------------------------------------------------------------------- */
/*  Inline SVG Icons                                                          */
/* -------------------------------------------------------------------------- */

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function HomeSidebarIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.75 12 3l9 6.75V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function TagDealIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function CategoryIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
      <line x1="12" y1="22" x2="12" y2="15.5" />
      <polyline points="22 8.5 12 15.5 2 8.5" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ChevronDownIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SearchIconMenu() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function StoreIconMenu() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.12-5.6A1 1 0 0 1 5.1 3h13.8a1 1 0 0 1 .98.8L21 9" />
      <path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" />
      <path d="M9 21V9h6v12" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Enterprise-grade mobile slide-out sidebar drawer with:
 *   - Focus trapping (TAB cycles within the drawer when open)
 *   - Escape key to dismiss
 *   - Glassmorphic backdrop with safe click-to-close (prevents event bubbling)
 *   - Body scroll lock (prevents background scrolling bugs)
 *   - Touch-event safe backdrop (stopPropagation on drawer tap)
 *   - CSS transition states (transform + opacity) for smooth open/close
 *   - Collapsible "Shop Categories" accordion
 *   - Auth-aware rendering (Sign In vs Dashboard + Sign Out)
 *
 * Critical accessibility & mobile safety features:
 *   - `aria-modal="true"` and `role="dialog"` for screen readers
 *   - Focus is moved into and restored out of the drawer
 *   - Backdrop `onClick` uses `stopPropagation` to prevent double-fires
 *   - `overscroll-contain` prevents iOS rubber-band scroll-leaking
 *   - `touch-action: pan-y` on scrollable content for touch-event stability
 *   - `transform: translateZ(0)` to force GPU compositing on mobile
 */
export default function SidebarDrawer({ isOpen, onClose }: SidebarDrawerProps) {
  const [session, setSession] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState<"customer" | "merchant" | "admin" | null>(null);
  const [merchantShopId, setMerchantShopId] = useState<string | null>(null);
  const [merchantShopCategory, setMerchantShopCategory] = useState<string | null>(null);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [merchantExpanded, setMerchantExpanded] = useState(false);

  // Refs for focus trapping
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  /* ── Auth session — always mounted so sidebar never shows stale guest UI ─ */
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    function roleHint(user: User | null | undefined): "customer" | "merchant" | "admin" | null {
      const appMeta = user?.app_metadata?.role as string | undefined;
      if (appMeta === "admin" || appMeta === "merchant" || appMeta === "customer") {
        return appMeta;
      }
      const userMeta = user?.user_metadata?.role as string | undefined;
      if (userMeta === "merchant" || userMeta === "customer") return userMeta;
      return null;
    }

    async function syncMerchantShop(userId: string) {
      const supabase = createClient();
      const { data: shop } = await supabase
        .from("shops")
        .select("id, category")
        .eq("owner_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setMerchantShopId(shop?.id ?? null);
      setMerchantShopCategory(typeof shop?.category === "string" ? shop.category : null);
    }

    async function syncAuth(signedIn: boolean, user?: User | null) {
      if (!signedIn || !user?.id) {
        if (!cancelled) {
          setSession(false);
          setUserRole(null);
          setMerchantShopId(null);
          setMerchantShopCategory(null);
        }
        return;
      }

      if (!cancelled) {
        setSession(true);
        const hint = roleHint(user);
        if (hint) setUserRole(hint);
      }

      const { detectUserRole } = await import("@/services/authService");
      const role = await detectUserRole(user);
      if (cancelled) return;

      setUserRole(role);
      if (role === "merchant" || role === "admin") {
        await syncMerchantShop(user.id);
      } else if (!cancelled) {
        setMerchantShopId(null);
        setMerchantShopCategory(null);
      }
    }

    async function init() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        await syncAuth(!!data.session, data.session?.user ?? null);

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
          if (cancelled) return;
          await syncAuth(!!currentSession, currentSession?.user ?? null);
        });
        unsubscribe = () => subscription.unsubscribe();
      } catch {
        if (!cancelled) {
          setSession(false);
          setUserRole(null);
          setMerchantShopId(null);
          setMerchantShopCategory(null);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  /* ── Body Scroll Lock with iOS Safe Handling ─────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;

    // Save current scroll position and active element
    const scrollY = window.scrollY;
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Lock body scroll without losing scroll position
    const body = document.body;
    const originalOverflow = body.style.overflow;
    const originalPosition = body.style.position;
    const originalTop = body.style.top;
    const originalWidth = body.style.width;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    // Move focus into the drawer for accessibility
    // Small delay to allow DOM to paint the open state
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 100);

    return () => {
      clearTimeout(timer);

      // Restore body styles
      body.style.overflow = originalOverflow;
      body.style.position = originalPosition;
      body.style.top = originalTop;
      body.style.width = originalWidth;

      // Restore scroll position — instant (avoid the global smooth-scroll
      // animating it from the top when the drawer closes).
      window.scrollTo({ top: scrollY, behavior: "instant" });

      // Restore focus to the previously active element
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === "function") {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  /* ── Keyboard: Escape to close + Focus Trap ──────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trapping: keep TAB within the drawer
      if (e.key === "Tab" && drawerRef.current) {
        const focusableSelectors = [
          'a[href]',
          'button:not([disabled])',
          'textarea',
          'input',
          'select',
          '[tabindex]:not([tabindex="-1"])',
        ];
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
          focusableSelectors.join(", "),
        );

        if (focusableElements.length === 0) return;

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift+TAB: if focus is on first element, wrap to last
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
          }
        } else {
          // TAB: if focus is on last element, wrap to first
          if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKey, { capture: true });
    return () => document.removeEventListener("keydown", handleKey, { capture: true });
  }, [isOpen, onClose]);

  /* ── Sign Out handler (clear cache + hard redirect — no soft-nav glitch) ── */
  const handleSignOut = useCallback(async () => {
    onClose();
    await signOut({ redirectTo: "/" });
  }, [onClose]);

  /* ── Safe backdrop click — stopPropagation on drawer prevents double fire ── */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      // Only close if the backdrop itself was clicked (not the drawer panel)
      if (e.target === e.currentTarget) {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  // Prevent touch events on the drawer from propagating to the backdrop
  const handleDrawerTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

  const displayCategories = SHOP_CATEGORIES.filter((c) => c !== "All");

  /* ──────────────────────────────────────────────────────────────────────── */
  /*  Render                                                                  */
  /* ──────────────────────────────────────────────────────────────────────── */
  return (
    <>
      {/* Backdrop — highest z-index with glassmorphic blur */}
      <div
        className={`fixed inset-0 z-[9999] bg-black/50 backdrop-blur-md transition-all duration-400 ${
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "pointer-events-none opacity-0"
        }`}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Drawer panel — sits above backdrop on the left */}
      <aside
        ref={drawerRef}
        className={`fixed left-0 top-0 z-[10000] flex h-dvh w-80 max-w-[88vw] flex-col bg-white/95 shadow-2xl backdrop-blur-xl transition-transform duration-350 ease-[cubic-bezier(0.4,0,0.2,1)] dark:bg-[color:var(--tm-surface)]/95 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        onTouchStart={handleDrawerTouchStart}
        style={{ willChange: "transform" }}
      >
        {/* Header — brand + close button */}
        <div className="flex items-center justify-between border-b border-zinc-200/60 px-5 py-4 dark:border-zinc-800/60">
          <Link
            href="/"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xl font-extrabold tracking-tight"
            aria-label="TrendsMart — Go to homepage"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/trendsmart-mark.png?v=13"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 object-contain"
            />
            <span className="bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent">
              TrendsMart
            </span>
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Navigation Links — Full rich navigation */}
        <nav
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-4"
          style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
          aria-label="Sidebar navigation"
        >
          <ul className="space-y-1">
            {/* Home */}
            <li>
              <Link
                href="/"
                onClick={onClose}
                className="flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-700 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-300 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
              >
                <HomeSidebarIcon /> Home
              </Link>
            </li>

            {/* Products marketplace */}
            <li>
              <Link
                href="/products"
                onClick={onClose}
                className="flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-700 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-300 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
              >
                <SearchIconMenu /> Products
              </Link>
            </li>

            {/* Deals hub */}
            <li>
              <Link
                href="/deals"
                onClick={onClose}
                className="flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-700 transition-all hover:bg-amber-50 hover:text-amber-700 dark:text-zinc-300 dark:hover:bg-amber-900/20 dark:hover:text-amber-400"
              >
                <TagDealIcon /> Deals
              </Link>
            </li>

            {/* Wishlist */}
            <li>
              <Link
                href="/wishlist"
                onClick={onClose}
                className="flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-700 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-300 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
              >
                <HeartIcon /> Wishlist
              </Link>
            </li>

            <li className="px-1 py-2">
              <PwaInstallTip />
            </li>

            {/* Divider */}
            <li className="my-2 border-t border-zinc-100 dark:border-zinc-800" role="separator" />

            {/* Orders */}
            <li>
              <Link
                href="/orders"
                onClick={onClose}
                className="flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-700 transition-all hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <OrdersIcon /> My Orders
              </Link>
            </li>

            {/* Divider */}
            <li className="my-2 border-t border-zinc-100 dark:border-zinc-800" role="separator" />

            {/* Shop Categories — Collapsible Accordion */}
            <li>
              <button
                type="button"
                onClick={() => setCategoriesExpanded(!categoriesExpanded)}
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-zinc-700 transition-all hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-expanded={categoriesExpanded}
                aria-controls="sidebar-categories-list"
              >
                <span className="flex items-center gap-3.5">
                  <CategoryIcon /> Categories
                </span>
                <ChevronDownIcon expanded={categoriesExpanded} />
              </button>
              {categoriesExpanded && (
                <ul
                  id="sidebar-categories-list"
                  className="ml-9 mt-1 space-y-0.5 border-l-2 border-zinc-100 pl-4 dark:border-zinc-800"
                >
                  {displayCategories.map((cat) => (
                    <li key={cat}>
                      <Link
                        href={`/search?category=${encodeURIComponent(cat)}`}
                        onClick={onClose}
                        className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                      >
                        <span aria-hidden="true" className="text-lg">
                          {CATEGORY_ICONS?.[cat] ?? "📦"}
                        </span>
                        {cat}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>

            {/* Divider */}
            <li className="my-2 border-t border-zinc-100 dark:border-zinc-800" role="separator" />

            {/* Settings — single link; all preferences live on the Settings page */}
            <li>
              <Link
                href="/settings"
                onClick={onClose}
                className="flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-700 transition-all hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <CogIcon /> Settings
              </Link>
            </li>

            {/* Divider */}
            <li className="my-2 border-t border-zinc-100 dark:border-zinc-800" role="separator" />

            {/* Dashboard / Sign In */}
            <li>
            {session === true ? (
                <>
                  {userRole === "merchant" || userRole === "admin" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setMerchantExpanded((v) => !v)}
                        className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-emerald-600 transition-all hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                        aria-expanded={merchantExpanded}
                        aria-controls="sidebar-merchant-list"
                      >
                        <span className="flex items-center gap-3.5">
                          <DashboardIcon /> Merchant
                        </span>
                        <ChevronDownIcon expanded={merchantExpanded} />
                      </button>
                      {merchantExpanded && (
                        <ul
                          id="sidebar-merchant-list"
                          className="ml-9 mt-1 space-y-0.5 border-l-2 border-emerald-100 pl-4 dark:border-emerald-900/50"
                        >
                          <li>
                            <Link
                              href="/dashboard"
                              onClick={onClose}
                              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                            >
                              <DashboardIcon /> Dashboard
                            </Link>
                          </li>
                          <li>
                            <Link
                              href="/dashboard/assistant"
                              onClick={onClose}
                              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                            >
                              <span aria-hidden="true">🤖</span> AI Business Coach
                            </Link>
                          </li>
                          <li>
                            <Link
                              href="/dashboard/orders"
                              onClick={onClose}
                              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                            >
                              <OrdersIcon /> Orders
                            </Link>
                          </li>
                          <li>
                            <Link
                              href="/dashboard/products"
                              onClick={onClose}
                              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                            >
                              <span aria-hidden="true">📦</span> Products
                            </Link>
                          </li>
                          {isDineInCategory(merchantShopCategory) && (
                            <>
                              <li>
                                <Link
                                  href="/dashboard/kitchen"
                                  onClick={onClose}
                                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                                >
                                  <span aria-hidden="true">🍳</span> Kitchen Board
                                </Link>
                              </li>
                              <li>
                                <Link
                                  href="/dashboard/tables"
                                  onClick={onClose}
                                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                                >
                                  <span aria-hidden="true">🪑</span> QR Tables
                                </Link>
                              </li>
                            </>
                          )}
                          {merchantShopId ? (
                            <li>
                              <Link
                                href={`/shop/${merchantShopId}`}
                                onClick={onClose}
                                className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                              >
                                <StoreIconMenu /> View My Store
                              </Link>
                            </li>
                          ) : null}
                          <li>
                            <Link
                              href="/dashboard/settings"
                              onClick={onClose}
                              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                            >
                              <StoreIconMenu /> Store Settings
                            </Link>
                          </li>
                          <li>
                            <Link
                              href="/dashboard/analytics"
                              onClick={onClose}
                              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                            >
                              <span aria-hidden="true">📊</span> Analytics
                            </Link>
                          </li>
                          <li>
                            <Link
                              href="/dashboard/inquiries"
                              onClick={onClose}
                              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                            >
                              <span aria-hidden="true">💬</span> Messages
                            </Link>
                          </li>
                          <li>
                            <Link
                              href="/dashboard/finances"
                              onClick={onClose}
                              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                            >
                              <span aria-hidden="true">💰</span> Finances
                            </Link>
                          </li>
                          <li>
                            <Link
                              href="/dashboard/leads"
                              onClick={onClose}
                              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                            >
                              <span aria-hidden="true">🎯</span> Leads
                            </Link>
                          </li>
                          <li>
                            <Link
                              href="/dashboard/ads"
                              onClick={onClose}
                              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                            >
                              <span aria-hidden="true">📣</span> Ads
                            </Link>
                          </li>
                        </ul>
                      )}
                    </>
                  ) : (
                    <>
                      <Link
                        href="/account"
                        onClick={onClose}
                        className="flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
                      >
                        <DashboardIcon /> My Account
                      </Link>
                      <Link
                        href="/account/assistant"
                        onClick={onClose}
                        className="mt-1 flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
                      >
                        <span aria-hidden="true" className="text-base">🤖</span> TrendBot
                      </Link>
                    </>
                  )}

                  {/* Sign Out */}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-1 flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium text-red-500 transition-all hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <SignOutIcon /> Sign Out
                  </button>
                </>
              ) : session === false ? (
                <>
                  <Link
                    href="/assistant"
                    onClick={onClose}
                    className="mb-2 flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
                  >
                    <span aria-hidden="true" className="text-base">🤖</span> AI Shopping Assistant
                  </Link>
                  <a
                    href="/login"
                    onClick={(e) => {
                      e.preventDefault();
                      onClose();
                      window.location.assign("/login");
                    }}
                    className="flex items-center gap-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl hover:shadow-emerald-500/40"
                  >
                    <UserIcon /> Sign In / Register
                  </a>
                </>
              ) : (
                <div className="flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium text-zinc-400 dark:text-zinc-500">
                  <UserIcon /> Loading…
                </div>
              )}
            </li>

            {/* Footer branding */}
            <li className="pt-6">
              <p className="text-center text-[0.65rem] font-medium text-zinc-400 dark:text-zinc-500">
                TrendsMart — Local Shopping Platform
              </p>
              <p className="mt-0.5 text-center text-[0.6rem] text-zinc-300 dark:text-zinc-600">
                © {new Date().getFullYear()} All rights reserved
              </p>
            </li>
          </ul>
        </nav>
      </aside>
    </>
  );
}
