"use client";

import { useEffect } from "react";

/**
 * Registers the TrendMart service worker (public/sw.js) on mount, enabling
 * "Add to Home Screen" installability and offline resilience. Renders
 * nothing — purely a side-effect component included once in the root layout.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Service workers require a secure context (HTTPS or localhost).
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Registration failure should never break the app */
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
