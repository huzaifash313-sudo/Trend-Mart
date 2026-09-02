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
import { TrendBotLauncher } from "@/components/trendbot/TrendBotLauncher";
import { TrendBotPanel } from "@/components/trendbot/TrendBotPanel";

const SCROLL_TEASE_MIN_PX = 400;
const TEASE_COOLDOWN_MS = 45_000;
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
    const key = "tm_trendbot_teased_v2";
    if (sessionStorage.getItem(key)) return;
    const t = setTimeout(() => {
      sessionStorage.setItem(key, "1");
      showTeaser(TREND_BOT_TEASERS[0]!);
    }, 10_000);
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
          className="tm-trendbot-bubble fixed right-3 z-[119] max-w-[min(260px,calc(100vw-5rem))] rounded-2xl rounded-br-sm border border-emerald-100 bg-white px-3.5 py-2.5 text-left text-xs font-medium leading-snug text-zinc-700 shadow-lg dark:bg-zinc-900 dark:text-zinc-200"
          style={{ bottom: "calc(6.75rem + env(safe-area-inset-bottom, 0px))" }}
          aria-label="Open TrendBot chat"
        >
          <span className="block text-[0.6rem] font-bold uppercase tracking-wide text-emerald-600">
            {TREND_BOT_NAME}
          </span>
          {teaser}
        </button>
      ) : null}

      {!open ? (
        <TrendBotLauncher side="right" wiggle={wiggle} onOpen={() => { setTeaser(null); setOpen(true); }} />
      ) : null}

      <TrendBotPanel
        role="customer"
        welcomeText={TREND_BOT_WELCOME_CUSTOMER}
        initialPrompts={CUSTOMER_PROMPTS}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
