/* -------------------------------------------------------------------------- */
/*  TrendMart — Multi-Currency & Currency Conversion Utility                   */
/*                                                                             */
/*  Lightweight service for:                                                   */
/*   - Currency symbol mapping for regional retail buyers (PKR, USD, EUR,     */
/*     GBP, INR, AED, SAR)                                                    */
/*   - Automatic formatting across product grids, cart totals, WhatsApp       */
/*     checkout payloads                                                      */
/*   - Regional store configuration-based currency selection                  */
/*   - Exchange rate caching with TTL                                         */
/* -------------------------------------------------------------------------- */

import { formatPrice, formatRupees, type CurrencyCode } from "@/lib/formatters";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type SupportedCurrency = CurrencyCode | "AED" | "SAR";

export interface CurrencyInfo {
  code: SupportedCurrency;
  symbol: string;
  name: string;
  locale: string;
  /** Number of decimal places typically used for display */
  decimals: number;
  /** Whether this is a regional default for the store */
  isRegional?: boolean;
}

export interface CurrencyConversionResult {
  originalAmount: number;
  originalCurrency: SupportedCurrency;
  convertedAmount: number;
  targetCurrency: SupportedCurrency;
  rate: number;
  /** ISO timestamp when the rate was fetched */
  fetchedAt: string;
}

export interface ExchangeRateCache {
  rates: Record<string, number>;
  baseCurrency: SupportedCurrency;
  fetchedAt: string;
  /** Time-to-live in milliseconds (default: 1 hour) */
  ttlMs: number;
}

/* -------------------------------------------------------------------------- */
/*  Currency Registry                                                         */
/* -------------------------------------------------------------------------- */

/** Complete registry of supported currencies with display metadata. */
export const CURRENCY_REGISTRY: Record<SupportedCurrency, CurrencyInfo> = {
  PKR: {
    code: "PKR",
    symbol: "Rs.",
    name: "Pakistani Rupee",
    locale: "en-PK",
    decimals: 0,
    isRegional: true,
  },
  USD: {
    code: "USD",
    symbol: "$",
    name: "US Dollar",
    locale: "en-US",
    decimals: 2,
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    name: "Euro",
    locale: "en-DE",
    decimals: 2,
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    name: "British Pound",
    locale: "en-GB",
    decimals: 2,
  },
  INR: {
    code: "INR",
    symbol: "₹",
    name: "Indian Rupee",
    locale: "en-IN",
    decimals: 0,
  },
  AED: {
    code: "AED",
    symbol: "د.إ",
    name: "UAE Dirham",
    locale: "en-AE",
    decimals: 2,
  },
  SAR: {
    code: "SAR",
    symbol: "﷼",
    name: "Saudi Riyal",
    locale: "en-SA",
    decimals: 2,
  },
};

/** Ordered list of all supported currency codes. */
export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  "PKR",
  "USD",
  "EUR",
  "GBP",
  "INR",
  "AED",
  "SAR",
];

/** Regional default currencies based on store location heuristics. */
export const REGIONAL_CURRENCY_MAP: Record<string, SupportedCurrency> = {
  Pakistan: "PKR",
  India: "INR",
  "United Arab Emirates": "AED",
  UAE: "AED",
  "Saudi Arabia": "SAR",
  USA: "USD",
  "United States": "USD",
  UK: "GBP",
  "United Kingdom": "GBP",
  Germany: "EUR",
  France: "EUR",
  default: "PKR",
};

/* -------------------------------------------------------------------------- */
/*  Exchange Rate Cache                                                       */
/* -------------------------------------------------------------------------- */

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

let exchangeRateCache: ExchangeRateCache | null = null;

/** Static fallback rates (approximate) used when live rates are unavailable. */
const STATIC_FALLBACK_RATES: Record<string, number> = {
  PKR_USD: 0.0036,
  PKR_EUR: 0.0033,
  PKR_GBP: 0.0028,
  PKR_INR: 0.3,
  PKR_AED: 0.013,
  PKR_SAR: 0.0135,
  USD_PKR: 278,
  USD_EUR: 0.92,
  USD_GBP: 0.79,
  USD_INR: 83.5,
  USD_AED: 3.67,
  USD_SAR: 3.75,
};

/**
 * Get the current exchange rate from one currency to another.
 * Uses cached rates first, falls back to static approximate rates.
 */
