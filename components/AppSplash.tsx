"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";
import { PUBLIC_SHOP_PAGE_SIZE } from "@/lib/mobilePerf";
import { fetchShops } from "@/services/shopService";
import { fetchActiveStories } from "@/services/storyService";
import { fetchActiveDeals } from "@/services/dealService";

export const SPLASH_KEY = "tm_splash_seen_v6";

/**
 * First-impression intro. Shows only on a FRESH open of the homepage (new
 * browser session), never on an in-session refresh — that's the whole point of
 * the session-scoped `SPLASH_KEY`.
 *
 * Beat (deliberately slow + smooth so it never feels rushed):
 *   1) Logo pops in centered on the maroon/plum splash stage
 *   2) Logo rises + shrinks while "TrendsMart" reveals letter-by-letter
 *   3) Three value lines slide in one by one
 *   4) Hold for reading while home data prefetches — if it's not ready yet a
 *      small loading pill appears instead of a dead wait
 *   5) Slow cross-fade into the (already-warm) homepage — no maroon→white snap
 *
 * `SPLASH_KEY` is written only when the intro finishes — never at start — so
 * Strict Mode remounts and mid-animation tab switches cannot strand the brand
 * boot cover or abort a first-run play.
 */
const STAGE_MS = {
  logoHold: 420,
  brand: 520,
  details: 640,
  holdMin: 280,
  /** Keep in sync with `.tm-splash--exit` animation duration in globals.css */
  exit: 420,
  /** Never block home forever if network is slow. */
  maxWaitForData: 700,
  /** Hard cap for the whole hold phase before we bail out to home. */
  hardCapWait: 1800,
};

const REDUCED_MS = {
  logoHold: 80,
  brand: 100,
  details: 120,
  holdMin: 80,
  exit: 180,
  maxWaitForData: 200,
  hardCapWait: 400,
};

/** Slow networks / Save-Data: skip the marketing beat and open the app. */
const SLOW_NET_MS = {
  logoHold: 160,
  brand: 180,
  details: 200,
  holdMin: 100,
  exit: 220,
  maxWaitForData: 300,
  hardCapWait: 700,
};

type Phase = "off" | "logo" | "brand" | "details" | "hold" | "exit";
type StageTiming = typeof STAGE_MS;

function shouldShowSplash(pathname: string): boolean {
  if (pathname !== "/") return false;
  try {
    if (sessionStorage.getItem(SPLASH_KEY) === "1") return false;
  } catch {
    /* ignore */
  }
  // Only play the intro when the BOOT script armed it (i.e. this is a genuine
  // fresh homepage load). A client-side navigation (e.g. /products → home) must
  // NOT trigger the intro, otherwise the homepage flashes under the splash.
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("tm-splash-lock");
}

function markSplashSeen() {
  try {
    sessionStorage.setItem(SPLASH_KEY, "1");
  } catch {
    /* ignore */
  }
}

function removeBootSplash() {
  // Class-only toggle. Never call Node.remove() on #tm-boot-splash — that node
  // lives in the React layout tree and detaching it crashes Safari.
  document.documentElement.classList.remove("tm-boot-splash");
}

function clearSplashChrome() {
  const root = document.documentElement;
  root.classList.remove(
    "tm-splash-lock",
    "tm-boot-splash",
    "tm-first-paint",
  );
  // Any inline brand plate the boot script painted must not outlive the intro.
  root.style.removeProperty("background-color");
}

/** Hold brand color under the UI, then ease into the app surface (no white snap). */
function releaseSplashBackground() {
  const root = document.documentElement;
  // The page is already white underneath (settle was armed at exit start), so
  // we only need to clear the splash lock / boot classes + inline brand plate.
  clearSplashChrome();
  window.setTimeout(() => {
    root.classList.remove("tm-splash-settle");
    // Drop any inline brand plate the boot script painted onto <html> so the
    // app surface's own background shows — no brand-colored residue.
    root.style.removeProperty("background-color");
  }, 520);
}

