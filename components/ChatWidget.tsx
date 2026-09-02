"use client";

import { useState } from "react";
import { SHOP_PROMPTS } from "@/lib/ai/assistantEngine";
import { TREND_BOT_NAME, TREND_BOT_WELCOME_SHOP } from "@/lib/ai/trendBotBrand";
import { TrendBotAvatar } from "@/components/trendbot/TrendBotAvatar";
import { TrendBotPanel } from "@/components/trendbot/TrendBotPanel";

interface ChatWidgetProps {
  shopId: string;
  shopName?: string;
  accentHex?: string;
}

/** Shop-scoped TrendBot — right side to avoid global TrendBot on left. */
export default function ChatWidget({ shopId, shopName = "Shop" }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 z-[140] flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-teal-600 shadow-xl shadow-emerald-600/30 transition hover:scale-105 active:scale-95 md:bottom-8"
          aria-label={`Open ${TREND_BOT_NAME} for ${shopName}`}
        >
          <span className="absolute inset-0 rounded-full bg-emerald-400/20 tm-trendbot-pulse-ring" />
          <TrendBotAvatar size="md" animated />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[0.55rem] font-black text-emerald-600 shadow">
            AI
          </span>
        </button>
      ) : null}

      <TrendBotPanel
        role="shop"
        shopId={shopId}
        shopName={shopName}
        welcomeText={TREND_BOT_WELCOME_SHOP(shopName)}
        initialPrompts={SHOP_PROMPTS}
        open={open}
        onClose={() => setOpen(false)}
        subtitle={`${shopName} · Products & prices`}
        anchor="right"
      />
    </>
  );
}
