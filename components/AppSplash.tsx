"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export const SPLASH_KEY = "tm_splash_seen_v2";
const STAGE_MS = {
  logo: 700,
  brand: 1100,
  details: 1600,
  hold: 900,
  exit: 500,
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

/**
 * Brand landing: centered logo → rises with TrendMart → details → auto home.
 * Paired with #tm-boot-splash in layout so the homepage never flashes first.
 */
export default function AppSplash() {
  const pathname = usePathname();
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
    // Hand off from static boot cover to animated React splash
    window.requestAnimationFrame(() => removeBootSplash());

    const timers: number[] = [];
    let t = STAGE_MS.logo;
    timers.push(window.setTimeout(() => setPhase("brand"), t));
    t += STAGE_MS.brand;
    timers.push(window.setTimeout(() => setPhase("details"), t));
    t += STAGE_MS.details;
    timers.push(window.setTimeout(() => setPhase("hold"), t));
    t += STAGE_MS.hold;
    timers.push(window.setTimeout(() => setPhase("exit"), t));
    t += STAGE_MS.exit;
    timers.push(
      window.setTimeout(() => {
        document.documentElement.classList.remove("tm-splash-lock");
        setPhase("off");
      }, t),
    );

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      document.documentElement.classList.remove("tm-splash-lock");
    };
  }, [pathname]);

  if (phase === "off") return null;

  return (
    <div
      className={`tm-splash tm-splash--${phase}`}
      data-phase={phase}
      role="dialog"
      aria-label="Welcome to TrendMart"
      aria-live="polite"
    >
      <div className="tm-splash-glow" aria-hidden="true" />
      <div className="tm-splash-glow tm-splash-glow--2" aria-hidden="true" />

      <svg className="tm-splash-trend" viewBox="0 0 400 200" aria-hidden="true">
        <path
          className="tm-splash-trend-line"
          d="M20 160 C80 150 100 90 160 100 S240 40 300 55 S360 20 390 30"
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path d="M372 18 L392 32 L370 40 Z" fill="rgba(255,255,255,0.35)" />
      </svg>

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

          <ul className="tm-splash-details">
            <li>
              <span className="tm-splash-dot" aria-hidden="true" />
              Discover nearby shops &amp; live deals
            </li>
            <li>
              <span className="tm-splash-dot" aria-hidden="true" />
              Cart stays on your phone until checkout
            </li>
            <li>
              <span className="tm-splash-dot" aria-hidden="true" />
              Order straight to the merchant on WhatsApp
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
