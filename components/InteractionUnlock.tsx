"use client";

import { useEffect, useLayoutEffect } from "react";

/**
 * Safety net + first-paint cover:
 * - Clears brief tm-first-paint boot cover after CSS/fonts settle (no FOUC)
 * - Never detaches React-owned splash nodes (Safari removeChild crash)
 * - Failsafe if splash-lock is left behind after crash / tab restore
 */
export default function InteractionUnlock() {
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    if (!root.classList.contains("tm-first-paint")) return;

    let cleared = false;
    const clear = () => {
      if (cleared) return;
      cleared = true;
      root.classList.remove("tm-first-paint", "tm-boot-splash");
    };

    let cancelled = false;
    const run = async () => {
      try {
        if (document.fonts?.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise((r) => window.setTimeout(r, 280)),
          ]);
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(clear);
      });
    };

    void run();
    // Hard cap — never leave a teal wall up
    const failsafe = window.setTimeout(clear, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const unlock = () => {
      const root = document.documentElement;
      // Class-only unlock. Never Node.remove() React-owned splash nodes.
      root.classList.remove("tm-splash-lock", "tm-boot-splash", "tm-first-paint");
    };

    const failsafe = window.setTimeout(unlock, 12_000);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      try {
        if (sessionStorage.getItem("tm_splash_seen_v6") === "1") unlock();
      } catch {
        unlock();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(failsafe);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
