"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";
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
 *   1) Logo alone
 *   2) Logo rises + "TrendMart" wordmark slides in
 *   3) A short value introduction (what TrendMart is), not page mockups
 *   4) Hold so it's readable while home data prefetches in the background
 *   5) Slow fade into the (already-warm) homepage
 *
 * `SPLASH_KEY` is written only when the intro finishes or the user skips —
 * never at start — so Strict Mode remounts and mid-animation tab switches
 * cannot strand the teal boot cover or abort a first-run play.
 */
const STAGE_MS = {
  logoHold: 800,
  brand: 800,
  details: 900,
  holdMin: 2400,
  exit: 650,
  /** Never block home forever if network is slow. */
  maxWaitForData: 2400,
};

const REDUCED_MS = {
  logoHold: 120,
  brand: 120,
  details: 120,
  holdMin: 280,
  exit: 180,
  maxWaitForData: 280,
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
  document.documentElement.classList.remove(
    "tm-splash-lock",
    "tm-boot-splash",
    "tm-first-paint",
  );
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
  return STAGE_MS;
}

/* Short, human value intro — no page mockups, just "what TrendMart is". */
const FEATURES = [
  { icon: "🛍️", title: "Local shops nearby", subtitle: "Discover trusted stores in your area" },
  { icon: "💬", title: "Order on WhatsApp", subtitle: "Direct chat with the shop — no confusion" },
  { icon: "🚚", title: "Fast delivery", subtitle: "Your neighbourhood, delivered to your door" },
] as const;

export default function AppSplash() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("off");
  const timersRef = useRef<number[]>([]);
  const unmountedRef = useRef(false);
  const exitingRef = useRef(false);
  const finishedRef = useRef(false);

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
    clearSplashChrome();
    setPhase("off");
  };

  const beginExit = (exitMs: number) => {
    if (isStopped() || exitingRef.current) return;
    exitingRef.current = true;
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
      setPhase("off");
      return;
    }

    document.documentElement.classList.remove("tm-first-paint");
    document.documentElement.classList.add("tm-splash-lock");
    setPhase("logo");

    const ms = stageTiming();

    // Warm the homepage cache while the customer watches the intro.
    const prefetch = Promise.allSettled([
      queryClient.prefetchQuery({
        queryKey: queryKeys.shops,
        queryFn: () => unwrap(fetchShops({ publicOnly: true, limit: 300 })),
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
    ]);

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
        await Promise.race([
          prefetch,
          new Promise<void>((resolve) => {
            trackTimeout(resolve, ms.maxWaitForData);
          }),
        ]);
        if (isStopped() || exitingRef.current) return;
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

  const onSkip = () => {
    if (phase === "off" || phase === "exit" || isStopped() || exitingRef.current) return;
    clearTimers();
    beginExit(stageTiming().exit);
  };

  if (phase === "off") return null;

  return (
    <div
      className={`tm-splash tm-splash--${phase} tm-splash--seamless`}
      data-phase={phase}
      role="dialog"
      aria-label="Welcome to TrendMart"
      aria-live="polite"
    >
      <button type="button" className="tm-splash-skip" onClick={onSkip}>
        Skip
      </button>

      <div className="tm-splash-glow" aria-hidden="true" />
      <div className="tm-splash-glow tm-splash-glow--2" aria-hidden="true" />

      <div className="tm-splash-stage">
        <div className="tm-splash-brand">
          <span className="tm-splash-logo" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/trendmart-mark.png?v=8"
              alt=""
              width={88}
              height={88}
              className="tm-splash-logo-img"
              decoding="async"
              fetchPriority="high"
            />
          </span>
          <h1 className="tm-splash-title">TrendMart</h1>
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
                  {f.icon}
                </span>
                <span className="tm-splash-feature-text">
                  <strong>{f.title}</strong>
                  <span>{f.subtitle}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
