/**
 * Category-pack stock discipline — each shop type gets a sensible default nizaam.
 * Merchants can still override flags in POS Setup.
 * Soft default: warn on low/negative stock; never hard-require barcode/expiry/batch.
 */

import type { PosCategoryPack, PosSettings } from "@/lib/pos/types";
import type { Product } from "@/types";

export type StockHealthFilter =
  | "all"
  | "low"
  | "out"
  | "untracked"
  | "expiring"
  | "ok";

export type PosStockReason = "sale" | "restock" | "adjust" | "damage" | "refund" | "recipe";

export interface PosPackStockProfile {
  /** When true, refuse counter sale / add when qty would exceed on-hand */
  block_oversell: boolean;
  /** Toast when adding a low-stock item */
  warn_low_on_add: boolean;
  /** Show batch / lot fields in inventory (optional — never required) */
  track_batch: boolean;
  /** Show expiry date fields + expiring alerts (optional) */
  track_expiry: boolean;
  /** Days ahead to flag as "expiring soon" */
  expiry_warn_days: number;
  /** Suggested low-stock threshold when applying pack */
  low_stock_threshold: number;
  /** Unit label in UI */
  unit_label: string;
  /** Quick restock chips */
  restock_presets: number[];
  /** Bill / stock note hint */
  note_hint: string;
  /** Short blurb for Setup / Inventory header */
  blurb: string;
}

export const POS_STOCK_PROFILES: Record<PosCategoryPack, PosPackStockProfile> = {
  general: {
    block_oversell: false,
    warn_low_on_add: true,
    track_batch: false,
    track_expiry: false,
    expiry_warn_days: 30,
    low_stock_threshold: 5,
    unit_label: "pcs",
    restock_presets: [5, 10, 20, 50],
    note_hint: "Stock note / reason",
    blurb: "Track qty optional · warn on low/negative · barcode/expiry optional",
  },
  grocery: {
    block_oversell: false,
    warn_low_on_add: true,
    track_batch: false,
    track_expiry: false,
    expiry_warn_days: 14,
    low_stock_threshold: 10,
    unit_label: "pcs/kg",
    restock_presets: [10, 25, 50, 100],
    note_hint: "Batch / supplier / damage note",
    blurb: "Kiryana: decimal qty · soft stock warns · batch/expiry optional",
  },
  pharmacy: {
    block_oversell: false,
    warn_low_on_add: true,
    track_batch: false,
    track_expiry: false,
    expiry_warn_days: 90,
    low_stock_threshold: 8,
    unit_label: "pcs",
    restock_presets: [5, 10, 20, 40],
    note_hint: "Batch / Rx / return note",
    blurb: "Pharmacy: Excel billing · barcode/expiry optional · soft stock",
  },
  fashion: {
    block_oversell: false,
    warn_low_on_add: true,
    track_batch: false,
    track_expiry: false,
    expiry_warn_days: 30,
    low_stock_threshold: 3,
    unit_label: "pcs",
    restock_presets: [2, 5, 10, 20],
    note_hint: "Size / color / damage note",
    blurb: "Boutique: variants · soft stock · barcode optional",
  },
  beauty: {
    block_oversell: false,
    warn_low_on_add: true,
    track_batch: false,
    track_expiry: false,
    expiry_warn_days: 60,
    low_stock_threshold: 4,
    unit_label: "pcs",
    restock_presets: [3, 6, 12, 24],
    note_hint: "Shade / batch / expiry note",
    blurb: "Cosmetics: soft stock · batch/expiry optional",
  },
  electronics: {
    block_oversell: false,
    warn_low_on_add: true,
    track_batch: false,
    track_expiry: false,
    expiry_warn_days: 30,
    low_stock_threshold: 2,
    unit_label: "pcs",
    restock_presets: [1, 2, 5, 10],
    note_hint: "IMEI / serial / warranty note",
    blurb: "Mobiles: serial notes · soft stock · barcode optional",
  },
  food: {
    block_oversell: false,
    warn_low_on_add: true,
    track_batch: false,
    track_expiry: false,
    expiry_warn_days: 7,
    low_stock_threshold: 5,
    unit_label: "portions",
    restock_presets: [5, 10, 20, 40],
    note_hint: "Prep / wastage note",
    blurb: "Restaurant: menu + recipes · soft stock · kitchen KOT",
  },
  cafe: {
    block_oversell: false,
    warn_low_on_add: true,
    track_batch: false,
    track_expiry: false,
    expiry_warn_days: 7,
    low_stock_threshold: 5,
    unit_label: "portions",
    restock_presets: [5, 10, 20, 30],
    note_hint: "Milk / syrup wastage note",
    blurb: "Cafe: menu + recipes · soft stock",
  },
  bakery: {
    block_oversell: false,
    warn_low_on_add: true,
    track_batch: false,
    track_expiry: false,
    expiry_warn_days: 3,
    low_stock_threshold: 8,
    unit_label: "pcs",
    restock_presets: [6, 12, 24, 48],
    note_hint: "Bake batch / wastage",
    blurb: "Bakery: recipes + soft stock · expiry optional",
  },
  services: {
    block_oversell: false,
    warn_low_on_add: false,
    track_batch: false,
    track_expiry: false,
    expiry_warn_days: 30,
    low_stock_threshold: 0,
    unit_label: "—",
    restock_presets: [],
    note_hint: "Job / parts note",
    blurb: "Services: inventory usually off · quick bill",
  },
};

