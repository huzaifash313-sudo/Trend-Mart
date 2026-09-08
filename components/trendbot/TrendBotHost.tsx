"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { TrendBotPose } from "@/components/trendbot/TrendBotAvatar";
import {
  buildContextualWelcome,
  getTrendBotPagePack,
  resolveTrendBotPageContext,
} from "@/lib/ai/trendBotContext";
import {
  cancelTrendBotVoice,
  isTrendBotVoiceMuted,
  setTrendBotVoiceMuted,
  speakTrendBotLine,
} from "@/lib/ai/trendBotVoice";
import {
  shouldHideGlobalTrendBot,
  TREND_BOT_NAME,
  TREND_BOT_WELCOME_CUSTOMER,
} from "@/lib/ai/trendBotBrand";
import { TrendBotLauncher } from "@/components/trendbot/TrendBotLauncher";
import { TrendBotPanel } from "@/components/trendbot/TrendBotPanel";

const SCROLL_TEASE_MIN_PX = 480;
const TEASE_COOLDOWN_MS = 65_000;
const TEASE_VISIBLE_MS = 5_800;
const STROLL_EVERY_MS = 120_000;
const ROUTE_TIP_DELAY_MS = 2_200;

export default function TrendBotHost() {
  const pathname = usePathname() ?? "/";
  const hidden = shouldHideGlobalTrendBot(pathname);
  const pageCtx = resolveTrendBotPageContext(pathname);
  const pack = useMemo(() => getTrendBotPagePack(pageCtx), [pageCtx]);

  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState<string | null>(null);
  const [wiggle, setWiggle] = useState(false);
  const [pose, setPose] = useState<TrendBotPose>("idle");
  const [strolling, setStrolling] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);

  const lastScrollY = useRef(0);
  const scrollAccum = useRef(0);
  const lastTeaseAt = useRef(0);
  const teaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teaserRound = useRef(0);
  const poseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVoiceMuted(isTrendBotVoiceMuted());
  }, []);

  const flashPose = useCallback((next: TrendBotPose, ms = 800) => {
    setPose(next);
    if (poseTimer.current) clearTimeout(poseTimer.current);
    poseTimer.current = setTimeout(() => setPose("idle"), ms);
  }, []);

  const showTeaser = useCallback(
    (text: string, mood: "wave" | "jump" | "happy" = "wave") => {
      if (open) return;
      setTeaser(text);
      setWiggle(true);
      flashPose(mood, mood === "jump" ? 850 : 780);
      setTimeout(() => setWiggle(false), 700);
      if (teaseTimer.current) clearTimeout(teaseTimer.current);
      teaseTimer.current = setTimeout(() => setTeaser(null), TEASE_VISIBLE_MS);
    },
    [open, flashPose],
  );

  /* Route enter — soft tip + rare voice (once per route / session). */
  useEffect(() => {
    if (hidden || open) return;
    const tip = pack.teasers[0];
    const voice = pack.voiceLines[0];
    const t = setTimeout(() => {
      if (tip) {
        showTeaser(
          tip,
          pageCtx === "deals" ? "jump" : pageCtx === "home" ? "happy" : "wave",
        );
      }
      if (voice) {
        speakTrendBotLine(voice, { routeKey: `route:${pageCtx}`, cute: true });
      }
    }, ROUTE_TIP_DELAY_MS);
    return () => clearTimeout(t);
  }, [hidden, open, pageCtx, pack, showTeaser]);

  /* Occasional scroll tease — sparse so it never feels spammy. */
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
        teaserRound.current = (teaserRound.current + 1) % pack.teasers.length;
        showTeaser(pack.teasers[teaserRound.current]!);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hidden, open, pack.teasers, showTeaser]);

  /* Rare stroll across the bottom — walk pose, then settle. */
  useEffect(() => {
    if (hidden || open) return;
    let cancelled = false;

    const runStroll = () => {
      if (cancelled || open) return;
      try {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      } catch {
        /* ignore */
      }
      setStrolling(true);
      setPose("walk");
      window.setTimeout(() => {
        if (cancelled) return;
        setStrolling(false);
        flashPose("happy", 800);
      }, 4900);
    };

    const first = window.setTimeout(runStroll, 28_000);
    const interval = window.setInterval(runStroll, STROLL_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [hidden, open, flashPose]);

  useEffect(() => {
    if (open) {
      cancelTrendBotVoice();
      setTeaser(null);
      setStrolling(false);
      setPose("idle");
    }
  }, [open]);

  const welcomeText = useMemo(
    () => buildContextualWelcome(pageCtx, TREND_BOT_WELCOME_CUSTOMER),
    [pageCtx],
  );

  if (hidden) return null;

  return (
    <>
      {teaser && !open ? (
        <div
          className="tm-trendbot-bubble fixed right-3 z-[119] max-w-[min(210px,calc(100vw-4.5rem))]"
          style={{ bottom: "calc(7.35rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="rounded-xl rounded-br-sm border border-emerald-100 bg-white px-2.5 py-2 text-left shadow-lg dark:border-emerald-900/40 dark:bg-zinc-900">
            {/* Header row — TrendBot label, voice toggle, close */}
            <div className="mb-1 flex items-center gap-1">
              <span className="text-[0.58rem] font-bold uppercase tracking-wide text-emerald-600 flex-1">
                {TREND_BOT_NAME}
              </span>
              {/* Voice toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !voiceMuted;
                  setTrendBotVoiceMuted(next);
                  setVoiceMuted(next);
                }}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[0.55rem] text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label={voiceMuted ? "Unmute TrendBot voice" : "Mute TrendBot voice"}
              >
                {voiceMuted ? "🔇" : "🔊"}
              </button>
              {/* Close / dismiss bubble */}
              <button
                type="button"
                onClick={() => setTeaser(null)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                aria-label="Dismiss message"
              >
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Teaser text — tapping opens the full TrendBot panel */}
            <button
              type="button"
              onClick={() => {
                setTeaser(null);
                setOpen(true);
                flashPose("happy", 780);
              }}
              className="block w-full text-left text-[11px] font-medium leading-snug text-zinc-700 dark:text-zinc-200"
              aria-label="Open TrendBot chat"
            >
              {teaser}
            </button>

            {/* Tap hint */}
            <p className="mt-1 text-[9px] text-zinc-400 dark:text-zinc-500">
              Tap to chat →
            </p>
          </div>
        </div>
      ) : null}

      {!open ? (
        <TrendBotLauncher
          side="right"
          wiggle={wiggle}
          pose={pose}
          strolling={strolling}
          onOpen={() => {
            setTeaser(null);
            setOpen(true);
            flashPose("happy", 780);
            speakTrendBotLine(
              "Salam! TrendBot yahan hai. Products, deals, ya koi bhi sawaal — batao.",
              { routeKey: "open:panel", cute: true },
            );
          }}
        />
      ) : null}

      <TrendBotPanel
        role="customer"
        welcomeText={welcomeText}
        initialPrompts={pack.prompts}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
