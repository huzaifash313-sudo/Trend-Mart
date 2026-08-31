"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import ToggleSwitch from "@/components/ToggleSwitch";
import {
  getPushPermissionState,
  isPushClientSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
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

export default function NotificationsPage() {
  const [toggles, setToggles] = useState<NotificationToggle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState<PushUiStatus>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [serverStatus, setServerStatus] = useState<PushServerStatus | null>(null);
  const { addToast } = useToast();

  const refreshPushStatus = useCallback(async () => {
    if (!isPushClientSupported()) {
      setPushStatus("unsupported");
      return;
    }
    const permission = await getPushPermissionState();
    if (permission === "denied") {
      setPushStatus("denied");
      return;
    }
    if (permission === "granted") {
      setPushStatus(
        localStorage.getItem("trendsmart_push_subscribed") === "true" ? "on" : "off",
      );
      return;
    }
    setPushStatus("off");
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
    if (result.ok) {
      setPushStatus("on");
      addToast("Browser notifications enabled.", "success");
      return;
    }
    if (result.reason === "denied") {
      setPushStatus("denied");
      addToast("Notification permission blocked in browser settings.", "error");
      return;
    }
    if (result.reason === "unsupported") {
      setPushStatus("unsupported");
      addToast("Push notifications are not available.", "error");
      return;
    }
    addToast(
      "Could not enable push notifications. Please try again.",
      "error",
    );
  }, [addToast]);

  const handleDisablePush = useCallback(async () => {
    setPushBusy(true);
    const result = await unsubscribeFromPushNotifications();
    setPushBusy(false);
    if (result.ok) {
      setPushStatus("off");
      addToast("Browser notifications disabled on this device.", "success");
      return;
    }
    addToast("Could not disable push.", "error");
  }, [addToast]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const serverReady = serverStatus?.ready === true;
  const missingVapid = serverStatus && !serverStatus.vapidConfigured;

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
              Push notifications are not set up yet. Please contact support for help.
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            Browser push alerts
          </p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-800/80 dark:text-emerald-300/80">
            Free OS notifications when the app is in the background. Works on HTTPS or localhost
            after you enable below (sign-in required).
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
              {pushStatus === "checking" && "Checking…"}
              {pushStatus === "on" && "Enabled"}
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
              <button
                type="button"
                disabled={pushBusy}
                onClick={handleDisablePush}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {pushBusy ? "Updating…" : "Disable on this device"}
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  pushBusy ||
                  pushStatus === "unsupported" ||
                  pushStatus === "denied" ||
                  pushStatus === "checking" ||
                  missingVapid === true
                }
                onClick={handleEnablePush}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pushBusy ? "Enabling…" : "Enable browser notifications"}
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
          Preferences save automatically on this device.
        </p>
      </main>
    </div>
  );
}
