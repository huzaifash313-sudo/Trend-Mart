"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/CartContext";
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

/** After ✕, no tip bubbles until this TTL (2h). Avatar stroll still OK. */
const TEASER_DISMISS_KEY = "tm_trendbot_teaser_dismiss_v2";
const TEASER_DISMISS_TTL_MS = 2 * 60 * 60 * 1000;

const TEASE_VISIBLE_MS = 4_200;
const STROLL_EVERY_MS = 120_000;
const ROUTE_TIP_DELAY_MS = 2_800;

function isTeaserDismissed(): boolean {
  try {
    const raw = localStorage.getItem(TEASER_DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < TEASER_DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function markTeaserDismissed() {
  try {
    localStorage.setItem(TEASER_DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Product/deal DETAIL pages (not the listing pages) render a primary
 * "Order now" action button in normal page flow, low enough on mobile that
 * the auto-popup teaser bubble can land directly on top of it. The launcher
 * FAB (small, tap-to-open) still shows there — only the unsolicited text
 * bubble is suppressed.
 */
function pageHasFoldedBuyButton(pathname: string): boolean {
  return /^\/(products|p|deals)\/[^/]+/i.test(pathname);
}

export default function TrendBotHost() {
  const pathname = usePathname() ?? "/";
  const hidden = shouldHideGlobalTrendBot(pathname);
  const suppressTeaser = pageHasFoldedBuyButton(pathname);
  const pageCtx = resolveTrendBotPageContext(pathname);
  const pack = useMemo(() => getTrendBotPagePack(pageCtx), [pageCtx]);

  const { totalItems } = useCart();
  const cartVisible = totalItems > 0;

  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState<string | null>(null);
  const [wiggle, setWiggle] = useState(false);
  const [pose, setPose] = useState<TrendBotPose>("idle");
  const [strolling, setStrolling] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [teasersMuted, setTeasersMuted] = useState(true);

  const teaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVoiceMuted(isTrendBotVoiceMuted());
    setTeasersMuted(isTeaserDismissed());
  }, []);

  const flashPose = useCallback((next: TrendBotPose, ms = 800) => {
    setPose(next);
    if (poseTimer.current) clearTimeout(poseTimer.current);
    poseTimer.current = setTimeout(() => setPose("idle"), ms);
  }, []);

  const dismissTeaser = useCallback(() => {
    setTeaser(null);
    markTeaserDismissed();
    setTeasersMuted(true);
  }, []);

  const showTeaser = useCallback(
    (text: string, mood: "wave" | "jump" | "happy" = "wave") => {
      if (open || teasersMuted || isTeaserDismissed()) return;
      setTeaser(text);
      setWiggle(true);
      flashPose(mood, mood === "jump" ? 850 : 780);
      setTimeout(() => setWiggle(false), 700);
      if (teaseTimer.current) clearTimeout(teaseTimer.current);
      teaseTimer.current = setTimeout(() => setTeaser(null), TEASE_VISIBLE_MS);
    },
    [open, teasersMuted, flashPose],
  );

  /* Soft tip once on route — never during dismiss window, and never on a
     detail page where it would land on top of the "Order now" button. */
  useEffect(() => {
    if (hidden || open || teasersMuted || suppressTeaser) return;
    const tip = pack.teasers[0];
    const voice = pack.voiceLines[0];
    const t = setTimeout(() => {
      if (isTeaserDismissed()) {
        setTeasersMuted(true);
        return;
      }
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
  }, [hidden, open, pageCtx, pack, showTeaser, teasersMuted]);

  /* Scroll: only a tiny avatar wiggle — NO text bubble (was spammy while browsing). */
  useEffect(() => {
    if (hidden || open) return;

    let lastY = window.scrollY;
    let accum = 0;
    let lastWiggleAt = 0;

    const onScroll = () => {
      const y = window.scrollY;
      accum += Math.abs(y - lastY);
      lastY = y;
      if (accum < 900) return;
      accum = 0;
      const now = Date.now();
      if (now - lastWiggleAt < 90_000) return;
      lastWiggleAt = now;
      setWiggle(true);
      flashPose("wave", 600);
      window.setTimeout(() => setWiggle(false), 500);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hidden, open, flashPose]);

  /* Rare stroll — keep; users like the walk, not the tip spam. */
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
      {teaser && !open && !teasersMuted ? (
        <div
          className="tm-trendbot-bubble fixed right-3 z-[119] max-w-[min(168px,calc(100vw-5rem))]"
          style={{
            // Kept just above the launcher FAB (see FAB_BOTTOM in
            // TrendBotLauncher) so the two never separate or re-overlap.
            bottom: cartVisible
              ? "calc(12.75rem + env(safe-area-inset-bottom, 0px))"
              : "calc(8.9rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="rounded-lg rounded-br-sm border border-emerald-100/90 bg-white/95 px-2 py-1.5 text-left shadow-md dark:border-emerald-900/40 dark:bg-zinc-900/95">
            <div className="mb-0.5 flex items-center gap-0.5">
              <span className="flex-1 text-[0.52rem] font-bold uppercase tracking-wide text-emerald-600">
                {TREND_BOT_NAME}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = !voiceMuted;
                  setTrendBotVoiceMuted(next);
                  setVoiceMuted(next);
                }}
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[0.5rem] text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label={voiceMuted ? "Unmute TrendBot voice" : "Mute TrendBot voice"}
              >
                {voiceMuted ? "🔇" : "🔊"}
              </button>
              <button
                type="button"
                onClick={dismissTeaser}
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                aria-label="Dismiss for a while"
                title="Hide tips for 2 hours"
              >
                <svg className="h-2 w-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setTeaser(null);
                setOpen(true);
                flashPose("happy", 780);
              }}
              className="block w-full text-left text-[10px] font-medium leading-snug text-zinc-700 dark:text-zinc-200"
              aria-label="Open TrendBot chat"
            >
              {teaser}
            </button>
          </div>
        </div>
      ) : null}

      {!open ? (
        <TrendBotLauncher
          side="right"
          bottomOffset={cartVisible ? "cart" : "default"}
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
