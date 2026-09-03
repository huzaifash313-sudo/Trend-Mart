"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const ADMIN_NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "📊", desc: "Metrics · merchants · orders" },
  { href: "/admin/appearance", label: "Appearance", icon: "🎨", desc: "Brand colors · 1-click themes" },
  { href: "/admin/support", label: "Support Inbox", icon: "📨", desc: "Platform tickets" },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: "🛡️", desc: "Security trail" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin/dashboard") {
    return pathname === "/admin/dashboard";
  }
  return pathname.startsWith(href);
}

export default function AdminLayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <div className="lg:hidden sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="mr-2 shrink-0 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            🛒 Admin
          </span>
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive(pathname, item.href)
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
          <Link
            href="/"
            className="ml-auto shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Storefront →
          </Link>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-zinc-200 bg-white px-4 py-6 lg:flex dark:border-zinc-800 dark:bg-zinc-900">
          <Link href="/admin/dashboard" className="flex items-center gap-2 px-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-lg text-white">
              🛒
            </span>
            <span>
              <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100">
                TrendsMart
              </span>
              <span className="block text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Super Admin
              </span>
            </span>
          </Link>

          <nav className="mt-8 space-y-1">
            {ADMIN_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-xl px-3 py-2.5 transition-colors ${
                    active
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="flex items-center gap-2.5 text-sm font-semibold">
                    <span>{item.icon}</span>
                    {item.label}
                  </span>
                  <span className="mt-0.5 pl-7 text-[0.65rem] text-zinc-400 dark:text-zinc-500">
                    {item.desc}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3">
            <Link
              href="/"
              className="block rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              → Storefront
            </Link>
            <p className="px-3 text-[0.65rem] text-zinc-400 dark:text-zinc-500">
              TrendsMart Super Admin v1.1
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
