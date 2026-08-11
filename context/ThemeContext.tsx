"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Real‑Time Dynamic Theme, Font Scale & Grid Layout Engine       */
/*                                                                             */
/*  Features:                                                                   */
/*   - Dark / Light / System theme mode with instant CSS toggle               */
/*   - Dynamic font scale slider (px base → rem root scaling)                 */
/*   - Grid layout switcher (Grid, Compact Grid, Large Cards, List, Gallery)  */
/*   - Card style switcher (Default, Minimal, Detailed, Service)              */
/*   - Persists all preferences to localStorage                              */
/*   - Watches system color-scheme preference for auto mode                   */
/* -------------------------------------------------------------------------- */

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type ThemeMode = "light" | "dark" | "system";

export type GridLayout = "grid" | "compact" | "cards" | "list" | "gallery";

export type CardStyle = "default" | "minimal" | "detailed" | "service";

export interface ThemePreferences {
  /** Active color scheme mode. */
  mode: ThemeMode;
  /** Computed resolved theme (light or dark), derived from mode + system. */
  resolved: "light" | "dark";
  /** Font scale factor applied to `html { font-size }`. Range 14-20 (px base). */
  fontScale: number;
  /** Active grid layout for product/storefront views. */
  gridLayout: GridLayout;
  /** Active card style for product/storefront cards. */
  cardStyle: CardStyle;
  /** Whether the announcement marquee banner is enabled. */
  marqueeEnabled: boolean;
  /** Whether the WhatsApp floating button is visible (storefront pages). */
  whatsappFloatEnabled: boolean;
}

interface ThemeContextValue extends ThemePreferences {
  /** Switch theme mode and persist. */
  setMode: (mode: ThemeMode) => void;
  /** Toggle between light and dark (cycles: light → dark → system → light). */
  toggleTheme: () => void;
  /** Set font scale base px (clamped 14-20). */
  setFontScale: (scale: number) => void;
  /** Set grid layout and persist. */
  setGridLayout: (layout: GridLayout) => void;
  /** Set card style and persist. */
  setCardStyle: (style: CardStyle) => void;
  /** Toggle marquee banner. */
  setMarqueeEnabled: (enabled: boolean) => void;
  /** Toggle WhatsApp float button. */
  setWhatsappFloatEnabled: (enabled: boolean) => void;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const STORAGE_KEY = "trendmart_theme_prefs_v4";
const LEGACY_STORAGE_KEY = "trendmart_theme_prefs_v3";

const DEFAULT_PREFS: Omit<ThemePreferences, "resolved"> = {
  mode: "light",
  fontScale: 14,
  gridLayout: "grid",
  cardStyle: "default",
  marqueeEnabled: true,
  whatsappFloatEnabled: true,
};

const FONT_SCALE_MIN = 14;
const FONT_SCALE_MAX = 20;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function normalizeMode(raw: unknown): ThemeMode {
  if (raw === "dark") return "dark";
  if (raw === "light") return "light";
  // "system" and unknown values fall back to explicit light (platform default).
  return "light";
}

function parseStoredPrefs(raw: string): Omit<ThemePreferences, "resolved"> {
  const parsed = JSON.parse(raw) as Partial<ThemePreferences>;
  return {
    mode: normalizeMode(parsed.mode),
    fontScale:
      typeof parsed.fontScale === "number" &&
      parsed.fontScale >= FONT_SCALE_MIN &&
      parsed.fontScale <= FONT_SCALE_MAX
        ? parsed.fontScale
        : DEFAULT_PREFS.fontScale,
    gridLayout: (["grid", "compact", "cards", "list", "gallery"].includes(parsed.gridLayout as string) ? parsed.gridLayout : DEFAULT_PREFS.gridLayout) as GridLayout,
    cardStyle: (["default", "minimal", "detailed", "service"].includes(parsed.cardStyle as string) ? parsed.cardStyle : DEFAULT_PREFS.cardStyle) as CardStyle,
    marqueeEnabled:
      typeof parsed.marqueeEnabled === "boolean" ? parsed.marqueeEnabled : DEFAULT_PREFS.marqueeEnabled,
    whatsappFloatEnabled:
      typeof parsed.whatsappFloatEnabled === "boolean" ? parsed.whatsappFloatEnabled : DEFAULT_PREFS.whatsappFloatEnabled,
  };
}

function loadPrefs(): Omit<ThemePreferences, "resolved"> {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return parseStoredPrefs(current);
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const migrated = parseStoredPrefs(legacy);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch { /* ignore */ }
      return migrated;
    }
    return { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs: Omit<ThemePreferences, "resolved">): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

/** Resolve the actual (light/dark) theme from mode + system preference. */
function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  // system
  if (typeof window === "undefined") return "light";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Apply the resolved theme to the document root and CSS variables. */
function applyThemeClass(resolved: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
}

/** Apply font scale CSS variable to :root. */
function applyFontScale(scale: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--font-scale", String(scale));
  // Text scales with preference; UI density uses a gentler curve so cards
  // don't cluster/overflow at larger sizes (14 → compact, 20 → readable).
  const textPct = (scale / 16) * 100;
  const density = 0.92 + ((scale - FONT_SCALE_MIN) / (FONT_SCALE_MAX - FONT_SCALE_MIN)) * 0.14;
  root.style.fontSize = `${textPct}%`;
  root.style.setProperty("--tm-ui-density", density.toFixed(3));
  root.setAttribute("data-font-scale", String(scale));
}

/** Apply grid layout CSS class to the main content wrapper. */
function applyGridLayout(layout: GridLayout): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("layout-grid", "layout-compact", "layout-cards", "layout-list", "layout-gallery");
  root.classList.add(`layout-${layout}`);
}

