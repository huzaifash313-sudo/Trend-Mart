"use client";

/**
 * Soft in-app banners for notifications + location.
 * Never auto-calls the browser permission APIs (that causes blocked/error UX).
 * Tapping Enable triggers the real OS prompt on a user gesture.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getPushDeviceStatus,
  isIosSafari,
  isStandalonePwa,
  pushFailMessage,
  subscribeToPushNotifications,
} from "@/lib/pushClient";
import { useLocation } from "@/context/LocationContext";
import { useToast } from "@/components/Toast";

const DISMISS_PUSH = "tm_nudge_push_dismiss_v1";
const DISMISS_LOC = "tm_nudge_loc_dismiss_v1";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function wasDismissed(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function markDismissed(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export default function PermissionNudge() {
  const { location, detectLocationDetailed } = useLocation();
  const { addToast } = useToast();
  const [signedIn, setSignedIn] = useState(false);
  const [showPush, setShowPush] = useState(false);
  const [showLoc, setShowLoc] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const refresh = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      const ok = Boolean(session?.user);
      setSignedIn(ok);

      if (!ok) {
        setShowPush(false);
        return;
      }

      if (wasDismissed(DISMISS_PUSH)) {
        setShowPush(false);
      } else {
        const status = await getPushDeviceStatus();
        if (cancelled) return;
        // Offer Enable when browser can prompt (default) or we just need subscribe.
        setShowPush(status.state === "off");
      }
    };

    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (wasDismissed(DISMISS_LOC)) {
      setShowLoc(false);
      return;
    }
    // Soft tip when we have no pin yet — GPS Allow happens only on tap.
    setShowLoc(!location?.coordinates);
  }, [location?.coordinates]);

  const enablePush = useCallback(async () => {
    setPushBusy(true);
    try {
      const result = await subscribeToPushNotifications({
        confirmOs: true,
        forceSync: true,
      });
      if (result.ok) {
        setShowPush(false);
        addToast("Notifications enabled — app band ho to bhi alerts aayenge.", "success");
      } else {
        addToast(pushFailMessage(result.reason, result.detail), "error");
        if (result.reason === "denied" || result.reason === "ios_needs_pwa") {
          markDismissed(DISMISS_PUSH);
          setShowPush(false);
        }
      }
    } finally {
      setPushBusy(false);
    }
  }, [addToast]);

  const enableLoc = useCallback(async () => {
    setLocBusy(true);
    try {
      const result = await detectLocationDetailed();
      if (result.location?.coordinates) {
        setShowLoc(false);
        addToast("Location saved — nearby shops ab is pin se filter hongi.", "success");
      } else if (result.error === "denied") {
        addToast(
          "Location blocked. Browser settings mein Allow karein, ya map se pin lagayein.",
          "error",
        );
        markDismissed(DISMISS_LOC);
        setShowLoc(false);
      } else {
        addToast("Location nahi mili. Settings → Location se map pin try karein.", "error");
      }
    } finally {
      setLocBusy(false);
    }
  }, [addToast, detectLocationDetailed]);

  const iosTip = isIosSafari() && !isStandalonePwa();

  if (!showPush && !showLoc) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-sm sm:p-0"
      role="region"
      aria-label="Permission tips"
    >
      {showPush && signedIn && (
        <div className="pointer-events-auto rounded-2xl border border-zinc-200/80 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Order alerts enable karein
          </p>
          <p className="mt-0.5 text-[0.7rem] leading-snug text-zinc-600 dark:text-zinc-400">
            {iosTip
              ? "iPhone par pehle Home Screen par Add karein, phir icon se khol kar Enable dabayein."
              : "App band ho to bhi naye orders aur status updates milenge. Is device par Allow zaroori hai."}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={pushBusy || iosTip}
              onClick={() => void enablePush()}
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-[0.7rem] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pushBusy ? "Enabling…" : "Enable notifications"}
            </button>
            <button
              type="button"
              onClick={() => {
                markDismissed(DISMISS_PUSH);
                setShowPush(false);
              }}
              className="rounded-full px-2 py-1.5 text-[0.7rem] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {showLoc && (
        <div className="pointer-events-auto rounded-2xl border border-zinc-200/80 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Apni location allow karein
          </p>
          <p className="mt-0.5 text-[0.7rem] leading-snug text-zinc-600 dark:text-zinc-400">
            Nearby shops aur exact delivery pin ke liye. Deny hone par Settings → Location se map pin laga sakte ho.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={locBusy}
              onClick={() => void enableLoc()}
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-[0.7rem] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {locBusy ? "Detecting…" : "Allow location"}
            </button>
            <button
              type="button"
              onClick={() => {
                markDismissed(DISMISS_LOC);
                setShowLoc(false);
              }}
              className="rounded-full px-2 py-1.5 text-[0.7rem] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
