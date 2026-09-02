"use client";

import { TrendBotAvatar } from "@/components/trendbot/TrendBotAvatar";
import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";

interface TrendBotLauncherProps {
  onOpen: () => void;
  variant?: "pill" | "fab";
  shopName?: string;
  wiggle?: boolean;
}

export function TrendBotLauncher({
  onOpen,
  variant = "fab",
  shopName,
  wiggle = false,
}: TrendBotLauncherProps) {
  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="tm-trendbot-launcher-pill fixed inset-x-3 z-[120] flex items-center gap-3 rounded-2xl border border-emerald-200/90 bg-white/95 px-4 py-2.5 shadow-lg shadow-emerald-900/10 backdrop-blur-md transition active:scale-[0.98] dark:border-emerald-800/60 dark:bg-zinc-900/95"
        style={{ bottom: "calc(3.85rem + env(safe-area-inset-bottom, 0px))" }}
        aria-label={`Open ${TREND_BOT_NAME}`}
      >
        <TrendBotAvatar size="sm" animated wiggle={wiggle} />
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-bold text-emerald-800 dark:text-emerald-200">
            {TREND_BOT_NAME}
          </p>
          <p className="truncate text-[0.65rem] text-zinc-500 dark:text-zinc-400">
            {shopName ? `${shopName} se pucho — products, deals, order` : "App ka kuch bhi pucho — free AI"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-2.5 py-1 text-[0.6rem] font-bold text-white">
          Ask
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed left-3 z-[120] flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-teal-600 shadow-xl shadow-emerald-600/25 transition hover:scale-105 active:scale-95"
      style={{ bottom: "calc(3.85rem + env(safe-area-inset-bottom, 0px))" }}
      aria-label={`Open ${TREND_BOT_NAME}`}
    >
      <span className="absolute inset-0 rounded-2xl bg-emerald-400/20 tm-trendbot-pulse-ring" />
      <TrendBotAvatar size="sm" animated wiggle={wiggle} />
      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[0.5rem] font-black text-emerald-600 shadow">
        AI
      </span>
    </button>
  );
}
