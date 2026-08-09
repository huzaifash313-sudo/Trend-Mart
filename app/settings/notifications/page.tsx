"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import ToggleSwitch from "@/components/ToggleSwitch";

function ChevronLeftIcon() {
  return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>);
}

function BellIcon() {
  return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>);
}

interface NotificationToggle {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_TOGGLES: NotificationToggle[] = [
  { key: "order_updates", label: "Order Updates", description: "Get notified when your order status changes", enabled: true },
  { key: "new_products", label: "New Products", description: "Be the first to know about new product listings", enabled: true },
  { key: "promotions", label: "Promotions & Offers", description: "Receive special deals and discount alerts", enabled: false },
  { key: "merchant_alerts", label: "Merchant Alerts", description: "Stock alerts and merchant dashboard notifications", enabled: true },
  { key: "newsletter", label: "Weekly Newsletter", description: "Weekly roundup of trending shops and products", enabled: false },
];

export default function NotificationsPage() {
  const [toggles, setToggles] = useState<NotificationToggle[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    // Load saved preferences from localStorage
    try {
      const saved = localStorage.getItem("trendmart_notifications");
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
  }, []);

  const toggleSwitch = useCallback((key: string) => {
    setToggles((prev) => {
      const updated = prev.map((t) =>
        t.key === key ? { ...t, enabled: !t.enabled } : t,
      );
      // Save to localStorage
      const prefs: Record<string, boolean> = {};
      updated.forEach((t) => { prefs[t.key] = t.enabled; });
      localStorage.setItem("trendmart_notifications", JSON.stringify(prefs));
      return updated;
    });
  }, []);

  const handleSave = useCallback(() => {
    addToast("Notification preferences saved!", "success");
  }, [addToast]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-3">
          <Link href="/settings" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="Back to settings"><ChevronLeftIcon /></Link>
          <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Notifications</h1>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-3 py-5 space-y-6">
        {/* Info banner */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-start gap-3">
            <span className="text-xl">🔔</span>
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Stay Updated</p>
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                Manage which notifications you receive. Changes are saved automatically to your device.
              </p>
            </div>
          </div>
        </div>

        {/* Notification Toggles */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Notification Channels</h2>
          <div className="trend-card divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {toggles.map((toggle) => (
              <div key={toggle.key} className="flex items-center justify-between px-4 py-3.5">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{toggle.label}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{toggle.description}</p>
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

        {/* Save Button */}
        <button
          type="button"
          onClick={handleSave}
          className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-[0.98]"
        >
          Save Preferences
        </button>

        {/* Footer note */}
        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
          Notification preferences are stored locally on your device.
        </p>
      </main>
    </div>
  );
}