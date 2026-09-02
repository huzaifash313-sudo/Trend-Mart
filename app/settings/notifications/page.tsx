"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import ToggleSwitch from "@/components/ToggleSwitch";
import {
  getPushDeviceStatus,
  isIosSafari,
  isStandalonePwa,
  pushFailMessage,
  subscribeToPushNotifications,
  syncPushSubscriptionIfGranted,
  unsubscribeFromPushNotifications,
  type PushDeviceStatus,
} from "@/lib/pushClient";

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

interface NotificationToggle {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_TOGGLES: NotificationToggle[] = [
  {
    key: "order_updates",
    label: "Order Updates",
    description: "In-app alerts when order status changes",
    enabled: true,
  },
  {
    key: "merchant_alerts",
    label: "Merchant Alerts",
    description: "New orders and customer inquiries for your shops",
    enabled: true,
  },
  {
    key: "promotions",
    label: "Promotions & Offers",
    description: "Special deals (local preference only)",
    enabled: false,
  },
];

type PushUiStatus = "checking" | "unsupported" | "off" | "on" | "denied";

type PushServerStatus = {
  ready: boolean;
  vapidConfigured: boolean;
  adminConfigured: boolean;
  subjectSet: boolean;
};

function mapDeviceToUi(status: PushDeviceStatus): PushUiStatus {
  if (status.state === "checking") return "checking";
  if (status.state === "on") return "on";
  if (status.state === "denied") return "denied";
  if (status.state === "unsupported") return "unsupported";
  return "off";
}

export default function NotificationsPage() {
  const [toggles, setToggles] = useState<NotificationToggle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState<PushUiStatus>("checking");
  const [pushHint, setPushHint] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [serverStatus, setServerStatus] = useState<PushServerStatus | null>(null);
  const { addToast } = useToast();

  const refreshPushStatus = useCallback(async () => {
    const status = await getPushDeviceStatus();
    setPushStatus(mapDeviceToUi(status));
    if (status.state === "unsupported") {
      setPushHint(status.detail ?? pushFailMessage(status.reason));
    } else if (status.state === "on") {
      setPushHint("Synced — alerts work even when the app is closed (if OS allows).");
    } else if (status.state === "denied") {
      setPushHint("Blocked in browser settings. Allow notifications for this site, then refresh.");
    } else {
      setPushHint(null);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("trendsmart_notifications");
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        setToggles(
          DEFAULT_TOGGLES.map((t) => ({
            ...t,
            enabled: parsed[t.key] ?? t.enabled,
          })),
        );
      } else {
        setToggles(DEFAULT_TOGGLES);
      }
    } catch {
      setToggles(DEFAULT_TOGGLES);
    }
    setLoading(false);
    void refreshPushStatus();
    void fetch("/api/push/status")
      .then((r) => r.json())
      .then((data: PushServerStatus) => setServerStatus(data))
      .catch(() => setServerStatus(null));

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshPushStatus();
        void syncPushSubscriptionIfGranted();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [refreshPushStatus]);

  const toggleSwitch = useCallback((key: string) => {
    setToggles((prev) => {
      const updated = prev.map((t) =>
        t.key === key ? { ...t, enabled: !t.enabled } : t,
      );
      const prefs: Record<string, boolean> = {};
      updated.forEach((t) => {
        prefs[t.key] = t.enabled;
      });
      localStorage.setItem("trendsmart_notifications", JSON.stringify(prefs));
      return updated;
    });
  }, []);

  const handleEnablePush = useCallback(async () => {
    setPushBusy(true);
    const result = await subscribeToPushNotifications();
    setPushBusy(false);
    await refreshPushStatus();
    if (result.ok) {
      setPushStatus("on");
      addToast("Browser notifications enabled & synced.", "success");
      return;
    }
    if (result.reason === "denied") {
      setPushStatus("denied");
      addToast(pushFailMessage("denied"), "error");
      return;
    }
    addToast(pushFailMessage(result.reason, result.detail), "error");
  }, [addToast, refreshPushStatus]);

  const handleDisablePush = useCallback(async () => {
    setPushBusy(true);
    const result = await unsubscribeFromPushNotifications();
    setPushBusy(false);
    await refreshPushStatus();
    if (result.ok) {
      setPushStatus("off");
      addToast("Browser notifications disabled on this device.", "success");
      return;
    }
    addToast(result.detail ?? "Could not disable push.", "error");
  }, [addToast, refreshPushStatus]);

  const handleResync = useCallback(async () => {
    setPushBusy(true);
    const ok = await syncPushSubscriptionIfGranted();
    await refreshPushStatus();
    setPushBusy(false);
    addToast(
      ok ? "Push subscription re-synced with server." : "Nothing to sync — enable notifications first.",
      ok ? "success" : "error",
    );
  }, [addToast, refreshPushStatus]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const serverReady = serverStatus?.ready === true;
  const missingVapid = serverStatus && !serverStatus.vapidConfigured;
  const showIosTip = isIosSafari() && !isStandalonePwa();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-3">
          <Link
            href="/settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Back to settings"
          >
            <ChevronLeftIcon />
          </Link>
          <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Notifications</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-3 py-5">
        {serverStatus && !serverReady && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Push notifications unavailable
            </p>
            <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">
              Server push is not fully configured yet. In-app bell still works while the app is open.
            </p>
          </section>
        )}

        {showIosTip && (
          <section className="rounded-2xl border border-sky-200 bg-sky-50/90 p-4 dark:border-sky-900 dark:bg-sky-950/30">
            <p className="text-sm font-semibold text-sky-900 dark:text-sky-200">iPhone / iPad setup</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-sky-900/85 dark:text-sky-200/85">
              <li>Safari Share → <strong>Add to Home Screen</strong></li>
              <li>Open TrendsMart from the <strong>home screen icon</strong> (not the Safari tab)</li>
              <li>Come back here and tap <strong>Enable</strong></li>
            </ol>
            <p className="mt-2 text-[0.65rem] text-sky-800/70 dark:text-sky-300/70">
              Apple only allows closed-app alerts inside an installed PWA.
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            Browser push alerts
          </p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-800/80 dark:text-emerald-300/80">
            OS notifications when the app is closed or in the background. Sign-in required. Status
            syncs with this device&apos;s real subscription (not just a local flag).
          </p>
          {pushHint ? (
            <p className="mt-2 text-xs font-medium text-emerald-900/90 dark:text-emerald-100/90">{pushHint}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
              {pushStatus === "checking" && "Checking…"}
              {pushStatus === "on" && "Enabled · Synced"}
              {pushStatus === "off" && "Off"}
              {pushStatus === "denied" && "Blocked"}
              {pushStatus === "unsupported" && "Unavailable"}
            </span>
            {serverStatus && (
              <span
                className={`rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide ${
                  serverReady
                    ? "bg-emerald-600 text-white"
                    : "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
                }`}
              >
                Server {serverReady ? "ready" : "needs setup"}
              </span>
            )}
            {pushStatus === "on" ? (
              <>
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={handleResync}
                  className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-60 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-200"
                >
                  {pushBusy ? "…" : "Re-sync"}
                </button>
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={handleDisablePush}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  {pushBusy ? "Updating…" : "Disable on this device"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={
                  pushBusy ||
                  pushStatus === "checking" ||
                  pushStatus === "denied" ||
                  (pushStatus === "unsupported" && !showIosTip) ||
                  missingVapid === true
                }
                onClick={handleEnablePush}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pushBusy ? "Enabling…" : showIosTip ? "Enable (after Home Screen)" : "Enable browser notifications"}
              </button>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            In-app preferences
          </h2>
          <div className="trend-card divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800">
            {toggles.map((toggle) => (
              <div key={toggle.key} className="flex items-center justify-between px-4 py-3.5">
                <div className="mr-3 min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{toggle.label}</p>
                  <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">{toggle.description}</p>
                </div>
                <ToggleSwitch
                  checked={toggle.enabled}
                  onChange={() => toggleSwitch(toggle.key)}
                  label={`Toggle ${toggle.label}`}
                />
              </div>
            ))}
          </div>
        </section>

        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
          Preferences save on this device. Push enable/disable syncs with the server for closed-app alerts.
        </p>
      </main>
    </div>
  );
}
