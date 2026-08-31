/* -------------------------------------------------------------------------- */
/*  TrendsMart — Tax & Currency Calculation Utility (Prompt 69)                  */
/* -------------------------------------------------------------------------- */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CurrencyCode = "PKR" | "USD" | "EUR" | "GBP" | "INR";

export interface TaxRates {
  /** GST / sales tax percentage (default 0 for no tax). */
  gstPercent: number;
  /** Optional service charge percentage. */
  serviceChargePercent: number;
  /** Optional fixed shipping fee. */
  shippingFee: number;
}

export interface OrderSummary {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  gst: number;
  serviceCharge: number;
  shipping: number;
  grandTotal: number;
  currency: CurrencyCode;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default tax rates (Pakistani context: 0% GST by default, no service charge). */
export const DEFAULT_TAX_RATES: TaxRates = {
  gstPercent: 0,
  serviceChargePercent: 0,
  shippingFee: 0,
};

/** PKR GST rate (standard: 17% — can be adjusted per merchant). */
export const PKR_GST_RATE = 17;

// ─── Currency Symbols ─────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  PKR: "Rs.",
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
};

/** Fraction digits by currency convention. */
const FRACTION_DIGITS: Record<CurrencyCode, number> = {
  PKR: 0,
  INR: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
};

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format an amount in the specified currency with proper symbol and decimals.
 */
export function formatCurrency(amount: number, currency: CurrencyCode = "PKR"): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const fractionDigits = FRACTION_DIGITS[currency];
  const numPart = amount.toLocaleString("en", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${symbol} ${numPart}`;
}

/**
 * Short-formatted currency for compact displays.
 */
export function formatCurrencyShort(amount: number, currency: CurrencyCode = "PKR"): string {
  if (amount >= 1_000_000) {
    return `${CURRENCY_SYMBOLS[currency]} ${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `${CURRENCY_SYMBOLS[currency]} ${(amount / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(amount, currency);
}

// ─── Tax Calculation ──────────────────────────────────────────────────────────

/**
 * Compute an itemised order summary with tax, discount, service charge, and shipping.
 *
 * @param subtotal   Pre-discount total of all line items.
 * @param discount   Flat discount amount (from coupon, promo, etc.).
 * @param rates      Tax rate configuration (optional — defaults to no tax).
 * @param currency   Currency for formatting the summary (default PKR).
 */
export function computeOrderSummary(
  subtotal: number,
  discount: number = 0,
  rates: Partial<TaxRates> = {},
  currency: CurrencyCode = "PKR",
): OrderSummary {
  const effectiveRates: TaxRates = {
    ...DEFAULT_TAX_RATES,
    ...rates,
  };

  const discountAmount = Math.min(discount, subtotal);
  const taxableAmount = subtotal - discountAmount;

  const gst = Math.round(taxableAmount * (effectiveRates.gstPercent / 100));
  const serviceCharge = Math.round(taxableAmount * (effectiveRates.serviceChargePercent / 100));
  const shipping = effectiveRates.shippingFee;

  const grandTotal = taxableAmount + gst + serviceCharge + shipping;

  return {
    subtotal,
    discount: discountAmount,
    taxableAmount,
    gst,
    serviceCharge,
    shipping,
    grandTotal,
    currency,
  };
}

/**
 * Convenience: compute a PKR order summary with standard 17% GST.
 */
export function computePKROrderSummary(
  subtotal: number,
  discount: number = 0,
  shipping: number = 0,
): OrderSummary {
  return computeOrderSummary(subtotal, discount, {
    gstPercent: PKR_GST_RATE,
    shippingFee: shipping,
  }, "PKR");
}

/**
 * Format an OrderSummary into a human-readable breakdown string
 * for WhatsApp messages or order confirmation displays.
 */
export function formatOrderSummaryText(summary: OrderSummary): string {
  const c = summary.currency;
  const lines: string[] = [
    `Subtotal: ${formatCurrency(summary.subtotal, c)}`,
  ];

  if (summary.discount > 0) {
    lines.push(`Discount: -${formatCurrency(summary.discount, c)}`);
  }

  lines.push(`Taxable Amount: ${formatCurrency(summary.taxableAmount, c)}`);

  if (summary.gst > 0) {
    lines.push(`GST (${DEFAULT_TAX_RATES.gstPercent || PKR_GST_RATE}%): ${formatCurrency(summary.gst, c)}`);
  }

  if (summary.serviceCharge > 0) {
    lines.push(`Service Charge: ${formatCurrency(summary.serviceCharge, c)}`);
  }

  if (summary.shipping > 0) {
    lines.push(`Shipping: ${formatCurrency(summary.shipping, c)}`);
  }

  lines.push(`\nGrand Total: ${formatCurrency(summary.grandTotal, c)}`);

  return lines.join("\n");
}

/**
 * Build a WhatsApp-ready order message with full tax breakdown.
 */
export function formatWhatsAppOrderWithTax(
  shopName: string,
  items: { name: string; price: number; variant?: string }[],
  summary: OrderSummary,
): string {
  const itemLines = items.map(
    (item) => `• ${item.name}${item.variant ? ` (${item.variant})` : ""} — ${formatCurrency(item.price, summary.currency)}`,
  );

  const lines = [
    `Hi ${shopName}! I'd like to order:`,
    "",
    ...itemLines,
    "",
    `Subtotal: ${formatCurrency(summary.subtotal, summary.currency)}`,
  ];

  if (summary.discount > 0) {
    lines.push(`Discount: -${formatCurrency(summary.discount, summary.currency)}`);
  }

  if (summary.gst > 0) {
    lines.push(`GST: ${formatCurrency(summary.gst, summary.currency)}`);
  }

  if (summary.serviceCharge > 0) {
    lines.push(`Service Charge: ${formatCurrency(summary.serviceCharge, summary.currency)}`);
  }

  if (summary.shipping > 0) {
    lines.push(`Shipping: ${formatCurrency(summary.shipping, summary.currency)}`);
  }

  lines.push("");
  lines.push(`Grand Total: ${formatCurrency(summary.grandTotal, summary.currency)}`);
  lines.push("");
  lines.push("Please confirm availability.");

  return lines.join("\n");
}

// ─── Discount Calculation Helpers ─────────────────────────────────────────────

/**
 * Apply a percentage discount to an amount.
 *
 * @example applyPercentDiscount(2499, 10) // 2249 (10% off)
 * @example applyPercentDiscount(2499, 0)  // 2499
 */
export function applyPercentDiscount(subtotal: number, percentOff: number): number {
  if (percentOff < 0 || percentOff > 100) return subtotal;
  return subtotal - Math.round(subtotal * (percentOff / 100));
}

/**
 * Apply a flat discount amount, capped at subtotal.
 */
export function applyFlatDiscount(subtotal: number, amountOff: number): number {
  return Math.max(0, subtotal - amountOff);
}