export function getExchangeRateSync(
  from: SupportedCurrency,
  to: SupportedCurrency,
): number {
  if (from === to) return 1;

  // Check cache first
  if (exchangeRateCache && isCacheValid(exchangeRateCache)) {
    const cacheKey = `${from}_${to}`;
    if (exchangeRateCache.rates[cacheKey]) {
      return exchangeRateCache.rates[cacheKey];
    }

    // Convert via base currency
    const fromToBase =
      from === exchangeRateCache.baseCurrency
        ? 1
        : exchangeRateCache.rates[`${from}_${exchangeRateCache.baseCurrency}`];
    const baseToTarget =
      to === exchangeRateCache.baseCurrency
        ? 1
        : exchangeRateCache.rates[`${exchangeRateCache.baseCurrency}_${to}`];

    if (fromToBase && baseToTarget) {
      return fromToBase * baseToTarget;
    }
  }

  // Fallback to static rates
  const directKey = `${from}_${to}`;
  if (STATIC_FALLBACK_RATES[directKey]) {
    return STATIC_FALLBACK_RATES[directKey];
  }

  // Try reverse
  const reverseKey = `${to}_${from}`;
  if (STATIC_FALLBACK_RATES[reverseKey]) {
    return 1 / STATIC_FALLBACK_RATES[reverseKey];
  }

  // Convert via USD
  const fromToUSD = STATIC_FALLBACK_RATES[`${from}_USD`] ?? 1 / (STATIC_FALLBACK_RATES[`USD_${from}`] ?? 1);
  const usdToTarget = STATIC_FALLBACK_RATES[`USD_${to}`] ?? 1 / (STATIC_FALLBACK_RATES[`${to}_USD`] ?? 1);

  return fromToUSD * usdToTarget;
}

/** Check if the cached exchange rates are still valid. */
function isCacheValid(cache: ExchangeRateCache): boolean {
  const now = Date.now();
  const fetchedAt = new Date(cache.fetchedAt).getTime();
  return now - fetchedAt < cache.ttlMs;
}

/**
 * Fetch live exchange rates from a public API.
 * Updates the in-memory cache on success.
 */
