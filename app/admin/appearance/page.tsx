"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BrandThemeAdminPanel from "@/components/admin/BrandThemeAdminPanel";
import { resolveClientAdminStatus } from "@/services/adminRoleCheck";

export default function AdminAppearancePage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const status = await resolveClientAdminStatus();
      if (cancelled) return;
      if (status === "anon") {
        router.replace("/auth");
        return;
      }
      if (status !== "admin") {
        router.replace("/dashboard");
        return;
      }
      setIsAdmin(true);
      setAuthLoading(false);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (authLoading || !isAdmin) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Super Admin
        </p>
        <h1 className="tm-font-display mt-1 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          Appearance
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Platform brand colors for the entire TrendsMart UI. Layout stays the same — only the
          color system changes.
        </p>
      </header>

      <BrandThemeAdminPanel />
    </div>
  );
}
