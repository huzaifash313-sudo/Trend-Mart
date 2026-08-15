"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchMyShop } from "@/services/shopService";
import { detectUserRole, type AuthRole } from "@/services/authService";
import { useMerchantQuickAdd } from "@/context/MerchantQuickAddContext";
import type { User } from "@supabase/supabase-js";

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

function DealsTabIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function ProductsTabIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
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

function PlusIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  BottomNav — Home | Deals | Add/Store | Products | Account                 */
/* -------------------------------------------------------------------------- */

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { openQuickAdd } = useMerchantQuickAdd();

  // `null` = auth still resolving. Don't flash "Sign In" to a signed-in user.
  const [session, setSession] = useState<boolean | null>(null);
  const [role, setRole] = useState<AuthRole | "admin" | null>(null);
  const [merchantShop, setMerchantShop] = useState<{ id: string; category: string } | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Hide the fixed bottom nav while the on-screen keyboard is open, so it never
  // floats over the keyboard or covers the filter/sort row while typing.
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const check = () => {
      setKeyboardOpen(window.innerHeight - vv.height > 150);
    };
    check();
    vv.addEventListener("resize", check);
    window.addEventListener("resize", check);
    return () => {
      vv.removeEventListener("resize", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    type SessionUser = User;

    function roleHint(user: SessionUser | null | undefined): AuthRole | "admin" | null {
      // app_metadata is service-role-only — full trust (including admin).
      const appMeta = user?.app_metadata?.role as string | undefined;
      if (appMeta === "admin" || appMeta === "merchant" || appMeta === "customer") {
        return appMeta;
      }
      // user_metadata is user-editable — NEVER expose "admin" from it (a user
      // could self-set role=admin); only the harmless merchant/customer hint.
      const userMeta = user?.user_metadata?.role as string | undefined;
      if (userMeta === "merchant" || userMeta === "customer") return userMeta;
      return null;
    }

    /** Fast path: session + shop only — skip getUser + detectUserRole RPC chain. */
    async function syncAuth(signedIn: boolean, user?: SessionUser | null) {
      if (!signedIn || !user?.id) {
        if (!cancelled) {
          setSession(false);
          setRole(null);
          setMerchantShop(null);
        }
        return;
      }

      const hint = roleHint(user);
      if (!cancelled) {
        setSession(true);
        if (hint) setRole(hint);
      }

      const shopResult = await fetchMyShop();
      if (cancelled) return;

      if (shopResult.success && shopResult.data) {
        setMerchantShop({ id: shopResult.data.id, category: shopResult.data.category });
        if (hint !== "admin") setRole("merchant");
      } else {
        setMerchantShop(null);
        if (!hint) {
          void detectUserRole(user).then((detected) => {
            if (!cancelled) setRole(detected);
          });
        } else {
          setRole(hint);
        }
      }
    }

    async function init() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        await syncAuth(!!data.session, data.session?.user ?? null);

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_e, s) => {
          if (cancelled) return;
          await syncAuth(!!s, s?.user ?? null);
        });
        unsubscribe = () => subscription.unsubscribe();
      } catch {
        if (!cancelled) {
          setSession(false);
          setRole(null);
          setMerchantShop(null);
        }
      }
    }

    // Defer auth work so first paint isn't blocked by Supabase
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (typeof requestIdleCallback !== "undefined") {
      idleId = requestIdleCallback(() => void init(), { timeout: 1200 });
    } else {
      timeoutId = setTimeout(() => void init(), 0);
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (idleId != null && typeof cancelIdleCallback !== "undefined") {
        cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);

  const isMerchant = role === "merchant" || role === "admin" || !!merchantShop;
  if (pathname === "/offline") return null;
  const accountHref = session === false
    ? "/login"
    : role === "admin"
      ? "/admin/dashboard"
      : isMerchant
        ? "/dashboard"
        : "/account";
  const accountLabel = session === false
    ? "Sign In"
    : role === "admin"
      ? "Admin"
      : isMerchant
        ? "Dashboard"
        : "Account";

  const isHomeActive = pathname === "/";
  const isDealsActive = pathname === "/deals" || pathname.startsWith("/deals/");
  const isProductsActive =
    pathname === "/products" ||
    pathname.startsWith("/products/");
  const isAccountActive =
    pathname === accountHref ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/admin") ||
    pathname === "/login" ||
    pathname === "/signup";

  const handleCenterAdd = () => {
    if (merchantShop) {
      openQuickAdd({ shopId: merchantShop.id, shopCategory: merchantShop.category, tab: "product" });
      return;
    }
    if (session && isMerchant) {
      router.push("/dashboard/products/new");
      return;
    }
    if (session) {
      router.push("/account/become-merchant");
      return;
    }
    router.push("/login?redirect=/account/become-merchant");
  };

  // Merchants: Add / Post. Shoppers: clear “Store” (open a shop), not confusing “Sell”.
  // While auth resolves (session === null), default to the most common label so the
  // button never flips Store → Post → Add on every load/refresh.
  const centerLabel = merchantShop
    ? "Add"
    : session === null
      ? "Add"
      : session && isMerchant
        ? "Post"
        : "Store";
  const centerAria = merchantShop
    ? "Add product"
    : session === null
      ? "Add product"
      : session && isMerchant
        ? "Open product tools"
        : session
          ? "Open your store on TrendMart"
          : "Sign in to open a store";

  const sideTabClass = (active: boolean) =>
    `flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[0.62rem] font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 active:scale-95 ${
      active
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-zinc-500 hover:text-zinc-700 dark:text-[color:var(--tm-muted)] dark:hover:text-[color:var(--tm-text)]"
    }`;

  return (
    <nav
      className={`bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200/80 bg-white/90 backdrop-blur-xl dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/92 md:hidden${keyboardOpen ? " hidden" : ""}`}
      aria-label="Main navigation"
    >
      <div className="mx-auto grid h-full max-w-lg grid-cols-5 items-end px-1 pb-1">
        <Link href="/" className={sideTabClass(isHomeActive)} aria-label="Home" aria-current={isHomeActive ? "page" : undefined}>
          <HomeIcon active={isHomeActive} />
          <span>Home</span>
        </Link>

        <Link
          href="/deals"
          className={sideTabClass(isDealsActive)}
          aria-label="Deals"
          aria-current={isDealsActive ? "page" : undefined}
        >
          <DealsTabIcon active={isDealsActive} />
          <span>Deals</span>
        </Link>

        <div className="flex flex-col items-center justify-end">
          <button
            type="button"
            onClick={handleCenterAdd}
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/35 ring-4 ring-white transition hover:bg-emerald-700 active:scale-95 dark:ring-[color:var(--tm-surface)]"
            aria-label={centerAria}
          >
            <PlusIcon />
          </button>
          <span className="mt-0.5 text-[0.58rem] font-semibold text-emerald-700 dark:text-emerald-400">
            {centerLabel}
          </span>
        </div>

        <Link
          href="/products"
          className={sideTabClass(isProductsActive)}
          aria-label="Products"
          aria-current={isProductsActive ? "page" : undefined}
        >
          <ProductsTabIcon active={isProductsActive} />
          <span>Products</span>
        </Link>

        <Link
          href={accountHref}
          className={sideTabClass(isAccountActive)}
          aria-label={accountLabel}
          aria-current={isAccountActive ? "page" : undefined}
        >
          <UserIcon active={isAccountActive} />
          <span>{accountLabel}</span>
        </Link>
      </div>
    </nav>
  );
}