async function unwrap<T>(
  promise: Promise<{ success: true; data: T } | { success: false; error: string }>,
): Promise<T> {
  const result = await promise;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

function stageTiming(): StageTiming {
  if (typeof window === "undefined") return STAGE_MS;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return REDUCED_MS;
    }
  } catch {
    /* ignore */
  }
  try {
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    const c = nav.connection;
    if (
      c?.saveData ||
      c?.effectiveType === "slow-2g" ||
      c?.effectiveType === "2g" ||
      c?.effectiveType === "3g"
    ) {
      return SLOW_NET_MS;
    }
  } catch {
    /* ignore */
  }
  // SSR already seeded React Query — don't make the user wait on a long intro.
  try {
    // Soft signal: if shops are already cached, use the fast path.
    // (queryClient is not available here; rely on session + boot only.)
  } catch {
    /* ignore */
  }
  return STAGE_MS;
}

/* Short, human value intro — no page mockups, just "what TrendsMart is".
   Monochrome glyphs (white on plum) keep the intro 100% brand-consistent —
   no stray colourful emoji on the boot stage. */
function BagGlyph() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
function ChatGlyph() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}
function TruckGlyph() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}

const FEATURES = [
  { glyph: <BagGlyph />, title: "Local shops nearby", subtitle: "Discover trusted stores in your area" },
  { glyph: <ChatGlyph />, title: "Order on WhatsApp", subtitle: "Direct chat with the shop — no confusion" },
  { glyph: <TruckGlyph />, title: "Fast delivery", subtitle: "Your neighbourhood, delivered to your door" },
] as const;

