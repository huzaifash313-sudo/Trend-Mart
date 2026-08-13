"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SPLASH_KEY = "tm_splash_seen_v1";
const SPLASH_MS = 3200;

/**
 * Full-screen brand landing shown once per session on home (and every cold
 * open in installed PWA). Fades into the storefront — no route change needed.
 */
export default function AppSplash() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"pending" | "show" | "exit" | "done">("pending");

  useEffect(() => {
    if (pathname !== "/") {
      setPhase("done");
      return;
    }
    if (typeof window === "undefined") return;

    let show = false;
    try {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in window.navigator &&
          (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
      const seen = sessionStorage.getItem(SPLASH_KEY) === "1";
      // Installed app: splash every cold start of the session. Browser: once/session.
      show = standalone ? !seen : !seen;
    } catch {
      show = true;
    }

    if (!show) {
      setPhase("done");
      return;
    }

    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      /* ignore */
    }

    setPhase("show");
    document.documentElement.classList.add("tm-splash-lock");

    const exitTimer = window.setTimeout(() => setPhase("exit"), SPLASH_MS);
    const doneTimer = window.setTimeout(() => {
      document.documentElement.classList.remove("tm-splash-lock");
      setPhase("done");
    }, SPLASH_MS + 550);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
      document.documentElement.classList.remove("tm-splash-lock");
    };
  }, [pathname]);

  const dismiss = () => {
    setPhase("exit");
    window.setTimeout(() => {
      document.documentElement.classList.remove("tm-splash-lock");
      setPhase("done");
    }, 480);
  };

  if (phase === "pending" || phase === "done") return null;

  return (
    <div
      className={`tm-splash ${phase === "exit" ? "tm-splash--exit" : ""}`}
      role="dialog"
      aria-label="Welcome to TrendMart"
      onClick={dismiss}
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
        <path
          d="M372 18 L392 32 L370 40 Z"
          fill="rgba(255,255,255,0.35)"
        />
      </svg>

      <div className="tm-splash-inner">
        <div className="tm-splash-brand">
          <span className="tm-splash-logo" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/trendmart-mark.png?v=7"
              alt=""
              width={72}
              height={72}
              className="tm-splash-logo-img"
              decoding="async"
            />
          </span>
          <h1 className="tm-splash-title">TrendMart</h1>
        </div>

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

        <button type="button" className="tm-splash-cta" onClick={dismiss}>
          Enter storefront
        </button>

        <p className="tm-splash-hint">Tap anywhere to continue</p>
      </div>
    </div>
  );
}
