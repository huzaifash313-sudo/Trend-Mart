"use client";

import { useEffect } from "react";

/**
 * Safety net: if splash/boot cover or scroll-lock class is left behind
 * (crash, back-nav, tab restore), clear it so cards stay tappable.
 */
export default function InteractionUnlock() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const unlock = () => {
      const root = document.documentElement;
      root.classList.remove("tm-splash-lock", "tm-boot-splash");
      document.getElementById("tm-boot-splash")?.remove();
      const stuck = document.querySelector(".tm-splash");
      if (stuck && !stuck.isConnected) return;
      // Only remove a splash that is stuck without active phase animation
      // (AppSplash owns intentional overlays via React).
    };

    // Hard timeout — splash should never block the UI longer than this
    const failsafe = window.setTimeout(unlock, 12_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        // Don't kill a live splash in the first seconds of a cold open
        try {
          if (sessionStorage.getItem("tm_splash_seen_v5") === "1") unlock();
        } catch {
          unlock();
        }
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
