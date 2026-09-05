/* Brand theme allowlist — CSS presets in app/globals.css [data-brand-theme]. */

export const BRAND_THEME_IDS = [
  "green",
  "blue",
  "dark-purple",
  "purple-pink",
  "red",
  "maroon-pink",
  "maroon",
  "bright-maroon",
  "royal-maroon",
  "maroon-gold",
  "maroon-teal",
  "maroon-plum",
  "purple-blue",
] as const;

export type BrandThemeId = (typeof BRAND_THEME_IDS)[number];

export const DEFAULT_BRAND_THEME: BrandThemeId = "green";

export const BRAND_THEME_META: Record<
  BrandThemeId,
  { label: string; swatch: string; swatchAlt: string }
> = {
  green: { label: "Green (Default)", swatch: "#10b981", swatchAlt: "#0f766e" },
  blue: { label: "Royal Blue", swatch: "#3b82f6", swatchAlt: "#0284c7" },
  "dark-purple": { label: "Dark Purple", swatch: "#7c3aed", swatchAlt: "#5b21b6" },
  "purple-pink": { label: "Purple + Pink", swatch: "#a855f7", swatchAlt: "#ec4899" },
  red: { label: "Soft Red", swatch: "#e11d48", swatchAlt: "#be123c" },
  "maroon-pink": { label: "Maroon + Pink", swatch: "#9f1239", swatchAlt: "#ec4899" },
  maroon: { label: "Pure Maroon", swatch: "#b23c4d", swatchAlt: "#7a1f30" },
  "bright-maroon": { label: "Bright Maroon", swatch: "#e02b52", swatchAlt: "#a0102f" },
  "royal-maroon": { label: "Royal Maroon", swatch: "#c93e5a", swatchAlt: "#861f36" },
  "maroon-gold": { label: "Maroon + Gold", swatch: "#871f29", swatchAlt: "#d97706" },
  "maroon-teal": { label: "Maroon + Teal", swatch: "#871f29", swatchAlt: "#0d9488" },
  "purple-blue": { label: "Purple + Blue", swatch: "#6366f1", swatchAlt: "#3b82f6" },
  "maroon-plum": { label: "Maroon + Plum", swatch: "#871f29", swatchAlt: "#7d3766" },
};

const STORAGE_KEY = "trendsmart_brand_theme_v1";

/** Legacy ids → nearest new preset (old localStorage / bookmarks). */
const LEGACY_BRAND_MAP: Record<string, BrandThemeId> = {
  pink: "purple-pink",
  grey: "green",
  orange: "red",
  yellow: "green",
  "blue-green": "blue",
};

export function isBrandThemeId(value: unknown): value is BrandThemeId {
  return typeof value === "string" && (BRAND_THEME_IDS as readonly string[]).includes(value);
}

export function normalizeBrandThemeId(value: unknown): BrandThemeId {
  if (isBrandThemeId(value)) return value;
  if (typeof value === "string" && LEGACY_BRAND_MAP[value]) return LEGACY_BRAND_MAP[value];
  return DEFAULT_BRAND_THEME;
}

/** Resolve a live brand CSS variable to a usable color (charts/SVG/canvas). */
export function getBrandColor(
  token:
    | "--tm-brand-400"
    | "--tm-brand-500"
    | "--tm-brand-600"
    | "--tm-sea-400"
    | "--tm-sea-500"
    | "--tm-sea-600"
    | "--tm-sea-700"
    | "--tm-accent"
    | "--tm-splash-bg" = "--tm-brand-500",
  fallback = "#10b981",
): string {
  if (typeof window === "undefined") {
    return BRAND_THEME_META[DEFAULT_BRAND_THEME].swatch || fallback;
  }
  try {
    const styles = getComputedStyle(document.documentElement);
    let raw = styles.getPropertyValue(token).trim();
    if (raw.startsWith("var(")) {
      const inner = raw.slice(4, -1).split(",")[0]?.trim();
      if (inner) raw = styles.getPropertyValue(inner).trim() || raw;
    }
    return raw || fallback;
  } catch {
    return fallback;
  }
}

/** Keep browser chrome (theme-color / splash plate) in sync with active brand. */
export function syncBrowserBrandChrome(): void {
  if (typeof document === "undefined") return;
  const splash = getBrandColor("--tm-splash-bg", "#0f766e");
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((el) => el.setAttribute("content", splash));
  const root = document.documentElement;
  if (root.classList.contains("tm-boot-splash") || root.classList.contains("tm-splash-lock")) {
    root.style.backgroundColor = splash;
  }
}

/** Apply allowlisted theme to <html> — CSS presets + hovers/animations follow. */
export function applyBrandTheme(theme: BrandThemeId): void {
  if (typeof document === "undefined") return;
  const id = normalizeBrandThemeId(theme);
  document.documentElement.setAttribute("data-brand-theme", id);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  syncBrowserBrandChrome();
  try {
    window.dispatchEvent(new CustomEvent("tm:brand-theme", { detail: { id } }));
  } catch {
    /* ignore */
  }
}

/** Admin "Reset to default" — back to TrendsMart green. */
export function resetBrandTheme(): void {
  applyBrandTheme(DEFAULT_BRAND_THEME);
}

export function readStoredBrandTheme(): BrandThemeId {
  if (typeof window === "undefined") return DEFAULT_BRAND_THEME;
  try {
    return normalizeBrandThemeId(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_BRAND_THEME;
  }
}
