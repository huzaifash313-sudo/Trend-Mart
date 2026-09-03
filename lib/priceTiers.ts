/* -------------------------------------------------------------------------- */
/*  TrendsMart — Quantity Price Tier Helpers                                    */
/*                                                                             */
/*  Two bulk-pricing modes, both optional and chosen per product:              */
/*                                                                             */
/*   1. Pack mode (default, "6 = Rs 1100"):                                    */
/*        `price` is the TOTAL for buying exactly `min_qty` items.             */
/*        The discount applies ONLY at the quantities the merchant set.        */
/*        In-between quantities are plain base-price singles, and above the    */
/*        top pack the system combines packs intelligently:                    */
/*          1 bottle = 200 · 6 bottles = 1100                                  */
/*          qty 5  → 5 × 200  = 1000   (no discount, as merchant intended)     */
/*          qty 6  → 1100                                                      */
/*          qty 7  → 1100 + 200 = 1300  (one 6-pack + one single)              */
/*          qty 12 → 2 × 1100 = 2200                                           */
/*        The engine never lets a pack cost more than singles.                 */
/*                                                                             */
/*   2. Unit mode ("6+ = Rs 183"):                                             */
/*        `price` is the PER-ITEM price for any quantity >= `min_qty`.         */
/*        The last tier whose min_qty the quantity reaches wins.               */
/* -------------------------------------------------------------------------- */

import type { PriceTier } from "@/types";

export type TierMode = "pack" | "unit";

/** Sort, validate and dedupe tiers (highest min_qty wins on collision). */
export function normalizeTiers(tiers: PriceTier[] | null | undefined): PriceTier[] {
  if (!Array.isArray(tiers)) return [];
  const cleaned = tiers
    .map((t) => ({
      min_qty: Math.max(1, Math.round(Number(t?.min_qty) || 0)),
      price: Number(t?.price),
      mode: t?.mode === "unit" ? ("unit" as const) : ("pack" as const),
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

/** The mode in effect for a tier list ("pack" when not specified / mixed). */
export function tierMode(tiers: PriceTier[] | null | undefined): TierMode {
  const sorted = normalizeTiers(tiers);
  if (sorted.length === 0) return "pack";
  // Any explicitly-unit tier wins — a merchant toggling the editor applies
  // the mode to every tier, so mixed lists only happen pre-toggle.
  return sorted.some((t) => t.mode === "unit") ? "unit" : "pack";
}

/** Pack mode: best combination of packs to buy exactly `qty` items. */
function packTotal(basePrice: number, tiers: PriceTier[], qty: number): number {
  const base = Math.max(0, Number(basePrice) || 0);
  // A single at base price is always available (falls back to base × qty).
  const items: { qty: number; total: number }[] = [{ qty: 1, total: base }];
  for (const t of tiers) items.push({ qty: t.min_qty, total: t.price });

  const dp = new Array<number>(qty + 1).fill(Infinity);
  dp[0] = 0;
  for (let q = 1; q <= qty; q++) {
    for (const it of items) {
      if (it.qty <= q) {
        const cand = it.total + dp[q - it.qty];
        if (cand < dp[q]) dp[q] = cand;
      }
    }
  }
  return Number.isFinite(dp[qty]) ? Math.round(dp[qty]) : Math.round(base * qty);
}

/** Unit mode: per-item price for `qty`, last applicable tier wins. */
function unitPrice(basePrice: number, tiers: PriceTier[], qty: number): number {
  let unit = Math.max(0, Number(basePrice) || 0);
  for (const t of tiers) {
    if (qty >= t.min_qty) unit = t.price;
  }
  return unit;
}

/**
 * TOTAL price for buying `quantity` items.
 * - Pack mode: exact tier totals at the set quantities; elsewhere the
 *   cheapest combination of packs (a pack is only used when it actually
 *   saves money). Below the first tier it's plain base × qty.
 * - Unit mode: per-unit price × qty using the last tier that applies.
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

  if (tierMode(sorted) === "unit") {
    return Math.round(unitPrice(base, sorted, qty) * qty);
  }
  return packTotal(base, sorted, qty);
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
  const sorted = normalizeTiers(tiers);
  const mode = tierMode(sorted);
  return sorted.map((t) => {
    const price = `Rs ${Math.round(t.price).toLocaleString("en-PK")}`;
    if (mode === "unit") {
      return t.min_qty === 1 ? `1+ = ${price} each` : `${t.min_qty}+ = ${price} each`;
    }
    return t.min_qty === 1 ? `1 = ${price}` : `${t.min_qty}-pack = ${price}`;
  });
}

/** Pool pack deals across mixed flavours of the same product (same unit price). */
export function tierPoolKey(productId: string, unitPrice: number): string {
  return `${productId}::${Math.round((Number(unitPrice) || 0) * 100)}`;
}

export function applyPooledTierPrices<
  T extends {
    productId: string;
    quantity: number;
    price: number;
    basePrice?: number;
    priceTiers?: PriceTier[] | null;
  },
>(items: T[]): T[] {
  const poolQty = new Map<string, { qty: number; base: number; tiers: PriceTier[] | null | undefined }>();
  for (const item of items) {
    if (!hasPriceTiers(item.priceTiers)) continue;
    const base = item.basePrice ?? item.price;
    const key = tierPoolKey(item.productId, base);
    const prev = poolQty.get(key);
    poolQty.set(key, {
      qty: (prev?.qty ?? 0) + item.quantity,
      base,
      tiers: item.priceTiers,
    });
  }

  const remaining = new Map<string, { money: number; units: number }>();
  for (const [key, pool] of poolQty) {
    remaining.set(key, {
      money: priceForQuantity(pool.base, pool.tiers, pool.qty),
      units: pool.qty,
    });
  }

  const lastIndexByKey = new Map<string, number>();
  items.forEach((item, index) => {
    if (!hasPriceTiers(item.priceTiers)) return;
    const base = item.basePrice ?? item.price;
    lastIndexByKey.set(tierPoolKey(item.productId, base), index);
  });

  return items.map((item, index) => {
    if (!hasPriceTiers(item.priceTiers)) return item;
    const base = item.basePrice ?? item.price;
    const key = tierPoolKey(item.productId, base);
    const rem = remaining.get(key);
    if (!rem || rem.units <= 0) return item;
    const isLast = lastIndexByKey.get(key) === index;
    const lineTotal = isLast
      ? rem.money
      : Math.round((rem.money / rem.units) * item.quantity);
    rem.money -= lineTotal;
    rem.units -= item.quantity;
    const unit = item.quantity > 0 ? lineTotal / item.quantity : base;
    if (unit === item.price) return item;
    return { ...item, price: unit };
  });
}

/** Line totals after pooling pack deals across mixed flavours of one product. */
export function computePooledLineTotals<
  T extends {
    id: string;
    productId: string;
    quantity: number;
    price: number;
    basePrice?: number;
    priceTiers?: PriceTier[] | null;
  },
>(items: T[]): Map<string, number> {
  const pooled = applyPooledTierPrices(items);
  const map = new Map<string, number>();
  for (const item of pooled) {
    map.set(item.id, Math.round(item.price * item.quantity));
  }
  return map;
}

export function tierModeHint(tiers: PriceTier[] | null | undefined): string {
  if (tierMode(tiers) === "unit") {
    return "Per-unit pricing — the price applies to every item once the quantity reaches the tier.";
  }
  return "Pack pricing — discount applies only at the exact pack quantities you set. Other quantities combine packs + singles automatically.";
}
