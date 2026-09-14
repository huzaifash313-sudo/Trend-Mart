"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DICTS,
  LOCALE_LABEL,
  translate,
  translateParams,
  type LocaleCode,
} from "@/lib/i18n/dictionaries";

const STORAGE_KEY = "trendsmart_locale_v1";

interface LocaleContextValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  label: string;
  /** True when Urdu UI strings are active */
  isUrdu: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readLocale(): LocaleCode {
  if (typeof window === "undefined") return "en";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "ur" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "en";
}

/**
 * Apply lang for a11y / fonts — keep dir=ltr always so grids, header,
 * and product cards don't flip (UI stays stable for bilingual PK apps).
 */
function applyDocumentLocale(loc: LocaleCode) {
  document.documentElement.lang = loc === "ur" ? "ur" : "en";
  document.documentElement.dir = "ltr";
  document.documentElement.classList.toggle("tm-locale-ur", loc === "ur");
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loc = readLocale();
    setLocaleState(loc);
    applyDocumentLocale(loc);
    setReady(true);
  }, []);

  const setLocale = useCallback((next: LocaleCode) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyDocumentLocale(next);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      params ? translateParams(locale, key, params) : translate(locale, key),
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      label: LOCALE_LABEL[locale],
      isUrdu: locale === "ur",
    }),
    [locale, setLocale, t],
  );

  if (!ready) {
    return (
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    );
  }

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: "en" as LocaleCode,
      setLocale: (_: LocaleCode) => {},
      t: (key: string, params?: Record<string, string | number>) =>
        params ? translateParams("en", key, params) : DICTS.en[key] ?? key,
      label: LOCALE_LABEL.en,
      isUrdu: false,
    };
  }
  return ctx;
}
