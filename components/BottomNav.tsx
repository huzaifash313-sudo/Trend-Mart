"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getUnseenFavoriteCount,
  markWishlistSeen,
} from "@/services/wishlistService";

/* -------------------------------------------------------------------------- */
/*  Inline SVG Icons (compact)                                                */
/* -------------------------------------------------------------------------- */

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.75 12 3l9 6.75V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      {active && <path d="M9 21V12h6v9" fill="none" stroke="currentColor" strokeWidth="1.8" />}
    </svg>
  );
}

function SearchTabIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function HeartIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Badge                                                                      */
/* -------------------------------------------------------------------------- */

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[0.55rem] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  BottomNav — 4 Essential Tabs Only                                          */
/* -------------------------------------------------------------------------- */

interface Tab {
  key: string;
  label: string;
  icon: (props: { active: boolean }) => React.ReactNode;
  href?: string;
  onClick?: () => void;
  badgeCount?: number;
}

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  const [session, setSession] = useState(false);
  const [wishlistCount, setWishlistCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setSession(!!data.session);
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { if (!cancelled) setSession(!!s); });
        if (cancelled) subscription.unsubscribe();
      } catch { if (!cancelled) setSession(false); }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const isWishlistActive = pathname === "/wishlist";

  // On wishlist page: clear badge and keep it cleared while viewing
  useEffect(() => {
    if (isWishlistActive) markWishlistSeen();
  }, [isWishlistActive]);

  useEffect(() => {
    let cancelled = false;
    const updateCount = async () => {
      // Red badge = new adds since last wishlist visit (not total wishlist size)
      if (pathname === "/wishlist") {
        if (!cancelled) setWishlistCount(0);
        return;
      }
      const count = await getUnseenFavoriteCount();
      if (!cancelled) setWishlistCount(count);
    };
    updateCount();
    window.addEventListener("storage", updateCount);
    window.addEventListener("favoritesUpdated", updateCount);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", updateCount);
      window.removeEventListener("favoritesUpdated", updateCount);
    };
  }, [pathname]);

  const handleSearch = useCallback(() => router.push("/search"), [router]);

  // Merchants land on /dashboard; customers are redirected to /account by middleware
  const accountHref = session ? "/dashboard" : "/login";
  const isHomeActive = pathname === "/";
  const isSearchActive = pathname === "/search";
  const isAccountActive =
    pathname === "/dashboard" ||
    pathname.startsWith("/account") ||
    pathname === "/login" ||
    pathname === "/signup";

  const tabs: Tab[] = [
    { key: "home", label: "Home", icon: HomeIcon, href: "/" },
    { key: "search", label: "Search", icon: SearchTabIcon, onClick: handleSearch },
    { key: "wishlist", label: "Wishlist", icon: HeartIcon, href: "/wishlist", badgeCount: wishlistCount },
    { key: "account", label: session ? "Dashboard" : "Sign In", icon: UserIcon, href: accountHref },
  ];

  return (
    <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/80 bg-white/90 backdrop-blur-xl dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/92 md:hidden" aria-label="Main navigation">
      <div className="mx-auto flex h-full max-w-lg items-center justify-around px-1">
        {tabs.map((tab) => {
          const active =
            tab.key === "home" ? isHomeActive
            : tab.key === "search" ? isSearchActive
            : tab.key === "wishlist" ? isWishlistActive
            : tab.key === "account" ? isAccountActive
            : false;

          const className = `flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[0.62rem] font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 active:scale-95 ${active ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 hover:text-zinc-700 dark:text-[color:var(--tm-muted)] dark:hover:text-[color:var(--tm-text)]"}`;

          const content = (
            <>
              <div className="relative"><tab.icon active={active} />{tab.badgeCount !== undefined && <Badge count={tab.badgeCount} />}</div>
              <span>{tab.label}</span>
            </>
          );

          if (tab.href) return (<Link key={tab.key} href={tab.href} className={className} aria-label={tab.label} aria-current={active ? "page" : undefined}>{content}</Link>);
          return (<button key={tab.key} type="button" onClick={tab.onClick} className={className} aria-label={tab.label}>{content}</button>);
        })}
      </div>
    </nav>
  );
}