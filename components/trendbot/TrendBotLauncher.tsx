"use client";

import type { TrendBotPose } from "@/components/trendbot/TrendBotAvatar";
import { TrendBotAvatar } from "@/components/trendbot/TrendBotAvatar";
import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";

interface TrendBotLauncherProps {
  onOpen: () => void;
  /** Side FAB — right keeps clear of geo filters on the left */
  side?: "left" | "right";
  /** Extra lift above bottom nav (shop pages stack above WhatsApp float) */
  bottomOffset?: "default" | "raised";
  shopName?: string;
  wiggle?: boolean;
  pose?: TrendBotPose;
  /** Rare stroll across the bottom edge */
  strolling?: boolean;
}

const FAB_BOTTOM = {
  default: "calc(5.2rem + env(safe-area-inset-bottom, 0px))",
  raised: "calc(6.7rem + env(safe-area-inset-bottom, 0px))",
} as const;

export function TrendBotLauncher({
  onOpen,
  side = "right",
  bottomOffset = "default",
  shopName,
  wiggle = false,
  pose = "idle",
  strolling = false,
}: TrendBotLauncherProps) {
  const sideClass = side === "left" ? "left-3" : "right-3";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`tm-trendbot-fab fixed ${sideClass} z-[118] flex h-[4.35rem] w-[3.4rem] items-end justify-center bg-transparent p-0 shadow-none transition hover:scale-105 active:scale-95 ${
        strolling ? "tm-trendbot-fab--stroll" : ""
      }`}
      style={{ bottom: FAB_BOTTOM[bottomOffset] }}
      aria-label={`Open ${TREND_BOT_NAME}${shopName ? ` for ${shopName}` : ""}`}
      title={shopName ? `${TREND_BOT_NAME} — ${shopName}` : TREND_BOT_NAME}
    >
      <TrendBotAvatar size="sm" animated pose={pose} wiggle={wiggle} />
      <span className="absolute -right-0.5 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[0.5rem] font-black text-emerald-700 ring-1 ring-emerald-200/80 shadow-sm dark:bg-[var(--tm-elevated)] dark:text-emerald-200 dark:ring-emerald-400/40">
        AI
      </span>
    </button>
  );
}
