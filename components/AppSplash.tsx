"use client";

import { useEffect, useState } from "react";
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

type Phase = "off" | "logo" | "brand" | "details" | "hold" | "exit";

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

async function unwrap<T>(
  promise: Promise<{ success: true; data: T } | { success: false; error: string }>,
): Promise<T> {
  const result = await promise;
  if (!result.success) throw new Error(result.error);
  return result.data;
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

  useEffect(() => {
    if (!shouldShowSplash(pathname)) {
      // Returning visit / refresh / other route: no intro, no cover flash.
      document.documentElement.classList.remove("tm-splash-lock");
      setPhase("off");
      return;
    }

    markSplashSeen();
    document.documentElement.classList.remove("tm-first-paint");
    document.documentElement.classList.add("tm-splash-lock");
    setPhase("logo");

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

    const timers: number[] = [];
    let cancelled = false;

    timers.push(
      window.setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => removeBootSplash());
        });
      }, 0),
    );

    // 1) Logo alone, then rise + wordmark
    timers.push(window.setTimeout(() => setPhase("brand"), STAGE_MS.logoHold));
    let t = STAGE_MS.logoHold + STAGE_MS.brand;
    // 2) Introduction slides in
    timers.push(window.setTimeout(() => setPhase("details"), t));
    t += STAGE_MS.details;
    // 3) Hold for reading + finish prefetch if needed, then slow fade out
    timers.push(
      window.setTimeout(() => {
        setPhase("hold");
        const holdStarted = Date.now();
        void (async () => {
          await Promise.race([
            prefetch,
            new Promise((r) => window.setTimeout(r, STAGE_MS.maxWaitForData)),
          ]);
          if (cancelled) return;
          const elapsed = Date.now() - holdStarted;
          const waitMore = Math.max(0, STAGE_MS.holdMin - elapsed);
          await new Promise((r) => window.setTimeout(r, waitMore));
          if (cancelled) return;
          setPhase("exit");
          window.setTimeout(() => {
            if (cancelled) return;
            document.documentElement.classList.remove("tm-splash-lock");
            setPhase("off");
          }, STAGE_MS.exit);
        })();
      }, t),
    );

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      document.documentElement.classList.remove("tm-splash-lock");
    };
  }, [pathname, queryClient]);

  if (phase === "off") return null;

  return (
    <div
      className={`tm-splash tm-splash--${phase} tm-splash--seamless`}
      data-phase={phase}
      role="dialog"
      aria-label="Welcome to TrendMart"
      aria-live="polite"
    >
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
