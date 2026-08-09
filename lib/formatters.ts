/* -------------------------------------------------------------------------- */
/*  TrendMart — Formatting Utilities                                            */
/*  Centralised currency, price, and locale-aware display formatters.           */
/*  All hardcoded price strings across product catalogs, dashboard tables,     */
/*  and shop cards should reference these functions for consistent display.     */
/* -------------------------------------------------------------------------- */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CurrencyCode = "PKR" | "USD" | "EUR" | "GBP" | "INR";

export interface CurrencyFormatOptions {
  /** ISO 4217 currency code (defaults to "PKR"). */
  currency?: CurrencyCode;
  /** Locale tag (defaults to "en-PK"). */
  locale?: string;
  /** Whether to show the currency symbol/code (default true). */
  showSymbol?: boolean;
  /** Minimum fraction digits (default 0 for PKR, 2 for USD/EUR/GBP). */
  minimumFractionDigits?: number;
  /** Maximum fraction digits (defaults to minimumFractionDigits). */
  maximumFractionDigits?: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_LOCALE = "en-PK";
const DEFAULT_CURRENCY: CurrencyCode = "PKR";

/** Fraction digit defaults by currency (market convention). */
const CURRENCY_FRACTION_DEFAULTS: Record<CurrencyCode, number> = {
  PKR: 0,
  INR: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
};

// ─── Core Formatter ───────────────────────────────────────────────────────────

/**
 * Format a numeric price into a localised currency string.
 *
 * @example
 * ```ts
 * formatPrice(2499)                        // "Rs. 2,499"
 * formatPrice(2499, { showSymbol: false }) // "2,499"
 * formatPrice(19.99, { currency: "USD" })  // "$19.99"
 * formatPrice(1500, { locale: "ur-PK" })   // "Rs. 1,500"
 * ```
 */
export function formatPrice(
  amount: number,
  options: CurrencyFormatOptions = {},
): string {
  // Destructure with defaults
  const {
    currency = DEFAULT_CURRENCY,
    locale = DEFAULT_LOCALE,
    showSymbol = true,
  } = options;

  // Determine fraction digits
  const fractionDefault = CURRENCY_FRACTION_DEFAULTS[currency];
  const minDigits =
    options.minimumFractionDigits ?? fractionDefault;
  const maxDigits =
    options.maximumFractionDigits ?? minDigits;

  // Primary format via Intl.NumberFormat
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(amount);

  if (!showSymbol) {
    // Strip the currency symbol/code, returning only the numeric part
    // Intl returns something like "PKR 2,499" or "Rs. 2,499" or "$19.99"
    return formatted.replace(/^[^\d]*/, "").trim();
  }

  return formatted;
}

/**
 * Format a price with the short "Rs." prefix used across TrendMart UI.
 * This is the standard formatter for PKR prices shown in product cards,
 * dashboard tables, and order summaries.
 *
 * @example
 * ```ts
 * formatRupees(2499)     // "Rs. 2,499"
 * formatRupees(150)      // "Rs. 150"
 * formatRupees(0)        // "Rs. 0"
 * formatRupees(9999.99)  // "Rs. 10,000" (rounded to 0 decimal places)
 * ```
 */
export function formatRupees(amount: number): string {
  // Use en-PK locale for PKR formatting, but replace the symbol with "Rs."
  const numericPart = new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

  // Replace "PKR" with "Rs." for a friendlier display
  return numericPart.replace(/^PKR\s?/, "Rs. ");
}

/**
 * Format a simple number with thousand separators (no currency symbol).
 *
 * @example
 * ```ts
 * formatNumber(2499)     // "2,499"
 * formatNumber(150000)   // "150,000"
 * ```
 */
export function formatNumber(amount: number, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale).format(amount);
}

/**
 * Return a short-formatted price string with an accessibility label.
 * Useful for screen-reader friendly `<span>` elements.
 *
 * @example
 * ```ts
 * const { display, aria } = formatPriceA11y(2499);
 * // display: "Rs. 2,499"
 * // aria: "2,499 Pakistani Rupees"
 * ```
 */
export function formatPriceA11y(
  amount: number,
  options: CurrencyFormatOptions = {},
): { display: string; aria: string } {
  const currency = options.currency ?? DEFAULT_CURRENCY;
  const display = formatPrice(amount, { ...options, currency });

  // Build an accessible label
  const numeric = formatNumber(amount);
  const currencyNames: Record<CurrencyCode, string> = {
    PKR: "Pakistani Rupees",
    USD: "US Dollars",
    EUR: "Euros",
    GBP: "British Pounds",
    INR: "Indian Rupees",
  };

  const aria = `${numeric} ${currencyNames[currency]}`;
  return { display, aria };
}

// ─── Discount / Markdown Pricing Helpers ──────────────────────────────────────

