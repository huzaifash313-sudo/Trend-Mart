"use client";

import { useEffect, useState } from "react";

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
 * “Add to Home Screen” tip. On Android Chrome, uses the captured install prompt.
 * On iOS (no beforeinstallprompt), shows Share → Add to Home Screen copy.
 */
export default function PwaInstallTip({ onDismiss }: { onDismiss?: () => void }) {
  const [visible, setVisible] = useState(false);
  const [hint, setHint] = useState("Add TrendsMart to your home screen for a faster app-like experience.");
  const [canPrompt, setCanPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem("tm_pwa_tip_dismissed") === "1") return;
    } catch {
      /* ignore */
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    if (standalone) return;

    const ua = window.navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/i.test(ua);
    if (isIOS) {
      setHint("iPhone: Share → Add to Home Screen for the full app feel.");
    } else if (isAndroid) {
      setHint("Tap Install to add TrendsMart to your home screen.");
    }

    const syncPrompt = () => {
      setCanPrompt(Boolean(window.__tmDeferredInstall));
    };
    syncPrompt();
    window.addEventListener("tm-pwa-install-available", syncPrompt);
    window.addEventListener("tm-pwa-installed", () => {
      setVisible(false);
      setCanPrompt(false);
    });
    setVisible(true);

    return () => {
      window.removeEventListener("tm-pwa-install-available", syncPrompt);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem("tm_pwa_tip_dismissed", "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
    onDismiss?.();
  };

  const handleInstall = async () => {
    const deferred = window.__tmDeferredInstall as BeforeInstallPromptEvent | null | undefined;
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      window.__tmDeferredInstall = null;
      setCanPrompt(false);
      dismiss();
    } catch {
      setInstalling(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50 p-3 dark:border-emerald-800/60 dark:from-emerald-950/40 dark:to-teal-950/30">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 3v12" strokeLinecap="round" />
            <path d="m8 11 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 19h16" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">Install TrendsMart</p>
          <p className="mt-0.5 text-[11px] leading-snug text-emerald-800/80 dark:text-emerald-300/80">
            {hint}
          </p>
          <div className="mt-2 flex items-center gap-3">
            {canPrompt ? (
              <button
                type="button"
                onClick={() => void handleInstall()}
                disabled={installing}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
              >
                {installing ? "Installing…" : "Install"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="text-[11px] font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
            >
              {canPrompt ? "Not now" : "Got it"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
