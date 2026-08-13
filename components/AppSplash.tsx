"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export const SPLASH_KEY = "tm_splash_seen_v3";
const STAGE_MS = {
  logo: 650,
  brand: 950,
  details: 1700,
  hold: 700,
  exit: 450,
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

/**
 * Brand landing: boot logo continues upward (no restart / white flash),
 * then lightweight app previews, then auto home.
 */
export default function AppSplash() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("off");
  const [seamless, setSeamless] = useState(false);

  useEffect(() => {
    if (!shouldShowSplash(pathname)) {
      removeBootSplash();
      document.documentElement.classList.remove("tm-splash-lock");
      setPhase("off");
      return;
    }

    const fromBoot = document.documentElement.classList.contains("tm-boot-splash");
    setSeamless(fromBoot);
    markSplashSeen();
    document.documentElement.classList.add("tm-splash-lock");
    setPhase("logo");

    // Keep boot cover until React splash has painted the same centered logo.
    let removeId = 0;
    if (fromBoot) {
      removeId = window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => removeBootSplash());
        });
      }, 80);
    } else {
      removeBootSplash();
    }

    const timers: number[] = [removeId];
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
      className={`tm-splash tm-splash--${phase}${seamless ? " tm-splash--seamless" : ""}`}
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
