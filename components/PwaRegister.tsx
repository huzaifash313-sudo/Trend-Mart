"use client";

import { useEffect } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __tmDeferredInstall?: BeforeInstallPromptEvent | null;
  }
}

/**
 * Registers the TrendMart service worker (public/sw.js) on mount, enabling
 * "Add to Home Screen" installability and offline resilience. Also captures
 * Android Chrome's beforeinstallprompt so the Install button can fire it.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      window.__tmDeferredInstall = promptEvent;
      window.dispatchEvent(new Event("tm-pwa-install-available"));
    };
    const onInstalled = () => {
      window.__tmDeferredInstall = null;
      window.dispatchEvent(new Event("tm-pwa-installed"));
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Registration failure should never break the app */
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