/** Apply card style CSS class. */
function applyCardStyle(style: CardStyle): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("card-default", "card-minimal", "card-detailed", "card-service");
  root.classList.add(`card-${style}`);
}

/* ── Context ───────────────────────────────────────────────────────────────── */

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/* ── Provider ──────────────────────────────────────────────────────────────── */

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Omit<ThemePreferences, "resolved">>(() => loadPrefs());

  const resolved = resolveTheme(prefs.mode);

  // ── Apply side effects on mount and when prefs change ──────────────────────
  useEffect(() => {
    applyThemeClass(resolved);
  }, [resolved]);

  useEffect(() => {
    applyFontScale(prefs.fontScale);
  }, [prefs.fontScale]);

  useEffect(() => {
    applyGridLayout(prefs.gridLayout);
  }, [prefs.gridLayout]);

  useEffect(() => {
    applyCardStyle(prefs.cardStyle);
  }, [prefs.cardStyle]);

  // ── Listen for system color-scheme changes (when mode === "system") ────────
  useEffect(() => {
    if (prefs.mode !== "system") return;
    let mediaQuery: MediaQueryList;
    try {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        // Force re-render to recalc resolved
        setPrefs((prev) => ({ ...prev }));
      };
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } catch {
      /* ignore */
    }
  }, [prefs.mode]);

  // ── Persist on change ──────────────────────────────────────────────────────
  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  // ── Mutators ───────────────────────────────────────────────────────────────

  const setMode = useCallback((mode: ThemeMode) => {
    setPrefs((prev) => ({ ...prev, mode }));
  }, []);

  const toggleTheme = useCallback(() => {
    setPrefs((prev) => {
      // Simple light ↔ dark (professional emerald theme stays constant)
      const resolvedNow = resolveTheme(prev.mode);
      return { ...prev, mode: resolvedNow === "dark" ? "light" : "dark" };
    });
  }, []);

  const setFontScale = useCallback((scale: number) => {
    const clamped = Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, Math.round(scale)));
    setPrefs((prev) => ({ ...prev, fontScale: clamped }));
  }, []);

  const setGridLayout = useCallback((layout: GridLayout) => {
    setPrefs((prev) => ({ ...prev, gridLayout: layout }));
  }, []);

  const setCardStyle = useCallback((style: CardStyle) => {
    setPrefs((prev) => ({ ...prev, cardStyle: style }));
  }, []);

  const setMarqueeEnabled = useCallback((enabled: boolean) => {
    setPrefs((prev) => ({ ...prev, marqueeEnabled: enabled }));
  }, []);

  const setWhatsappFloatEnabled = useCallback((enabled: boolean) => {
    setPrefs((prev) => ({ ...prev, whatsappFloatEnabled: enabled }));
  }, []);

  const value: ThemeContextValue = {
    mode: prefs.mode,
    resolved,
    fontScale: prefs.fontScale,
    gridLayout: prefs.gridLayout,
    cardStyle: prefs.cardStyle,
    marqueeEnabled: prefs.marqueeEnabled,
    whatsappFloatEnabled: prefs.whatsappFloatEnabled,
    setMode,
    toggleTheme,
    setFontScale,
    setGridLayout,
    setCardStyle,
    setMarqueeEnabled,
    setWhatsappFloatEnabled,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export default ThemeProvider;