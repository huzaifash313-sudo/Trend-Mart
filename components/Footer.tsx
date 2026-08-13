"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Global Footer                                                 */
/*  Provides discoverable links to legal/support pages, required for         */
/*  compliance and platform trust. Hidden on mobile where BottomNav already   */
/*  provides primary navigation, to avoid double bottom-bar clutter.          */
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
    heading: "Sell on TrendMart",
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
  if (pathname === "/offline") return null;

  return (
    <footer className="hidden border-t border-zinc-200 bg-white dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-bg)] md:block">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/trendmart-mark.png?v=4"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
              />
              TrendMart
            </Link>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
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
        <div className="mt-8 border-t border-zinc-100 pt-6 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          &copy; {new Date().getFullYear()} TrendMart. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
