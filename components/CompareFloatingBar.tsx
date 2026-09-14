"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCompareItems, type CompareItem } from "@/lib/compare";
import { useLocale } from "@/context/LocaleContext";

/** Sticky tray when user has products in compare */
export default function CompareFloatingBar() {
  const { t } = useLocale();
  const [items, setItems] = useState<CompareItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(getCompareItems());
    sync();
    window.addEventListener("trendsmart:compare-changed", sync);
    return () => window.removeEventListener("trendsmart:compare-changed", sync);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[4.25rem] z-[120] flex justify-center px-3 sm:bottom-6">
      <Link
        href="/compare"
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white shadow-lg ring-1 ring-white/10 dark:bg-emerald-600"
      >
        {t("compare.open")}
        <span className="rounded-full bg-white/20 px-2 py-0.5 tabular-nums">
          {items.length}/3
        </span>
      </Link>
    </div>
  );
}
