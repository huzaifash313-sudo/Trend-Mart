/* -------------------------------------------------------------------------- */
/*  TrendMart — Quantity Price Tier Helpers                                    */
/*                                                                             */
/*  Bulk/quantity pricing: a merchant sets pack prices like                    */
/*  "1 = Rs 200 · 6 = Rs 1100" (DEW-style: a 6-pack costs 1100, not 1200).     */
/*  The system auto-fills the quantities in between with a linear ramp on the  */
/*  TOTAL price, so the customer always gets a fair price at any quantity.     */
/*  Above the last breakpoint the pack's per-unit rate extends.                */
/* -------------------------------------------------------------------------- */

import type { PriceTier } from "@/types";

/** Sort, validate and dedupe tiers (highest min_qty wins on collision). */
export function normalizeTiers(tiers: PriceTier[] | null | undefined): PriceTier[] {
  if (!Array.isArray(tiers)) return [];
  const cleaned = tiers
    .map((t) => ({
      min_qty: Math.max(1, Math.round(Number(t?.min_qty) || 0)),
      price: Number(t?.price),
    }))
    .filter(
      (t) =>
        Number.isFinite(t.price) &&
        t.price > 0 &&
        Number.isFinite(t.min_qty) &&
        t.min_qty >= 1,
    )
    .sort((a, b) => a.min_qty - b.min_qty);

  const byQty = new Map<number, PriceTier>();
  for (const t of cleaned) byQty.set(t.min_qty, t);
  return [...byQty.values()].sort((a, b) => a.min_qty - b.min_qty);
}

export function hasPriceTiers(tiers: PriceTier[] | null | undefined): boolean {
  return normalizeTiers(tiers).length > 0;
}

/**
 * TOTAL price for buying `quantity` items.
 * - Below the first tier → base price × qty.
 * - Between tiers → linear interpolation of the pack total.
 * - At/above the last tier → the last tier's per-unit rate extends.
 */
export function priceForQuantity(
  basePrice: number,
  tiers: PriceTier[] | null | undefined,
  quantity: number,
): number {
  const sorted = normalizeTiers(tiers);
  const qty = Math.max(1, Math.round(quantity) || 1);
  const base = Math.max(0, Number(basePrice) || 0);
  if (sorted.length === 0) return Math.round(base * qty);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (qty < first.min_qty) return Math.round(base * qty);
  if (qty >= last.min_qty) {
    const perUnit = last.price / last.min_qty;
    return Math.max(0, Math.round(perUnit * qty));
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (qty >= a.min_qty && qty < b.min_qty) {
      const span = b.min_qty - a.min_qty;
      const t = span > 0 ? (qty - a.min_qty) / span : 1;
      const total = a.price + (b.price - a.price) * t;
      return Math.max(0, Math.round(total));
    }
  }
  return Math.max(0, Math.round(last.price));
}

/** Effective per-unit price for a quantity (total ÷ qty). */
export function unitPriceForQuantity(
  basePrice: number,
  tiers: PriceTier[] | null | undefined,
  quantity: number,
): number {
  const qty = Math.max(1, Math.round(quantity) || 1);
  return Math.round(priceForQuantity(basePrice, tiers, qty) / qty);
}

/** Preview chips like "1 = Rs 200" / "6-pack = Rs 1100" for defined breakpoints. */
export function tierPreviewLabels(tiers: PriceTier[] | null | undefined): string[] {
  return normalizeTiers(tiers).map((t) => {
    const price = `Rs ${Math.round(t.price).toLocaleString("en-PK")}`;
    return t.min_qty === 1 ? `1 = ${price}` : `${t.min_qty}-pack = ${price}`;
  });
}