export async function fetchExchangeRates(
  baseCurrency: SupportedCurrency = "USD",
): Promise<ExchangeRateCache> {
  try {
    // Use frankfurter.app (free, no API key needed) for EUR-base rates
    // Then convert from EUR to the requested base
    const response = await fetch("https://api.frankfurter.app/latest?from=EUR");

    if (!response.ok) {
      throw new Error(`Exchange rate API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      base: string;
      date: string;
      rates: Record<string, number>;
    };

    // Convert EUR-based rates to our format
    const eurRates = data.rates;

    // Build rates map: "FROM_TO" => rate
    const rates: Record<string, number> = {};

    // Add EUR rates
    for (const [currency, rate] of Object.entries(eurRates)) {
      rates[`EUR_${currency}`] = rate;
      rates[`${currency}_EUR`] = 1 / rate;
    }

    // Cross-rates for supported currencies
    const supportedList = SUPPORTED_CURRENCIES.filter(
      (c) => c !== "EUR" && eurRates[c],
    );

    for (const from of supportedList) {
      for (const to of supportedList) {
        if (from !== to) {
          const fromEur = eurRates[from];
          const toEur = eurRates[to];
          if (fromEur && toEur) {
            rates[`${from}_${to}`] = toEur / fromEur;
          }
        }
      }
    }

    exchangeRateCache = {
      rates,
      baseCurrency,
      fetchedAt: new Date().toISOString(),
      ttlMs: DEFAULT_TTL_MS,
    };

    return exchangeRateCache;
  } catch {
    // On failure, build cache from static fallback rates
    const rates: Record<string, number> = { ...STATIC_FALLBACK_RATES };

    // Generate cross-rates from static data
    for (const from of SUPPORTED_CURRENCIES) {
      for (const to of SUPPORTED_CURRENCIES) {
        if (from !== to && !rates[`${from}_${to}`]) {
          const directKey = `${from}_${to}`;
          rates[directKey] = getExchangeRateSync(from, to);
        }
      }
    }

    exchangeRateCache = {
      rates,
      baseCurrency,
      fetchedAt: new Date().toISOString(),
      ttlMs: DEFAULT_TTL_MS,
    };

    return exchangeRateCache;
  }
}

/**
 * Async exchange rate lookup with cache.
 * Prefer getExchangeRateSync for UI rendering; use this for checkout/confirmation flows.
 */
export async function getExchangeRate(
  from: SupportedCurrency,
  to: SupportedCurrency,
): Promise<number> {
  if (from === to) return 1;

  // Check cache
  if (exchangeRateCache && isCacheValid(exchangeRateCache)) {
    return getExchangeRateSync(from, to);
  }

  // Fetch fresh rates
  await fetchExchangeRates(from);
  return getExchangeRateSync(from, to);
}

/* -------------------------------------------------------------------------- */
/*  Currency Formatting                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Format a price in any supported currency.
 * Uses the existing formatPrice utility from lib/formatters, extended for
 * additional regional currencies (AED, SAR).
 *
 * @example
 * ```ts
 * formatCurrency(2499)                  // "Rs. 2,499" (default PKR)
 * formatCurrency(19.99, "USD")          // "$19.99"
 * formatCurrency(1500, "INR")           // "₹1,500"
 * formatCurrency(99.50, "AED")          // "د.إ 99.50"
 * ```
 */
export function formatCurrency(
  amount: number,
  currency: SupportedCurrency = "PKR",
): string {
  const info = CURRENCY_REGISTRY[currency];

  // For PKR, use the existing formatRupees helper for consistency
  if (currency === "PKR") {
    return formatRupees(amount);
  }

  // For standard ISO codes (USD, EUR, GBP, INR), delegate to formatPrice
  if (["USD", "EUR", "GBP", "INR"].includes(currency)) {
    return formatPrice(amount, { currency: currency as CurrencyCode });
  }

  // For AED, SAR — custom formatting using Intl
  try {
    return new Intl.NumberFormat(info.locale, {
      style: "currency",
      currency,
      minimumFractionDigits: info.decimals,
      maximumFractionDigits: info.decimals,
    }).format(amount);
  } catch {
    // Fallback: symbol + formatted number
    return `${info.symbol} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: info.decimals,
      maximumFractionDigits: info.decimals,
    })}`;
  }
}

/**
 * Format a price for display in product grids with a compact representation.
 * For PKR, uses the "Rs." shorthand. For other currencies, shows the symbol.
 *
 * @example
 * ```ts
 * formatCompactCurrency(2499)        // "Rs. 2,499"
 * formatCompactCurrency(19.99, "USD") // "$19.99"
 * ```
 */
export function formatCompactCurrency(
  amount: number,
  currency: SupportedCurrency = "PKR",
): string {
  return formatCurrency(amount, currency);
}

/**
 * Format a price specifically for WhatsApp checkout messages.
 * Ensures the currency is clearly identifiable even in plain text.
 *
 * @example
 * ```ts
 * formatWhatsAppPrice(2499)           // "Rs. 2,499"
 * formatWhatsAppPrice(19.99, "USD")   // "US$ 19.99"
 * ```
 */
export function formatWhatsAppPrice(
  amount: number,
  currency: SupportedCurrency = "PKR",
): string {
  const info = CURRENCY_REGISTRY[currency];

  if (currency === "PKR") {
    return formatRupees(amount);
  }

  // For WhatsApp, use a text-friendly prefix
  const numeric = amount.toLocaleString(info.locale, {
    minimumFractionDigits: info.decimals,
    maximumFractionDigits: info.decimals,
  });

  return `${info.symbol} ${numeric}`;
}

/**
 * Format a cart total with the appropriate currency.
 * Shows both the symbol and the ISO code for clarity in order summaries.
 *
 * @example
 * ```ts
 * formatCartTotal(2499)              // "Rs. 2,499 PKR"
 * formatCartTotal(19.99, "USD")      // "$19.99 USD"
 * ```
 */
export function formatCartTotal(
  amount: number,
  currency: SupportedCurrency = "PKR",
): string {
  const formatted = formatCurrency(amount, currency);
  return `${formatted} ${currency}`;
}

/* -------------------------------------------------------------------------- */
/*  Currency Conversion                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Convert an amount from one currency to another.
 *
 * @example
 * ```ts
 * const result = await convertCurrency(1000, "PKR", "USD");
 * // result.convertedAmount => ~3.60
 * ```
 */
export async function convertCurrency(
  amount: number,
  from: SupportedCurrency,
  to: SupportedCurrency,
): Promise<CurrencyConversionResult> {
  if (from === to) {
    return {
      originalAmount: amount,
      originalCurrency: from,
      convertedAmount: amount,
      targetCurrency: to,
      rate: 1,
      fetchedAt: new Date().toISOString(),
    };
  }

  const rate = await getExchangeRate(from, to);
  const convertedAmount = Math.round(amount * rate * 100) / 100;

  return {
    originalAmount: amount,
    originalCurrency: from,
    convertedAmount,
    targetCurrency: to,
    rate,
    fetchedAt: exchangeRateCache?.fetchedAt ?? new Date().toISOString(),
  };
}

/**
 * Synchronous conversion using cached/fallback rates.
 * Use for UI previews where near-instant rendering is required.
 */
export function convertCurrencySync(
  amount: number,
  from: SupportedCurrency,
  to: SupportedCurrency,
): CurrencyConversionResult {
  if (from === to) {
    return {
      originalAmount: amount,
      originalCurrency: from,
      convertedAmount: amount,
      targetCurrency: to,
      rate: 1,
      fetchedAt: new Date().toISOString(),
    };
  }

  const rate = getExchangeRateSync(from, to);
  const convertedAmount = Math.round(amount * rate * 100) / 100;

  return {
    originalAmount: amount,
    originalCurrency: from,
    convertedAmount,
    targetCurrency: to,
    rate,
    fetchedAt: exchangeRateCache?.fetchedAt ?? new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Regional Currency Detection                                               */
/* -------------------------------------------------------------------------- */

/**
 * Detect the most appropriate currency for a store based on its location.
 * Falls back to PKR if no match is found.
 *
 * @example
 * ```ts
 * detectRegionalCurrency("Dubai, UAE")    // "AED"
 * detectRegionalCurrency("Lahore, Pakistan") // "PKR"
 * detectRegionalCurrency("New York, USA")  // "USD"
 * ```
 */
export function detectRegionalCurrency(
  location?: string | null,
): SupportedCurrency {
  if (!location) return "PKR";

  const locationLower = location.toLowerCase();

  // Check explicit matches first
  for (const [region, currency] of Object.entries(REGIONAL_CURRENCY_MAP)) {
    if (region === "default") continue;
    if (locationLower.includes(region.toLowerCase())) {
      return currency;
    }
  }

  return REGIONAL_CURRENCY_MAP["default"] ?? "PKR";
}

/**
 * Get the user's preferred currency based on browser locale or stored preference.
 * Falls back to PKR.
 */
export function getUserPreferredCurrency(): SupportedCurrency {
  if (typeof window === "undefined") return "PKR";

  // Check localStorage for saved preference
  try {
    const saved = localStorage.getItem("trendmart_preferred_currency");
    if (saved && SUPPORTED_CURRENCIES.includes(saved as SupportedCurrency)) {
      return saved as SupportedCurrency;
    }
  } catch {
    // localStorage may be unavailable
  }

  // Detect from browser locale
  const locale = navigator.language || "en-PK";

  // Map common locales to currencies
  const localeMap: Record<string, SupportedCurrency> = {
    "en-PK": "PKR",
    "ur-PK": "PKR",
    "en-US": "USD",
    "en-GB": "GBP",
    "en-IN": "INR",
    "hi-IN": "INR",
    "de-DE": "EUR",
    "fr-FR": "EUR",
    "en-AE": "AED",
    "ar-AE": "AED",
    "en-SA": "SAR",
    "ar-SA": "SAR",
  };

  if (localeMap[locale]) return localeMap[locale];

  // Check language prefix
  const lang = locale.split("-")[0];
  const langMap: Record<string, SupportedCurrency> = {
    en: "USD",
    ur: "PKR",
    hi: "INR",
    de: "EUR",
    fr: "EUR",
    ar: "AED",
  };

  return langMap[lang] ?? "PKR";
}

/**
 * Save the user's preferred currency to localStorage.
 */
export function saveUserPreferredCurrency(currency: SupportedCurrency): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("trendmart_preferred_currency", currency);
  } catch {
    // localStorage may be unavailable
  }
}

/* -------------------------------------------------------------------------- */
/*  Currency Info Helpers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Get full currency metadata by code.
 */
export function getCurrencyInfo(currency: SupportedCurrency): CurrencyInfo {
  return CURRENCY_REGISTRY[currency];
}

/**
 * Get the currency symbol for a given currency code.
 */
export function getCurrencySymbol(currency: SupportedCurrency): string {
  return CURRENCY_REGISTRY[currency]?.symbol ?? "?";
}

/**
 * Get all supported currencies as an array of options (for dropdowns).
 */
export function getCurrencyOptions(): Array<{
  value: SupportedCurrency;
  label: string;
  symbol: string;
}> {
  return SUPPORTED_CURRENCIES.map((code) => ({
    value: code,
    label: CURRENCY_REGISTRY[code].name,
    symbol: CURRENCY_REGISTRY[code].symbol,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Pre-fetch Exchange Rates on Module Load (Client-Side Only)                 */
/* -------------------------------------------------------------------------- */

if (typeof window !== "undefined") {
  // Fire-and-forget: try to warm the cache
  fetchExchangeRates().catch(() => {
    // Silently fall back to static rates
  });
}