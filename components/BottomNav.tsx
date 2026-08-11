"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getUnseenFavoriteCount,
  markWishlistSeen,
} from "@/services/wishlistService";
import { fetchMyShop } from "@/services/shopService";
import { useMerchantQuickAdd } from "@/context/MerchantQuickAddContext";

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

function ProductsTabIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      {!active && (
        <>
          <polyline points="3.29 7 12 12 20.71 7" />
          <line x1="12" y1="22" x2="12" y2="12" />
        </>
      )}
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

function PlusIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[0.55rem] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  BottomNav — 4 tabs + center merchant Add (TikTok-style)                     */
/* -------------------------------------------------------------------------- */

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { openQuickAdd } = useMerchantQuickAdd();

  const [session, setSession] = useState(false);
  const [merchantShop, setMerchantShop] = useState<{ id: string; category: string } | null>(null);
  const [wishlistCount, setWishlistCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const signedIn = !!data.session;
        if (!cancelled) setSession(signedIn);
        if (signedIn) {
          const shopResult = await fetchMyShop();
          if (!cancelled && shopResult.success && shopResult.data) {
            setMerchantShop({ id: shopResult.data.id, category: shopResult.data.category });
          } else if (!cancelled) {
            setMerchantShop(null);
          }
        } else if (!cancelled) {
          setMerchantShop(null);
        }
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, s) => {
          if (cancelled) return;
          setSession(!!s);
          if (s) {
            const shopResult = await fetchMyShop();
            if (!cancelled && shopResult.success && shopResult.data) {
              setMerchantShop({ id: shopResult.data.id, category: shopResult.data.category });
            } else if (!cancelled) setMerchantShop(null);
          } else {
            setMerchantShop(null);
          }
        });
        if (cancelled) subscription.unsubscribe();
      } catch {
        if (!cancelled) {
          setSession(false);
          setMerchantShop(null);
        }
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const isWishlistActive = pathname === "/wishlist";

  useEffect(() => {
    if (isWishlistActive) markWishlistSeen();
  }, [isWishlistActive]);

  useEffect(() => {
    let cancelled = false;
    const updateCount = async () => {
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

  const accountHref = session ? "/dashboard" : "/login";
  const isHomeActive = pathname === "/";
  const isProductsActive = pathname === "/products" || pathname.startsWith("/products/");
  const isAccountActive =
    pathname === "/dashboard" ||
    pathname.startsWith("/account") ||
    pathname === "/login" ||
    pathname === "/signup";

  const handleCenterAdd = () => {
    if (merchantShop) {
      openQuickAdd({ shopId: merchantShop.id, shopCategory: merchantShop.category, tab: "product" });
      return;
    }
    if (session) {
      router.push("/dashboard");
      return;
    }
    router.push("/login?next=/dashboard");
  };

  const sideTabClass = (active: boolean) =>
    `flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[0.62rem] font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 active:scale-95 ${
      active
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-zinc-500 hover:text-zinc-700 dark:text-[color:var(--tm-muted)] dark:hover:text-[color:var(--tm-text)]"
    }`;

  return (
    <nav
      className="bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/80 bg-white/90 backdrop-blur-xl dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/92 md:hidden"
      aria-label="Main navigation"
    >
      <div className="mx-auto grid h-full max-w-lg grid-cols-5 items-end px-1 pb-1">
        <Link href="/" className={sideTabClass(isHomeActive)} aria-label="Home" aria-current={isHomeActive ? "page" : undefined}>
          <HomeIcon active={isHomeActive} />
          <span>Home</span>
        </Link>

        <Link
          href="/products"
          className={sideTabClass(isProductsActive)}
          aria-label="Products"
          aria-current={isProductsActive ? "page" : undefined}
        >
          <ProductsTabIcon active={isProductsActive} />
          <span>Products</span>
        </Link>

        <div className="flex flex-col items-center justify-end">
          <button
            type="button"
            onClick={handleCenterAdd}
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/35 ring-4 ring-white transition hover:bg-emerald-700 active:scale-95 dark:ring-[color:var(--tm-surface)]"
            aria-label={merchantShop ? "Add product" : session ? "Open dashboard" : "Sign in to add products"}
          >
            <PlusIcon />
          </button>
          <span className="mt-0.5 text-[0.58rem] font-semibold text-emerald-700 dark:text-emerald-400">
            {merchantShop ? "Add" : "Post"}
          </span>
        </div>

        <Link
          href="/wishlist"
          className={sideTabClass(isWishlistActive)}
          aria-label="Wishlist"
          aria-current={isWishlistActive ? "page" : undefined}
        >
          <div className="relative">
            <HeartIcon active={isWishlistActive} />
            <Badge count={wishlistCount} />
          </div>
          <span>Wishlist</span>
        </Link>

        <Link
          href={accountHref}
          className={sideTabClass(isAccountActive)}
          aria-label={session ? "Dashboard" : "Sign In"}
          aria-current={isAccountActive ? "page" : undefined}
        >
          <UserIcon active={isAccountActive} />
          <span>{session ? "Dashboard" : "Sign In"}</span>
        </Link>
      </div>
    </nav>
  );
}
