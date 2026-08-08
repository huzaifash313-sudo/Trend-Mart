"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchMyShop, updateShop } from "@/services/shopService";
import { useToast } from "@/components/Toast";
import ToggleSwitch from "@/components/ToggleSwitch";
import type { Shop, ShopFormData } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Layout Options ─────────────────────────────────────────────────────────

const LAYOUT_OPTIONS = [
  {
    id: "grid",
    label: "Grid View",
    description: "Standard product grid (3 columns)",
    icon: "▦",
    columns: "3",
  },
  {
    id: "compact",
    label: "Compact Grid",
    description: "Tight spacing, more products visible (4 columns)",
    icon: "⊞",
    columns: "4",
  },
  {
    id: "large_cards",
    label: "Large Cards",
    description: "Prominent product cards (2 columns)",
    icon: "▣",
    columns: "2",
  },
  {
    id: "list",
    label: "List View",
    description: "Horizontal list with details beside image",
    icon: "≡",
    columns: "1",
  },
  {
    id: "gallery",
    label: "Gallery",
    description: "Image-focused masonry-style gallery",
    icon: "⊟",
    columns: "3",
  },
] as const;

const CARD_STYLES = [
  { id: "default", label: "Default", description: "Clean card with shadow & border" },
  { id: "minimal", label: "Minimal", description: "Borderless, flat design" },
  { id: "detailed", label: "Detailed", description: "Shows description preview" },
  { id: "service", label: "Service", description: "Optimized for service providers" },
] as const;

const ACCENT_COLORS = [
  { hex: "#10b981", label: "Emerald", class: "bg-emerald-500" },
  { hex: "#3b82f6", label: "Blue", class: "bg-blue-500" },
  { hex: "#f59e0b", label: "Amber", class: "bg-amber-500" },
  { hex: "#8b5cf6", label: "Violet", class: "bg-violet-500" },
  { hex: "#ec4899", label: "Pink", class: "bg-pink-500" },
  { hex: "#ef4444", label: "Red", class: "bg-red-500" },
  { hex: "#06b6d4", label: "Cyan", class: "bg-cyan-500" },
  { hex: "#f97316", label: "Orange", class: "bg-orange-500" },
  { hex: "#84cc16", label: "Lime", class: "bg-lime-500" },
  { hex: "#6366f1", label: "Indigo", class: "bg-indigo-500" },
  { hex: "#14b8a6", label: "Teal", class: "bg-teal-500" },
  { hex: "#78716c", label: "Warm Gray", class: "bg-stone-500" },
];

interface ThemeSettings {
  layoutStyle: string;
  accentColorOverride: string;
  fontScale: number;
  darkModeDefault: boolean;
  showAnnouncementBanner: boolean;
  showWhatsappButton: boolean;
  productCardStyle: string;
}

