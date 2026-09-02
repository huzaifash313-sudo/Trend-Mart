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
      className={`tm-trendbot-fab fixed ${sideClass} z-[118] flex h-[4.25rem] w-[3.35rem] items-end justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-teal-600 pb-1 shadow-xl shadow-emerald-600/25 transition hover:scale-105 active:scale-95 ${
        strolling ? "tm-trendbot-fab--stroll" : ""
      }`}
      style={{ bottom: FAB_BOTTOM[bottomOffset] }}
      aria-label={`Open ${TREND_BOT_NAME}${shopName ? ` for ${shopName}` : ""}`}
      title={shopName ? `${TREND_BOT_NAME} — ${shopName}` : TREND_BOT_NAME}
    >
      <span className="absolute inset-0 rounded-2xl bg-emerald-400/20 tm-trendbot-pulse-ring" />
      <TrendBotAvatar size="sm" animated pose={pose} wiggle={wiggle} />
      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[0.5rem] font-black text-emerald-600 shadow">
        AI
      </span>
    </button>
  );
}
