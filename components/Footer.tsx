"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Global Footer                                                 */
/*  Desktop: multi-column link grid. Mobile: compact 2-col links above the   */
/*  fixed BottomNav (with safe padding so nothing sits under the bar).         */
/* -------------------------------------------------------------------------- */

const FOOTER_LINKS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Shop",
    links: [
      { href: "/", label: "Browse Shops" },
      { href: "/products", label: "Products" },
      { href: "/wishlist", label: "Wishlist" },
    ],
  },
  {
    heading: "Sell on TrendsMart",
    links: [
      { href: "/dashboard", label: "Merchant Dashboard" },
      { href: "/faq#merchant", label: "New Merchant Guide" },
      { href: "/legal/merchant-guidelines", label: "Merchant Security Guidelines" },
    ],
  },
  {
    heading: "Help",
    links: [
      { href: "/faq", label: "FAQ" },
      { href: "/support", label: "Contact Support" },
      { href: "/orders/tracking", label: "Track an Order" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/legal/terms", label: "Terms & Conditions" },
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/refund-policy", label: "Refund & Order Policy" },
    ],
  },
];

export default function Footer() {
  const pathname = usePathname();
  // Standalone flows — admin console and QR dine-in scan pages bring their own chrome.
  if (
    pathname === "/offline" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/t/")
  ) {
    return null;
  }

  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  const mobilePad = isAuthRoute
    ? "pb-6"
    : "pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]";

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-bg)]">
      {/* ── Mobile: compact, clears BottomNav ───────────────────────── */}
      <div className={`mx-auto max-w-6xl px-4 pt-5 md:hidden ${mobilePad}`}>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-base font-bold text-emerald-600 dark:text-emerald-400"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/trendsmart-mark.png?v=10"
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 object-contain"
          />
          TrendsMart
        </Link>
        <p className="mt-1.5 max-w-sm text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          Your neighborhood, delivered. Local shops via WhatsApp.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
          {FOOTER_LINKS.map((group) => (
            <div key={group.heading}>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {group.heading}
              </p>
              <ul className="space-y-1.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-xs text-zinc-600 transition-colors hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-4 border-t border-zinc-100 pt-3 text-[10px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          &copy; {new Date().getFullYear()} TrendsMart. All rights reserved.
        </p>
      </div>

      {/* ── Desktop / tablet ────────────────────────────────────────── */}
      <div className="mx-auto hidden max-w-7xl px-6 py-8 md:block">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-lg font-bold text-emerald-600 dark:text-emerald-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/trendsmart-mark.png?v=10"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 object-contain"
              />
              TrendsMart
            </Link>
            <p className="mt-2 max-w-[16rem] text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Your neighborhood, delivered. Discover local shops and order directly via WhatsApp.
            </p>
          </div>
          {FOOTER_LINKS.map((group) => (
            <div key={group.heading}>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {group.heading}
              </p>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-zinc-600 transition-colors hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-6 border-t border-zinc-100 pt-4 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          &copy; {new Date().getFullYear()} TrendsMart. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