export function packStockProfile(pack: PosCategoryPack): PosPackStockProfile {
  return POS_STOCK_PROFILES[pack] ?? POS_STOCK_PROFILES.general;
}

/** Merge pack stock discipline onto settings (used by applyPackDefaults). */
export function applyPackStockDefaults(
  pack: PosCategoryPack,
  current: PosSettings,
): Pick<
  PosSettings,
  | "block_oversell"
  | "warn_low_on_add"
  | "track_batch"
  | "track_expiry"
  | "low_stock_threshold"
> {
  const p = packStockProfile(pack);
  return {
    block_oversell: p.block_oversell,
    warn_low_on_add: p.warn_low_on_add,
    track_batch: p.track_batch,
    track_expiry: p.track_expiry,
    low_stock_threshold: p.low_stock_threshold,
  };
}

export function daysUntilExpiry(expiryDate?: string | null): number | null {
  if (!expiryDate) return null;
  const t = Date.parse(expiryDate);
  if (!Number.isFinite(t)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((t - today.getTime()) / 86_400_000);
}

export function isExpiringSoon(
  expiryDate: string | null | undefined,
  warnDays: number,
): boolean {
  const d = daysUntilExpiry(expiryDate);
  if (d == null) return false;
  return d <= warnDays;
}

export function isExpired(expiryDate: string | null | undefined): boolean {
  const d = daysUntilExpiry(expiryDate);
  return d != null && d < 0;
}

export function productStockBucket(
  p: Product,
  lowThreshold: number,
  warnDays: number,
): StockHealthFilter {
  if (p.stock_qty == null) return "untracked";
  if (p.stock_qty <= 0 || p.is_available === false) return "out";
  if (isExpired(p.expiry_date) || isExpiringSoon(p.expiry_date, warnDays)) {
    return "expiring";
  }
  if (p.stock_qty <= (p.reorder_level ?? lowThreshold)) return "low";
  return "ok";
}

export interface StockHealthSummary {
  total: number;
  tracked: number;
  untracked: number;
  low: number;
  out: number;
  expiring: number;
  ok: number;
}

export function summarizeStockHealth(
  products: Product[],
  lowThreshold: number,
  warnDays: number,
): StockHealthSummary {
  const summary: StockHealthSummary = {
    total: products.length,
    tracked: 0,
    untracked: 0,
    low: 0,
    out: 0,
    expiring: 0,
    ok: 0,
  };
  for (const p of products) {
    const b = productStockBucket(p, lowThreshold, warnDays);
    if (b === "untracked") summary.untracked += 1;
    else {
      summary.tracked += 1;
      if (b === "low") summary.low += 1;
      else if (b === "out") summary.out += 1;
      else if (b === "expiring") summary.expiring += 1;
      else summary.ok += 1;
    }
  }
  return summary;
}

export function cartQtyForProduct(
  cart: { productId: string; qty: number; custom?: boolean }[],
  productId: string,
): number {
  return cart
    .filter((l) => !l.custom && l.productId === productId)
    .reduce((s, l) => s + (Number(l.qty) || 0), 0);
}

export type StockGateResult =
  | { ok: true; warn?: string }
  | { ok: false; error: string };

/**
 * Counter / checkout gate for tracked SKUs.
 * Soft default: warn and allow (including negative / marked OOS).
 * Hard block only when settings.block_oversell === true.
 */
export function gateStockAdd(params: {
  product: Product;
  addQty: number;
  alreadyInCart: number;
  settings: Pick<PosSettings, "block_oversell" | "warn_low_on_add" | "low_stock_threshold">;
}): StockGateResult {
  const { product, addQty, alreadyInCart, settings } = params;
  const hard = settings.block_oversell === true;

  if (product.is_available === false) {
    if (hard) {
      return { ok: false, error: `${product.name} is marked out of stock` };
    }
    return {
      ok: true,
      warn: `${product.name}: marked out of stock — selling anyway`,
    };
  }

  if (product.stock_qty == null) {
    return { ok: true };
  }

  const onHand = Number(product.stock_qty) || 0;
  const need = Math.round((alreadyInCart + addQty) * 100) / 100;

  if (need > onHand + 0.0001) {
    if (hard) {
      return {
        ok: false,
        error: `${product.name}: only ${onHand} in stock (bill already has ${alreadyInCart})`,
      };
    }
    return {
      ok: true,
      warn: `${product.name}: stock ${onHand} — will go negative`,
    };
  }

  const remaining = onHand - need;
  const thresh = product.reorder_level ?? settings.low_stock_threshold;
  if (settings.warn_low_on_add && remaining <= thresh) {
    return {
      ok: true,
      warn: `${product.name}: low after sale — ${Math.round(remaining * 100) / 100} left`,
    };
  }
  return { ok: true };
}
