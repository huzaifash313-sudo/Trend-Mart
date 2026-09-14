"use client";

import { useOfferClock } from "@/lib/offerClock";
import { formatOfferRemaining } from "@/lib/shopOfferTicker";
import { useLocale } from "@/context/LocaleContext";

/** Compact flash / deal countdown — urgency without Daraz sticker spam. */
export default function FlashCountdown({
  endsAt,
  className = "",
}: {
  endsAt?: string | null;
  className?: string;
}) {
  const { t } = useLocale();
  const now = useOfferClock();
  const label = endsAt ? formatOfferRemaining(endsAt, now) : null;

  if (!label) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-rose-600/95 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm ${className}`}
      title={t("flash.hurry")}
    >
      <span className="opacity-90">{t("flash.endsIn")}</span>
      <span className="tabular-nums">{label}</span>
    </span>
  );
}
