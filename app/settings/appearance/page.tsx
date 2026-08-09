"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchMyShop } from "@/services/shopService";
import {
  fetchStorefrontDisplayPrefs,
  saveStorefrontDisplayPrefs,
  type StorefrontDisplayPrefs,
} from "@/services/themePrefsService";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/components/Toast";
import ToggleSwitch from "@/components/ToggleSwitch";
import type { Shop } from "@/types";

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function AppearanceSettingsPage() {
  const {
    mode,
    resolved,
    fontScale,
    setMode,
    setFontScale,
  } = useTheme();
  const { addToast } = useToast();

  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStorefront, setSavingStorefront] = useState(false);
  const [storefront, setStorefront] = useState<StorefrontDisplayPrefs>({
    showAnnouncementBanner: true,
    showWhatsappFloatingButton: true,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await fetchMyShop();
        if (cancelled) return;
        if (result.success && result.data) {
          setShop(result.data);
          const prefs = await fetchStorefrontDisplayPrefs(result.data.id);
          if (!cancelled) setStorefront(prefs);
        }
      } catch {
        /* guest / no shop */
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFontChange = useCallback(
    (value: number) => {
      setFontScale(value);
    },
    [setFontScale],
  );

  const handleSaveStorefront = useCallback(async () => {
    if (!shop) return;
    setSavingStorefront(true);
    const result = await saveStorefrontDisplayPrefs(shop.id, storefront);
    if (result.success) {
      addToast("Storefront display settings saved.", "success");
    } else {
      addToast(result.error || "Could not save storefront settings.", "error");
    }
    setSavingStorefront(false);
  }, [shop, storefront, addToast]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-emerald-900/40 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-3">
          <Link
            href="/settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-emerald-400 dark:hover:bg-emerald-950"
            aria-label="Go back"
          >
            <ChevronLeftIcon />
          </Link>
          <h1 className="text-sm font-bold text-zinc-900 dark:text-emerald-400">
            Appearance
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-3 py-5">
        {/* Theme */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-emerald-500/80">
            Theme
          </h2>
          <div className="trend-card grid grid-cols-2 gap-2 p-3 dark:border-emerald-900/50 dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => setMode("light")}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all ${
                resolved === "light"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-zinc-800"
              }`}
            >
              <SunIcon /> Light
            </button>
            <button
              type="button"
              onClick={() => setMode("dark")}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all ${
                resolved === "dark"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-zinc-800"
              }`}
            >
              <MoonIcon /> Dark
            </button>
          </div>
          <p className="mt-2 text-[0.65rem] text-zinc-400 dark:text-emerald-600/80">
            Dark mode uses a black background with emerald accents — theme color stays constant.
          </p>
        </section>

        {/* Font scale — live via ThemeContext */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-emerald-500/80">
            Font size
          </h2>
          <div className="trend-card space-y-3 p-4 dark:border-emerald-900/50 dark:bg-zinc-950">
            <div className="flex items-center gap-4">
              <span className="text-xs text-zinc-500 dark:text-emerald-600">A</span>
              <input
                type="range"
                min={14}
                max={20}
                step={1}
                value={fontScale}
                onChange={(e) => handleFontChange(Number(e.target.value))}
                className="flex-1 accent-emerald-600"
                aria-label="Font size"
              />
              <span className="text-base font-bold text-zinc-800 dark:text-emerald-400">A</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 dark:text-emerald-700">Smaller</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {fontScale}px
              </span>
              <span className="text-zinc-400 dark:text-emerald-700">Larger</span>
            </div>
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:bg-black dark:text-emerald-300">
              Preview: Text size updates across TrendMart as you drag.
            </p>
          </div>
        </section>

        {/* Merchant storefront toggles */}
        {shop ? (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-emerald-500/80">
              Storefront display
            </h2>
            <div className="trend-card divide-y divide-zinc-100 dark:divide-emerald-900/40 dark:border-emerald-900/50 dark:bg-zinc-950">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-emerald-300">
                    Announcement banner
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-emerald-700">
                    Show your promotional marquee when announcement text is set
                  </p>
                </div>
                <ToggleSwitch
                  checked={storefront.showAnnouncementBanner}
                  onChange={() =>
                    setStorefront((s) => ({
                      ...s,
                      showAnnouncementBanner: !s.showAnnouncementBanner,
                    }))
                  }
                  label="Announcement banner"
                />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-emerald-300">
                    WhatsApp float button
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-emerald-700">
                    Floating chat button on your shop page
                  </p>
                </div>
                <ToggleSwitch
                  checked={storefront.showWhatsappFloatingButton}
                  onChange={() =>
                    setStorefront((s) => ({
                      ...s,
                      showWhatsappFloatingButton: !s.showWhatsappFloatingButton,
                    }))
                  }
                  label="WhatsApp float button"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveStorefront}
              disabled={savingStorefront}
              className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 disabled:opacity-50"
            >
              {savingStorefront ? "Saving…" : "Save storefront options"}
            </button>
            {!shop.announcement?.trim() && storefront.showAnnouncementBanner ? (
              <p className="mt-2 text-[0.65rem] text-amber-600 dark:text-amber-400">
                Banner is on, but no announcement text yet — add one in Merchant Dashboard.
              </p>
            ) : null}
          </section>
        ) : (
          <section className="trend-card p-4 dark:border-emerald-900/50 dark:bg-zinc-950">
            <p className="text-sm text-zinc-600 dark:text-emerald-400/90">
              Theme and font apply to your whole app. Storefront banner / WhatsApp options appear after you create a store.
            </p>
            <Link
              href="/account/become-merchant"
              className="mt-2 inline-block text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Become a merchant
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
