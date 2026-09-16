/* -------------------------------------------------------------------------- */
/*  POS bill arithmetic — the single source of truth for what a sale costs.     */
/*                                                                              */
/*  Both the counter UI (live totals) and the sales API (authoritative totals)  */
/*  use this, so the number a cashier reads can never drift from the number     */
/*  that gets charged and stored.                                               */
/* -------------------------------------------------------------------------- */

export type DiscountMode = "flat" | "percent";

export interface BillInput {
  /** Sum of unitPrice × qty for every line. */
  subtotal: number;
  /** Raw discount value — rupees when mode is "flat", percent when "percent". */
  discountValue?: number;
  discountMode?: DiscountMode;
  /** Shop tax rate as a percentage (0 = no tax). */
  taxRatePercent?: number;
  /** Delivery charge; only applied for delivery orders. */
  deliveryFee?: number;
}

export interface BillTotals {
  subtotal: number;
  /** Discount in rupees, already clamped so it can never exceed the subtotal. */
  discount: number;
  /** Tax charged on (subtotal − discount). */
  tax: number;
  fee: number;
  total: number;
}

/** Round to 2dp without floating-point drift (e.g. 0.1 + 0.2). */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Non-negative, finite money value. */
function money(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

/**
 * Resolve a discount to rupees.
 *
 * Percent mode is taken against the subtotal, and either mode is clamped to the
 * subtotal — a bill can be free, never negative.
 */
export function resolveDiscount(
  subtotal: number,
  discountValue: number | undefined,
  mode: DiscountMode = "flat",
): number {
  const sub = money(subtotal);
  const raw = money(discountValue);
  const rupees = mode === "percent" ? (sub * raw) / 100 : raw;
  return round2(Math.min(rupees, sub));
}

/**
 * Full bill breakdown.
 *
 * Order of operations matters and is deliberate: discount comes off first, then
 * tax applies to the discounted amount (what the customer actually pays for the
 * goods), then delivery is added on top untaxed.
 */
export function computeBillTotals(input: BillInput): BillTotals {
  const subtotal = round2(money(input.subtotal));
  const discount = resolveDiscount(subtotal, input.discountValue, input.discountMode);
  const taxable = round2(subtotal - discount);
  const rate = money(input.taxRatePercent);
  const tax = round2((taxable * rate) / 100);
  const fee = round2(money(input.deliveryFee));
  const total = round2(Math.max(0, taxable + tax + fee));

  return { subtotal, discount, tax, fee, total };
}
