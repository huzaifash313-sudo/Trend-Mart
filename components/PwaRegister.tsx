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

/** Bump together with public/sw.js so the one-time reload guard stays unique. */
const SW_RELOAD_KEY = "tm_sw_reload_v54";

/**
 * Install prompt capture + safe SW update.
 * - Registers /sw.js and asks a freshly installed version to activate
 *   (skipWaiting), then performs ONE reload per session so the page runs on
 *   the new cache generation (avoids serving HTML that references chunks the
 *   new version deleted). Guarded against reload loops.
 * - Keeps current image/shell/page caches; only deletes obsolete Cache Storage
 *   keys.
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

    const KEEP_PREFIXES = ["tm-images-", "tm-shell-", "tm-pages-"];
    let onControllerChange: (() => void) | null = null;

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
        const reg = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none",
        });

        const activateWaiting = () => {
          const waiting = reg.waiting;
          if (waiting) {
            waiting.postMessage({ type: "tm-skip-waiting" });
          }
        };
        reg.addEventListener("updatefound", activateWaiting);
        if (reg.waiting) activateWaiting();

        // New SW took control → reload once so this tab uses the new caches.
        onControllerChange = () => {
          try {
            if (sessionStorage.getItem(SW_RELOAD_KEY)) return;
            sessionStorage.setItem(SW_RELOAD_KEY, "1");
          } catch {
            /* ignore */
          }
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          onControllerChange,
        );

        await reg.update().catch(() => {});
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
      if (onControllerChange) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          onControllerChange,
        );
      }
    };
  }, []);

  return null;
}