export default function AppSplash() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("off");
  const [dataReady, setDataReady] = useState(false);
  const timersRef = useRef<number[]>([]);
  const unmountedRef = useRef(false);
  const exitingRef = useRef(false);
  const finishedRef = useRef(false);
  const dataReadyRef = useRef(false);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const trackTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  };

  const isStopped = () => unmountedRef.current || finishedRef.current;

  const finishSplash = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markSplashSeen();
    releaseSplashBackground();
    setPhase("off");
  };

  const beginExit = (exitMs: number) => {
    if (isStopped() || exitingRef.current) return;
    exitingRef.current = true;
    // Arm the app surface BEFORE fading so the brand overlay fades into a
    // ready white page — no maroon→white snap when the overlay unmounts.
    const root = document.documentElement;
    root.classList.add("tm-splash-settle");
    root.style.removeProperty("background-color");
    setPhase("exit");
    trackTimeout(() => {
      if (unmountedRef.current) return;
      finishSplash();
    }, exitMs);
  };

  useEffect(() => {
    unmountedRef.current = false;
    exitingRef.current = false;
    finishedRef.current = false;

    if (!shouldShowSplash(pathname)) {
      // Returning visit / refresh / other route: drop any leftover boot cover.
      clearSplashChrome();
      document.documentElement.classList.remove(
        "tm-splash-handoff",
        "tm-splash-settle",
      );
      setPhase("off");
      return;
    }

    document.documentElement.classList.remove("tm-first-paint");
    document.documentElement.classList.add("tm-splash-lock");
    setPhase("logo");
    dataReadyRef.current = false;
    setDataReady(false);

    const ms = stageTiming();

    // Warm the homepage cache while the customer watches the intro.
    const prefetch = Promise.allSettled([
      queryClient.prefetchInfiniteQuery({
        queryKey: [...queryKeys.shopsInfinite, PUBLIC_SHOP_PAGE_SIZE],
        queryFn: ({ pageParam }) =>
          unwrap(
            fetchShops({
              publicOnly: true,
              limit: PUBLIC_SHOP_PAGE_SIZE,
              offset: pageParam as number,
            }),
          ),
        initialPageParam: 0,
        staleTime: 2 * 60_000,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.stories,
        queryFn: () => unwrap(fetchActiveStories()),
        staleTime: 2 * 60_000,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.deals(48),
        queryFn: () => unwrap(fetchActiveDeals(48)),
        staleTime: 2 * 60_000,
      }),
    ]).then(() => {
      dataReadyRef.current = true;
      if (!unmountedRef.current && !exitingRef.current) setDataReady(true);
    });

    trackTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!unmountedRef.current) removeBootSplash();
        });
      });
    }, 0);

    // 1) Logo alone, then rise + wordmark
    trackTimeout(() => {
      if (!isStopped() && !exitingRef.current) setPhase("brand");
    }, ms.logoHold);

    let t = ms.logoHold + ms.brand;
    // 2) Introduction slides in
    trackTimeout(() => {
      if (!isStopped() && !exitingRef.current) setPhase("details");
    }, t);
    t += ms.details;

    // 3) Hold for reading + finish prefetch if needed, then slow fade out
    trackTimeout(() => {
      if (isStopped() || exitingRef.current) return;
      setPhase("hold");
      const holdStarted = Date.now();
      void (async () => {
        // Wait for data to be ready OR the max wait window.
        await Promise.race([
          prefetch,
          new Promise<void>((resolve) => {
            trackTimeout(resolve, ms.maxWaitForData);
          }),
        ]);
        if (isStopped() || exitingRef.current) return;
        // If data still isn't ready, show the loading pill and keep waiting
        // up to the hard cap so home is never blank.
        if (!dataReadyRef.current) {
          await Promise.race([
            prefetch,
            new Promise<void>((resolve) => {
              trackTimeout(resolve, ms.hardCapWait);
            }),
          ]);
          if (isStopped() || exitingRef.current) return;
        }
        const elapsed = Date.now() - holdStarted;
        const waitMore = Math.max(0, ms.holdMin - elapsed);
        await new Promise<void>((resolve) => {
          trackTimeout(resolve, waitMore);
        });
        if (isStopped() || exitingRef.current) return;
        beginExit(ms.exit);
      })();
    }, t);

    return () => {
      unmountedRef.current = true;
      clearTimers();
      // Do NOT strip tm-splash-lock here. React Strict Mode remounts this
      // effect and shouldShowSplash() still needs the boot-armed lock. Route
      // changes hit the early-return path which calls clearSplashChrome().
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-gated intro
  }, [pathname, queryClient]);

  if (phase === "off") return null;

  return (
    <div
      className={`tm-splash tm-splash--${phase}`}
      data-phase={phase}
      role="dialog"
      aria-label="Welcome to TrendsMart"
      aria-live="polite"
    >
      <div className="tm-splash-glow" aria-hidden="true" />
      <div className="tm-splash-glow tm-splash-glow--2" aria-hidden="true" />

      <div className="tm-splash-stage">
        <div className="tm-splash-brand">
          <span className="tm-splash-logo" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/trendsmart-mark.png?v=14"
              alt=""
              width={88}
              height={88}
              className="tm-splash-logo-img"
              decoding="async"
              fetchPriority="high"
            />
          </span>
          <h1 className="tm-splash-title">
            {"TrendsMart".split("").map((ch, i) => (
              <span
                key={i}
                className="tm-splash-title-letter"
                style={{ "--letter-i": i } as CSSProperties}
              >
                {ch}
              </span>
            ))}
          </h1>
        </div>

        <div className="tm-splash-copy">
          <p className="tm-splash-tagline">
            Your neighbourhood marketplace — discover local shops and order
            straight on WhatsApp, delivered fast.
          </p>
          <ul className="tm-splash-features">
            {FEATURES.map((f) => (
              <li key={f.title} className="tm-splash-feature">
                <span className="tm-splash-feature-icon" aria-hidden="true">
                  {f.glyph}
                </span>
                <span className="tm-splash-feature-text">
                  <strong>{f.title}</strong>
                  <span>{f.subtitle}</span>
                </span>
              </li>
            ))}
          </ul>

          {phase === "hold" && !dataReady && (
            <div className="tm-splash-loading" role="status" aria-live="polite">
              <span className="tm-splash-spinner" aria-hidden="true" />
              <span>Warming up your local shops…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
