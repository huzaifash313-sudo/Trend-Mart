"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CUSTOMER_PROMPTS } from "@/lib/ai/assistantEngine";
import {
  shouldHideGlobalTrendBot,
  TREND_BOT_NAME,
  TREND_BOT_TEASERS,
  TREND_BOT_WELCOME_CUSTOMER,
} from "@/lib/ai/trendBotBrand";
import { TrendBotAvatar } from "@/components/trendbot/TrendBotAvatar";
import { TrendBotPanel } from "@/components/trendbot/TrendBotPanel";

const SCROLL_TEASE_MIN_PX = 380;
const TEASE_COOLDOWN_MS = 42_000;
const TEASE_VISIBLE_MS = 6_500;

export default function TrendBotHost() {
  const pathname = usePathname() ?? "/";
  const hidden = shouldHideGlobalTrendBot(pathname);

  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState<string | null>(null);
  const [wiggle, setWiggle] = useState(false);

  const lastScrollY = useRef(0);
  const scrollAccum = useRef(0);
  const lastTeaseAt = useRef(0);
  const teaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teaserRound = useRef(0);

  const showTeaser = useCallback((text: string) => {
    if (open) return;
    setTeaser(text);
    setWiggle(true);
    setTimeout(() => setWiggle(false), 600);
    if (teaseTimer.current) clearTimeout(teaseTimer.current);
    teaseTimer.current = setTimeout(() => setTeaser(null), TEASE_VISIBLE_MS);
  }, [open]);

  useEffect(() => {
    if (hidden || open) {
      setTeaser(null);
      return;
    }

    const onScroll = () => {
      const y = window.scrollY;
      scrollAccum.current += Math.abs(y - lastScrollY.current);
      lastScrollY.current = y;

      const now = Date.now();
      if (
        scrollAccum.current >= SCROLL_TEASE_MIN_PX &&
        now - lastTeaseAt.current >= TEASE_COOLDOWN_MS
      ) {
        scrollAccum.current = 0;
        lastTeaseAt.current = now;
        teaserRound.current = (teaserRound.current + 1) % TREND_BOT_TEASERS.length;
        showTeaser(TREND_BOT_TEASERS[teaserRound.current]!);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hidden, open, showTeaser]);

  useEffect(() => {
    if (hidden || open) return;
    const key = "tm_trendbot_teased_v1";
    if (sessionStorage.getItem(key)) return;
    const t = setTimeout(() => {
      sessionStorage.setItem(key, "1");
      showTeaser(TREND_BOT_TEASERS[0]!);
    }, 8_000);
    return () => clearTimeout(t);
  }, [hidden, open, showTeaser]);

  if (hidden) return null;

  return (
    <>
      {teaser && !open ? (
        <button
          type="button"
          onClick={() => {
            setTeaser(null);
            setOpen(true);
          }}
          className="tm-trendbot-bubble fixed bottom-[7.5rem] left-4 z-[131] max-w-[min(280px,calc(100vw-5.5rem))] rounded-2xl rounded-bl-sm border border-emerald-100 bg-white px-3.5 py-2.5 text-left text-xs font-medium leading-snug text-zinc-700 shadow-lg shadow-emerald-900/10 md:bottom-[5.5rem]"
          aria-label="Open TrendBot chat"
        >
          <span className="block text-[0.6rem] font-bold uppercase tracking-wide text-emerald-600">
            {TREND_BOT_NAME}
          </span>
          {teaser}
        </button>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => {
            setTeaser(null);
            setOpen(true);
          }}
          className="group fixed bottom-24 left-4 z-[130] flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-teal-600 shadow-xl shadow-emerald-600/30 transition hover:scale-105 active:scale-95 md:bottom-8"
          aria-label={`Open ${TREND_BOT_NAME}`}
        >
          <span className="absolute inset-0 rounded-full bg-emerald-400/20 tm-trendbot-pulse-ring" />
          <TrendBotAvatar size="md" animated wiggle={wiggle} />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[0.55rem] font-black text-emerald-600 shadow">
            AI
          </span>
        </button>
      ) : null}

      <TrendBotPanel
        role="customer"
        welcomeText={TREND_BOT_WELCOME_CUSTOMER}
        initialPrompts={CUSTOMER_PROMPTS}
        open={open}
        onClose={() => setOpen(false)}
        anchor="left"
      />
    </>
  );
}
