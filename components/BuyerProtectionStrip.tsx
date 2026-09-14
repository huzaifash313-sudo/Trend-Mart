"use client";

import Link from "next/link";
import { useLocale } from "@/context/LocaleContext";

/**
 * Local-marketplace trust strip — COD/WhatsApp honesty + refund help.
 * Not fake "escrow" claims; matches TrendsMart payment model.
 */
export default function BuyerProtectionStrip({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { t } = useLocale();

  if (compact) {
    return (
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-[10px] text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200 ${className}`}
      >
        <span className="font-bold">{t("trust.title")}</span>
        <Link href="/legal/refund-policy" className="underline underline-offset-2">
          {t("trust.refund")}
        </Link>
        <Link href="/support" className="underline underline-offset-2">
          {t("trust.contact")}
        </Link>
      </div>
    );
  }

  return (
    <section
      className={`rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 to-white p-3 dark:border-emerald-900/40 dark:from-emerald-950/40 dark:to-zinc-900 ${className}`}
    >
      <h3 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
        {t("trust.title")}
      </h3>
      <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-emerald-950/80 dark:text-emerald-100/80">
        <li>• {t("trust.cod")}</li>
        <li>• {t("trust.local")}</li>
        <li>
          • {t("trust.dispute")}{" "}
          <Link
            href="/support"
            className="font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
          >
            {t("trust.contact")}
          </Link>
        </li>
      </ul>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold">
        <Link
          href="/legal/refund-policy"
          className="rounded-lg bg-white/80 px-2 py-1 text-emerald-800 ring-1 ring-emerald-200 dark:bg-zinc-900 dark:text-emerald-200 dark:ring-emerald-800"
        >
          {t("trust.refund")}
        </Link>
        <Link
          href="/legal/terms"
          className="rounded-lg bg-white/80 px-2 py-1 text-emerald-800 ring-1 ring-emerald-200 dark:bg-zinc-900 dark:text-emerald-200 dark:ring-emerald-800"
        >
          {t("trust.terms")}
        </Link>
      </div>
    </section>
  );
}
