"use client";

/** Format 4200 → "4.2k", 999 → "999" */
export function formatReviewCount(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n < 1000) return String(n);
  if (n < 10_000) {
    const k = Math.round((n / 1000) * 10) / 10;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

export function hasShopRating(
  avg?: number | null,
  count?: number | null,
): boolean {
  return (Number(count) || 0) > 0 && Number(avg) > 0;
}

/**
 * Tiny rating line for cards — does not break layout.
 * Example: ★ 4.5 · 4.2k
 */
export default function CompactRating({
  average,
  count,
  className = "",
  size = "sm",
}: {
  average?: number | null;
  count?: number | null;
  className?: string;
  size?: "xs" | "sm";
}) {
  if (!hasShopRating(average, count)) return null;

  const avg = Math.min(5, Math.max(0, Number(average))).toFixed(1);
  const text =
    size === "xs"
      ? "text-[10px] leading-none"
      : "text-[11px] leading-none sm:text-[12px]";

  return (
    <p
      className={`inline-flex min-w-0 max-w-full items-center gap-1 tabular-nums text-amber-700 dark:text-amber-400 ${text} ${className}`}
      title={`${avg} average from ${count} reviews`}
      aria-label={`${avg} stars, ${count} reviews`}
    >
      <span className="shrink-0 text-amber-500 dark:text-amber-400" aria-hidden="true">
        ★
      </span>
      <span className="font-semibold text-zinc-800 dark:text-zinc-100">{avg}</span>
      <span className="text-zinc-300 dark:text-zinc-600" aria-hidden="true">
        ·
      </span>
      <span className="truncate text-zinc-500 dark:text-zinc-400">
        {formatReviewCount(Number(count))}
      </span>
    </p>
  );
}
