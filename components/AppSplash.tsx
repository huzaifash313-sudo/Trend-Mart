"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";
import { fetchShops } from "@/services/shopService";
import { fetchActiveStories } from "@/services/storyService";
import { fetchActiveDeals } from "@/services/dealService";

export const SPLASH_KEY = "tm_splash_seen_v5";

/**
 * Beat:
 * 1) Logo alone (readable beat)
 * 2) Logo rises + TrendMart slides in
 * 3) Tagline + phone previews
 * 4) Hold so customer can skim (~2s) while home data prefetches
 * 5) Fade to home (already warm in React Query cache)
 */
const STAGE_MS = {
  logoHold: 550,
  brand: 700,
  details: 650,
  holdMin: 1800,
  exit: 320,
  /** Never block home forever if network is slow */
  maxWaitForData: 2200,
};

type Phase = "off" | "logo" | "brand" | "details" | "hold" | "exit";

function shouldShowSplash(pathname: string): boolean {
  if (pathname !== "/") return false;
  try {
    return sessionStorage.getItem(SPLASH_KEY) !== "1";
  } catch {
    return true;
  }
}

function markSplashSeen() {
  try {
    sessionStorage.setItem(SPLASH_KEY, "1");
  } catch {
    /* ignore */
  }
}

function removeBootSplash() {
  document.documentElement.classList.remove("tm-boot-splash");
  document.getElementById("tm-boot-splash")?.remove();
}

async function unwrap<T>(
  promise: Promise<{ success: true; data: T } | { success: false; error: string }>,
): Promise<T> {
  const result = await promise;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

function PhonePreview({
  label,
  variant,
}: {
  label: string;
  variant: "home" | "shop" | "cart";
}) {
  return (
    <div className={`tm-splash-phone tm-splash-phone--${variant}`}>
      <div className="tm-splash-phone-notch" aria-hidden="true" />
      <div className="tm-splash-phone-bar" aria-hidden="true" />
      {variant === "home" ? (
        <>
          <div className="tm-splash-phone-pills" aria-hidden="true">
            <span /><span /><span />
          </div>
          <div className="tm-splash-phone-grid" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
        </>
      ) : null}
      {variant === "shop" ? (
        <>
          <div className="tm-splash-phone-hero" aria-hidden="true" />
          <div className="tm-splash-phone-rows" aria-hidden="true">
            <span /><span /><span />
          </div>
        </>
      ) : null}
      {variant === "cart" ? (
        <>
          <div className="tm-splash-phone-rows tm-splash-phone-rows--cart" aria-hidden="true">
            <span /><span />
          </div>
          <div className="tm-splash-phone-cta" aria-hidden="true" />
        </>
      ) : null}
      <p className="tm-splash-phone-label">{label}</p>
    </div>
  );
}

export default function AppSplash() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("off");

  useEffect(() => {
    if (!shouldShowSplash(pathname)) {
      removeBootSplash();
      document.documentElement.classList.remove("tm-splash-lock");
      setPhase("off");
      return;
    }

    markSplashSeen();
    document.documentElement.classList.add("tm-splash-lock");
    setPhase("logo");

    // Warm homepage cache while the customer watches the splash
    const prefetch = Promise.allSettled([
      queryClient.prefetchQuery({
        queryKey: queryKeys.shops,
        queryFn: () => unwrap(fetchShops({ publicOnly: true, limit: 60 })),
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

    // 1) Logo alone, then rise + title
    timers.push(window.setTimeout(() => setPhase("brand"), STAGE_MS.logoHold));
    let t = STAGE_MS.logoHold + STAGE_MS.brand;
    // 2) Previews / details
    timers.push(window.setTimeout(() => setPhase("details"), t));
    t += STAGE_MS.details;
    // 3) Hold for reading + finish prefetch if needed
    timers.push(
      window.setTimeout(() => {
        setPhase("hold");
        const holdStarted = Date.now();
        void (async () => {
          const remainingMin = STAGE_MS.holdMin;
          await Promise.race([
            prefetch,
            new Promise((r) => window.setTimeout(r, STAGE_MS.maxWaitForData)),
          ]);
          if (cancelled) return;
          const elapsed = Date.now() - holdStarted;
          const waitMore = Math.max(0, remainingMin - elapsed);
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
            Local shopping, instant WhatsApp orders — your neighborhood, delivered.
          </p>
          <div className="tm-splash-previews" aria-hidden="true">
            <PhonePreview label="Home" variant="home" />
            <PhonePreview label="Shop" variant="shop" />
            <PhonePreview label="Order" variant="cart" />
          </div>
        </div>
      </div>
    </div>
  );
}
