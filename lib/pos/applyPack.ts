/* Apply category pack UX + stock defaults (single source of truth). */

import {
  type PosCategoryPack,
  type PosModuleId,
  type PosSettings,
} from "@/lib/pos/types";
import { applyPackStockDefaults } from "@/lib/pos/stockRules";

/** Apply pack defaults onto settings (merchant can still override). */
export function applyPackDefaults(
  pack: PosCategoryPack,
  current: PosSettings,
): PosSettings {
  const next = { ...current, pack };
  const ensure = (mods: PosModuleId[]) => {
    const set = new Set([...current.modules, ...mods]);
    return [...set] as PosModuleId[];
  };
  const core = [
    "queue",
    "counter",
    "stock",
    "cash",
    "reports",
    "customers",
    "expenses",
    "credit",
  ] as PosModuleId[];
  const foodish = [...core, "kitchen", "recipes"] as PosModuleId[];
  const stock = applyPackStockDefaults(pack, current);

  switch (pack) {
    case "grocery":
      return {
        ...next,
        ...stock,
        barcode_enabled: false,
        decimal_qty: true,
        token_mode: false,
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
        modules: ensure(core),
      };
    case "pharmacy":
      return {
        ...next,
        ...stock,
        barcode_enabled: true,
        decimal_qty: false,
        token_mode: false,
        prefer_customer_phone: true,
        kitchen_enabled: false,
        counter_layout: "excel",
        modules: ensure(core),
      };
    case "food":
      return {
        ...next,
        ...stock,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: true,
        prefer_customer_phone: false,
        kitchen_enabled: true,
        counter_layout: "menu",
        modules: ensure(foodish),
      };
    case "cafe":
      return {
        ...next,
        ...stock,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: true,
        prefer_customer_phone: false,
        kitchen_enabled: true,
        counter_layout: "menu",
        modules: ensure(foodish),
      };
    case "bakery":
      return {
        ...next,
        ...stock,
        barcode_enabled: false,
        decimal_qty: true,
        token_mode: true,
        prefer_customer_phone: false,
        kitchen_enabled: true,
        counter_layout: "excel",
        modules: ensure(foodish),
      };
    case "fashion":
      return {
        ...next,
        ...stock,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: false,
        // Exchanges/returns are common in apparel — capture the buyer's phone by default.
        prefer_customer_phone: true,
        kitchen_enabled: false,
        counter_layout: "excel",
        // One-off sizes/pieces — don't let the till sell a piece that's already gone.
        block_oversell: true,
        modules: ensure(core),
      };
    case "beauty":
      return {
        ...next,
        ...stock,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: false,
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
        // Cosmetics genuinely expire — turn on the expiry tracking stockRules.ts
        // already sizes a 60-day warning window for.
        track_expiry: true,
        modules: ensure(core),
      };
    case "electronics":
      return {
        ...next,
        ...stock,
        barcode_enabled: true,
        decimal_qty: false,
        token_mode: false,
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
        modules: ensure(core),
      };
    case "hardware":
      return {
        ...next,
        ...stock,
        barcode_enabled: false,
        decimal_qty: true,
        token_mode: false,
        // Geysers/fittings often carry warranty — the buyer's phone matters here.
        prefer_customer_phone: true,
        kitchen_enabled: false,
        counter_layout: "excel",
        // Higher-value items — don't sell past what's actually on the shelf.
        block_oversell: true,
        modules: ensure(core),
      };
    case "services":
      return {
        ...next,
        ...stock,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: false,
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
        modules: ensure([
          "queue",
          "counter",
          "cash",
          "reports",
          "customers",
          "expenses",
          "credit",
        ]).filter((m) => m !== "stock" && m !== "recipes"),
      };
    default:
      return {
        ...next,
        ...stock,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: false,
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
        modules: ensure(core),
      };
  }
}
