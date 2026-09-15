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
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
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
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
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
