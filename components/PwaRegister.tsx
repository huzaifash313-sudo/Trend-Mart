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
 * Install prompt capture + safe SW update.
 * Keeps current image/shell caches; only deletes obsolete Cache Storage keys.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      return;
    }

    const onBeforeInstall = (event: Event) => {
      // Do not preventDefault — Chrome's native install banner is the prompt.
      window.__tmDeferredInstall = event as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event("tm-pwa-install-available"));
    };
    const onInstalled = () => {
      window.__tmDeferredInstall = null;
      window.dispatchEvent(new Event("tm-pwa-installed"));
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    const KEEP_PREFIXES = ["tm-images-", "tm-shell-"];

    const setup = async () => {
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => !KEEP_PREFIXES.some((p) => k.startsWith(p)))
              .map((k) => caches.delete(k)),
          );
        }
        await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
      } catch {
        /* never block the app */
      }
    };

    if (document.readyState === "complete") {
      void setup();
    } else {
      window.addEventListener("load", () => void setup(), { once: true });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return null;
}
