"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BRAND_THEME_IDS,
  BRAND_THEME_META,
  DEFAULT_BRAND_THEME,
  applyBrandTheme,
  normalizeBrandThemeId,
  readStoredBrandTheme,
  resetBrandTheme,
  type BrandThemeId,
} from "@/lib/brandThemes";
import { useToast } from "@/components/Toast";

/**
 * Super-Admin brand theme picker.
 * One click → live UI + publish platform-wide (all visitors).
 */
export default function BrandThemeAdminPanel() {
  const { addToast } = useToast();
  const [active, setActive] = useState<BrandThemeId>(DEFAULT_BRAND_THEME);
  const [published, setPublished] = useState<BrandThemeId>(DEFAULT_BRAND_THEME);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = readStoredBrandTheme();
      if (!cancelled) setActive(local);
      try {
        const res = await fetch("/api/brand-theme", { cache: "no-store" });
        const json = (await res.json()) as { id?: string };
        const id = normalizeBrandThemeId(json?.id);
        if (cancelled) return;
        setPublished(id);
        setActive(id);
        applyBrandTheme(id);
      } catch {
        if (!cancelled) {
          setPublished(local);
          applyBrandTheme(local);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const publish = useCallback(
    async (id: BrandThemeId) => {
      const next = normalizeBrandThemeId(id);
      setActive(next);
      applyBrandTheme(next); // instant preview — zero lag
      setSaving(true);
      try {
        const res = await fetch("/api/brand-theme", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: next }),
        });
        const json = (await res.json()) as { success?: boolean; id?: string; error?: string };
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Publish failed.");
        }
        const saved = normalizeBrandThemeId(json.id);
        setPublished(saved);
        setActive(saved);
        applyBrandTheme(saved);
        addToast(
          saved === DEFAULT_BRAND_THEME
            ? "Default green theme restored for everyone."
            : `${BRAND_THEME_META[saved].label} published for the whole app.`,
          "success",
        );
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : "Could not publish theme. UI preview still applied here.",
          "error",
        );
      } finally {
        setSaving(false);
      }
    },
    [addToast],
  );

  const onReset = useCallback(() => {
    resetBrandTheme();
    void publish(DEFAULT_BRAND_THEME);
  }, [publish]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[color:var(--tm-surface)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="tm-font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Brand color theme
          </h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
            One click changes buttons, links, gradients, hovers, and accents across the whole
            storefront and dashboards. Soft presets only — safe contrast, no layout changes.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={saving || loading || active === DEFAULT_BRAND_THEME}
          className="tm-btn-secondary rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
        >
          Reset to default
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {BRAND_THEME_IDS.map((id) => {
          const meta = BRAND_THEME_META[id];
          const isActive = active === id;
          const isPublished = published === id;
          return (
            <button
              key={id}
              type="button"
              disabled={saving || loading}
              onClick={() => void publish(id)}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border-2 p-3 text-left transition-all ${
                isActive
                  ? "border-[color:var(--tm-brand-500)] ring-2 ring-[color:color-mix(in_srgb,var(--tm-brand-500)_25%,transparent)]"
                  : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500"
              } disabled:opacity-60`}
              aria-pressed={isActive}
            >
              <span
                className="mb-3 h-16 w-full rounded-xl"
                style={{
                  background: `linear-gradient(135deg, ${meta.swatch} 0%, ${meta.swatchAlt} 55%, ${meta.swatch} 100%)`,
                }}
                aria-hidden
              />
              <span className="flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-zinc-900"
                  style={{ backgroundColor: meta.swatch }}
                />
                <span
                  className="h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-zinc-900"
                  style={{ backgroundColor: meta.swatchAlt }}
                />
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {meta.label}
                </span>
              </span>
              <span className="mt-1 text-[0.65rem] font-medium text-zinc-400">
                {isPublished ? "Live for everyone" : isActive ? "Preview" : "Click to publish"}
              </span>
              {isActive && (
                <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[0.6rem] font-bold text-zinc-800 shadow-sm dark:bg-zinc-900/90 dark:text-zinc-100">
                  {saving ? "Saving…" : "Active"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading && (
        <p className="mt-3 text-xs text-zinc-400">Loading published theme…</p>
      )}
    </section>
  );
}
