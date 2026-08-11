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

function StarGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

/**
 * Marketplace-style rating chip for cards / headers.
 * Example: ★ 4.5 (4.2k)
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
  size?: "xs" | "sm" | "md";
}) {
  if (!hasShopRating(average, count)) return null;

  const avg = Math.min(5, Math.max(0, Number(average))).toFixed(1);
  const reviews = formatReviewCount(Number(count));
  const reviewWord = Number(count) === 1 ? "review" : "reviews";

  const sizes = {
    xs: {
      wrap: "gap-0.5 rounded px-1 py-0.5",
      star: "h-2.5 w-2.5",
      score: "text-[10px] leading-none",
      count: "text-[9px] leading-none",
    },
    sm: {
      wrap: "gap-1 rounded-md px-1.5 py-0.5",
      star: "h-3 w-3",
      score: "text-[11px] leading-none sm:text-[12px]",
      count: "text-[10px] leading-none sm:text-[11px]",
    },
    md: {
      wrap: "gap-1.5 rounded-lg px-2 py-1",
      star: "h-3.5 w-3.5",
      score: "text-[13px] leading-none sm:text-sm",
      count: "text-[11px] leading-none sm:text-xs",
    },
  }[size];

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center border border-amber-200/80 bg-gradient-to-b from-amber-50 to-amber-50/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-amber-500/25 dark:from-amber-950/50 dark:to-amber-950/20 dark:shadow-none ${sizes.wrap} ${className}`}
      title={`${avg} average from ${Number(count).toLocaleString()} ${reviewWord}`}
      aria-label={`${avg} out of 5 stars, ${Number(count).toLocaleString()} ${reviewWord}`}
    >
      <StarGlyph className={`shrink-0 text-amber-500 dark:text-amber-400 ${sizes.star}`} />
      <span
        className={`font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50 ${sizes.score}`}
      >
        {avg}
      </span>
      <span
        className={`truncate font-medium tabular-nums text-zinc-500 dark:text-zinc-400 ${sizes.count}`}
      >
        ({reviews})
      </span>
    </span>
  );
}