const DEFAULT_SETTINGS: ThemeSettings = {
  layoutStyle: "grid",
  accentColorOverride: "",
  fontScale: 1.0,
  darkModeDefault: false,
  showAnnouncementBanner: true,
  showWhatsappButton: true,
  productCardStyle: "default",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function AppearanceSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  // Load current shop
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) { setLoading(false); return; }

        const result = await fetchMyShop();
        if (cancelled) return;
        if (result.success && result.data) {
          const myShop = result.data;
          setShop(myShop);
          // Load theme prefs from localStorage or shop metadata
          const saved = localStorage.getItem(`trendmart_theme_${myShop.id}`);
          if (saved) {
            try {
              const parsed = JSON.parse(saved) as Partial<ThemeSettings>;
              setSettings((prev) => ({ ...prev, ...parsed }));
            } catch { /* ignore */ }
          }
          // Use existing accent color if set
          if (myShop.accent_color) {
            setSettings((prev) => ({ ...prev, accentColorOverride: myShop.accent_color! }));
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleSave = useCallback(async () => {
    if (!shop) return;
    setSaving(true);

    try {
      // Save accent color to shop record
      if (settings.accentColorOverride) {
        const shopFormFields: ShopFormData = {
          name: shop.name,
          category: shop.category,
          location: shop.location,
          whatsapp_number: shop.whatsapp_number,
          logo_url: shop.logo_url ?? "",
          banner_url: shop.banner_url ?? "",
          is_live: shop.is_live,
          instagram_handle: shop.instagram_handle ?? "",
          facebook_url: shop.facebook_url ?? "",
          secondary_phone: shop.secondary_phone ?? "",
          business_hours: shop.business_hours ?? "",
          operating_status: shop.operating_status ?? "",
          accent_color: settings.accentColorOverride,
          store_bio: shop.store_bio ?? "",
          announcement: shop.announcement ?? "",
          service_area: shop.service_area ?? "",
          hourly_rate: shop.hourly_rate != null ? String(shop.hourly_rate) : "",
          call_out_charge: shop.call_out_charge != null ? String(shop.call_out_charge) : "",
          emergency_available: shop.emergency_available ?? false,
          shop_type: shop.shop_type ?? "retail",
          latitude: shop.latitude ?? null,
          longitude: shop.longitude ?? null,
          service_radius_km: shop.service_radius_km ?? 10,
          address_display: shop.address_display ?? "",
          min_order_amount: shop.min_order_amount != null ? String(shop.min_order_amount) : "",
          free_delivery_threshold: shop.free_delivery_threshold != null ? String(shop.free_delivery_threshold) : "",
          delivery_fee_flat: shop.delivery_fee_flat != null ? String(shop.delivery_fee_flat) : "",
          delivery_fee_per_km: shop.delivery_fee_per_km != null ? String(shop.delivery_fee_per_km) : "",
        };
        await updateShop(shop.id, shopFormFields);
        setShop((prev) => prev ? { ...prev, accent_color: settings.accentColorOverride } : prev);
      }

      // Save full theme settings to localStorage (client-side preference store)
      localStorage.setItem(`trendmart_theme_${shop.id}`, JSON.stringify(settings));
      addToast("Theme settings saved! 🎨", "success");
    } catch {
      addToast("Failed to save theme settings.", "error");
    }
    setSaving(false);
  }, [shop, settings, addToast]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    if (shop) {
      setSettings((prev) => ({
        ...DEFAULT_SETTINGS,
        accentColorOverride: shop.accent_color ?? "",
      }));
    }
  }, [shop]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-3">
          <Link href="/settings" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="Go back">
            <ChevronLeftIcon />
          </Link>
          <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Appearance & Theme</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-3 py-5">
        {!shop ? (
          <div className="py-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No shop found. Create a shop first.</p>
            <Link href="/dashboard" className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:underline">Go to Dashboard</Link>
          </div>
        ) : (
          <>
            {/* Layout Style */}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Product Layout Style</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LAYOUT_OPTIONS.map((layout) => (
                  <button
                    key={layout.id}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, layoutStyle: layout.id }))}
                    className={`flex flex-col items-center rounded-xl border-2 p-3 text-center transition-all ${
                      settings.layoutStyle === layout.id
                        ? "border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-900/20"
                        : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
                    }`}
                  >
                    <span className="mb-1 text-2xl">{layout.icon}</span>
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{layout.label}</span>
                    <span className="text-[0.6rem] text-zinc-400 dark:text-zinc-500">{layout.description}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Card Style */}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Product Card Style</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CARD_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, productCardStyle: style.id }))}
                    className={`rounded-xl border-2 p-3 text-center transition-all ${
                      settings.productCardStyle === style.id
                        ? "border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-900/20"
                        : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
                    }`}
                  >
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{style.label}</p>
                    <p className="text-[0.6rem] text-zinc-400 dark:text-zinc-500">{style.description}</p>
                  </button>
                ))}
              </div>
            </section>

            {/* Accent Color Picker */}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Accent Color</h2>
              <div className="flex flex-wrap gap-2">
                {ACCENT_COLORS.map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, accentColorOverride: color.hex }))}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:scale-110 ${
                      settings.accentColorOverride === color.hex ? "ring-2 ring-offset-2 ring-zinc-900 dark:ring-offset-zinc-900 dark:ring-zinc-100" : ""
                    }`}
                    style={{ backgroundColor: color.hex }}
                    aria-label={`Select ${color.label} accent color`}
                  >
                    {settings.accentColorOverride === color.hex && (
                      <span className="text-white drop-shadow"><CheckIcon /></span>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, accentColorOverride: "" }))}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 border-dashed text-xs font-semibold transition-all hover:scale-110 ${
                    !settings.accentColorOverride ? "border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-900/20" : "border-zinc-300 text-zinc-400 dark:border-zinc-600"
                  }`}
                  aria-label="Use default accent color"
                >
                  Auto
                </button>
              </div>
              {settings.accentColorOverride && (
                <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">Selected: <span className="font-mono font-semibold">{settings.accentColorOverride}</span></p>
              )}
            </section>

            {/* Font Scale */}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Font Scale</h2>
              <div className="trend-card flex items-center gap-4 p-4">
                <span className="text-xs text-zinc-500">A<span className="text-sm">A</span><span className="text-base font-bold">A</span></span>
                <input
                  type="range"
                  min="0.8"
                  max="1.5"
                  step="0.1"
                  value={settings.fontScale}
                  onChange={(e) => setSettings((s) => ({ ...s, fontScale: parseFloat(e.target.value) }))}
                  className="flex-1 accent-emerald-600"
                />
                <span className="text-xs font-mono text-zinc-500 w-8 text-right">{settings.fontScale.toFixed(1)}x</span>
              </div>
            </section>

            {/* Toggle Options */}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Display Options</h2>
              <div className="trend-card divide-y divide-zinc-100 dark:divide-zinc-800">
                {[
                  { key: "darkModeDefault" as const, label: "Dark Mode Default", description: "Use dark theme by default for visitors" },
                  { key: "showAnnouncementBanner" as const, label: "Show Announcement Banner", description: "Display promotional marquee banner on your storefront" },
                  { key: "showWhatsappButton" as const, label: "Show WhatsApp Float Button", description: "Show floating WhatsApp button on your storefront" },
                ].map((opt) => (
                  <div key={opt.key} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{opt.label}</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">{opt.description}</p>
                    </div>
                    <ToggleSwitch
                      checked={settings[opt.key]}
                      onChange={() => setSettings((s) => ({ ...s, [opt.key]: !s[opt.key] }))}
                      label={opt.label}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Theme Settings"}
              </button>
              <button
                type="button"
                onClick={resetSettings}
                className="rounded-xl bg-zinc-100 px-5 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                Reset
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}