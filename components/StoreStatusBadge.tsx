"use client";

import { useMemo } from "react";

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

interface StoreStatusBadgeProps {
  /** The operating status text from the shop record */
  operatingStatus?: string | null;
  /** Business hours string from the shop record */
  businessHours?: string | null;
  /** Whether the shop is marked as live */
  isLive?: boolean;
  /** CSS size variant */
  size?: "sm" | "md";
  /** Additional classes for the wrapper */
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function StoreStatusBadge({
  operatingStatus,
  businessHours,
  isLive = false,
  size = "md",
  className = "",
}: StoreStatusBadgeProps) {
  // Determine badge state
  const badge = useMemo(() => {
    if (!isLive) {
      return {
        label: "Offline",
        bgClass: "bg-zinc-100 dark:bg-zinc-800",
        textClass: "text-zinc-500 dark:text-zinc-400",
        dotClass: "bg-zinc-400",
        icon: "⚫",
        fullText: "Shop is currently offline",
      };
    }

    if (operatingStatus) {
      const lower = operatingStatus.toLowerCase();
      if (lower.includes("closed") || lower.includes("break")) {
        return {
          label: "Closed",
          bgClass: "bg-red-100 dark:bg-red-900/20",
          textClass: "text-red-700 dark:text-red-400",
          dotClass: "bg-red-500",
          icon: "🔴",
          fullText: operatingStatus,
        };
      }
      if (lower.includes("open")) {
        return {
          label: "Open",
          bgClass: "bg-emerald-100 dark:bg-emerald-900/20",
          textClass: "text-emerald-700 dark:text-emerald-400",
          dotClass: "bg-emerald-500 animate-pulse",
          icon: "🟢",
          fullText: operatingStatus,
        };
      }
    }

    // Default: live but no explicit status — assume open
    return {
      label: "Open Now",
      bgClass: "bg-emerald-100 dark:bg-emerald-900/20",
      textClass: "text-emerald-700 dark:text-emerald-400",
      dotClass: "bg-emerald-500 animate-pulse",
      icon: "🟢",
      fullText: businessHours ?? "Accepting orders",
    };
  }, [isLive, operatingStatus, businessHours]);

  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[10px]"
      : "px-3 py-1 text-xs";

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sizeClasses} ${badge.bgClass} ${badge.textClass}`}
        title={badge.fullText}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} aria-hidden="true" />
        {badge.label}
      </span>
      {isLive && (!operatingStatus || operatingStatus.toLowerCase().includes("open")) && businessHours && (
        <span className="hidden sm:inline text-xs text-zinc-400 dark:text-zinc-500">
          {businessHours}
        </span>
      )}
    </div>
  );
}