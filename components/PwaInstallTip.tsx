"use client";

import { useEffect, useState } from "react";

/**
 * Lightweight “Add to Home Screen” tip for mobile Safari / Chrome.
 * Does not rely on beforeinstallprompt (unsupported on iOS) — just clear how-to copy.
 */
export default function PwaInstallTip({ onDismiss }: { onDismiss?: () => void }) {
  const [visible, setVisible] = useState(false);
  const [hint, setHint] = useState("Add TrendMart to your home screen for a faster app-like experience.");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem("tm_pwa_tip_dismissed") === "1") return;
    } catch {
      /* ignore */
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      ("standalone" in window.navigator &&
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    if (standalone) return;

    const ua = window.navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/i.test(ua);
    if (isIOS) {
      setHint("iPhone: Share → Add to Home Screen for the full app feel.");
    } else if (isAndroid) {
      setHint("Android: Browser menu → Install app / Add to Home screen.");
    }
    setVisible(true);
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
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">Install TrendMart</p>
          <p className="mt-0.5 text-[11px] leading-snug text-emerald-800/80 dark:text-emerald-300/80">
            {hint}
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 text-[11px] font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
