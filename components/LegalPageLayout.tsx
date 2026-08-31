import Link from "next/link";
import type { ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Shared Legal/Policy Page Shell                                */
/*  Consistent header, last-updated date, and prose styling for all legal     */
/*  and support-adjacent static pages (Terms, Privacy, Guidelines, etc.)      */
/* -------------------------------------------------------------------------- */

const LEGAL_NAV = [
  { href: "/legal/terms", label: "Terms & Conditions" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/merchant-guidelines", label: "Merchant Security Guidelines" },
  { href: "/legal/refund-policy", label: "Refund & Order Policy" },
  { href: "/faq", label: "FAQ & Merchant Guide" },
  { href: "/support", label: "Contact Support" },
];

/** A titled section of body copy, used to build up legal/policy page content consistently. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">{heading}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</div>
    </section>
  );
}

/** A styled unordered list for legal page bullet content. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function LegalPageLayout({
  title,
  icon,
  lastUpdated,
  children,
}: {
  title: string;
  icon: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400"
        >
          ← Back to TrendsMart
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
          {/* Sidebar navigation */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <nav className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Legal & Support
              </p>
              {LEGAL_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    item.label === title
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                      : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <main className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-6 border-b border-zinc-100 pb-6 dark:border-zinc-800">
              <div className="mb-2 text-3xl">{icon}</div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{title}</h1>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Last updated: {lastUpdated}</p>
            </div>
            <div className="space-y-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