export interface ProductDiscountInfo {
  /** True only when a valid original price exists and is greater than the current price. */
  hasDiscount: boolean;
  /** The "before discount" price to strike through, or `null` when there's no active discount. */
  originalPrice: number | null;
  /** Rounded percentage discount (0 when `hasDiscount` is false). */
  discountPercent: number;
}

/**
 * Single source of truth for reading a product's markdown/discount state.
 *
 * Resolves `original_price` first, falling back to the legacy
 * `compare_at_price` column for older records that predate the
 * `original_price` field. Always use this instead of reading
 * `product.original_price` directly, so every surface (product grid, quick
 * view, cart, dashboard) stays in sync.
 *
 * @example
 * ```ts
 * const { hasDiscount, originalPrice, discountPercent } = getProductDiscount(product);
 * if (hasDiscount) return `${discountPercent}% OFF`;
 * ```
 */
export function getProductDiscount(product: {
  price: number;
  original_price?: number | null;
  compare_at_price?: number | null;
  /** When set and in the past, discount badge is treated as inactive. */
  deal_expires_at?: string | null;
}): ProductDiscountInfo {
  const candidate = product.original_price ?? product.compare_at_price ?? null;
  let dealActive = true;
  if (product.deal_expires_at) {
    const end = new Date(product.deal_expires_at).getTime();
    if (!Number.isNaN(end) && end <= Date.now()) dealActive = false;
  }
  const hasDiscount =
    dealActive &&
    candidate != null &&
    Number.isFinite(candidate) &&
    candidate > product.price;

  return {
    hasDiscount,
    originalPrice: hasDiscount ? candidate : null,
    discountPercent: hasDiscount
      ? Math.round(((candidate - product.price) / candidate) * 100)
      : 0,
  };
}

// ─── WhatsApp / Order Message Helpers ─────────────────────────────────────────

/**
 * Build a standardised WhatsApp order message string for a single product.
 * Ensures consistent formatting across all WhatsApp deep-links.
 *
 * @param shopName    Name of the shop.
 * @param productName Name of the product.
 * @param price       Numeric price value.
 */
export function formatWhatsAppOrderMessage(
  shopName: string,
  productName: string,
  price: number,
): string {
  const priceDisplay = formatRupees(price);
  return [
    `Hi ${shopName}! I'd like to order:`,
    ``,
    `• ${productName} — ${priceDisplay}`,
    ``,
    `Please confirm availability.`,
  ].join("\n");
}

/**
 * Build a generic WhatsApp inquiry message for a shop.
 */
export function formatWhatsAppInquiryMessage(shopName: string): string {
  return `Hi ${shopName}! I'd like to place an order.`;
}

// ─── Date / Time Formatters ───────────────────────────────────────────────────

/**
 * Format an ISO timestamp into a short, human-readable date string.
 *
 * @example
 * ```ts
 * formatDate("2025-06-15T14:22:00Z") // "Jun 15, 2025"
 * formatDate("2025-06-15T14:22:00Z", "full") // "June 15, 2025"
 * ```
 */
export function formatDate(
  iso: string,
  style: "short" | "full" = "short",
): string {
  const date = new Date(iso);
  if (style === "full") {
    return date.toLocaleDateString("en-PK", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  return date.toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a relative time string (e.g. "2 hours ago", "3 days ago").
 * Falls back to absolute date for timestamps older than 30 days.
 */
export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;

  // Future or invalid dates
  if (diffMs < 0 || Number.isNaN(diffMs)) {
    return formatDate(iso);
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) return formatDate(iso);
  if (days > 0) return `${days} day${days !== 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  return "Just now";
}

// ─── Analytics / Stats Formatters ─────────────────────────────────────────────

/**
 * Format a numeric count for display in analytics cards.
 * For large numbers, use compact notation (e.g. "1.5K" instead of "1500").
 * Threshold: numbers >= 1,000 use compact.
 *
 * @example
 * ```ts
 * formatCount(42)      // "42"
 * formatCount(1500)    // "1.5K"
 * formatCount(25000)   // "25K"
 * ```
 */
export function formatCount(count: number): string {
  if (count < 1000) return String(count);

  // Compact notation with 1 decimal precision
  return new Intl.NumberFormat("en-PK", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(count);
}

// ─── Truncation / Text Formatters ─────────────────────────────────────────────

/**
 * Truncate a string to `maxLength` characters, appending ellipsis if needed.
 * Ensures words are not broken mid-character.
 *
 * @example
 * ```ts
 * truncate("This is a very long product name", 20) // "This is a very lon…"
 * ```
 */
export function truncate(text: string, maxLength = 60): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "\u2026";
}

/**
 * Convert a category key to its display emoji and label pair.
 */
export function categoryDisplay(category: string): { emoji: string; label: string } {
  const map: Record<string, string> = {
    Food: "🍔",
    Grocery: "🛒",
    Boutique: "👗",
    Electronics: "📱",
    Cosmetics: "💄",
  };
  return { emoji: map[category] ?? "🏪", label: category };
}