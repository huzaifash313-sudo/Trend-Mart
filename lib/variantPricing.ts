/* -------------------------------------------------------------------------- */
/*  TrendMart — Shared Variant Pricing Helper                                  */
/*                                                                             */
/*  Single source of truth for computing the unit price of a product when a    */
/*  variant label (e.g. "Color: Red · Size: L") is selected. Supports two      */
/*  models that can be mixed freely:                                           */
/*                                                                             */
/*   1. Add-on model:  option.price_adj (+150)  → base + adjustment            */
/*   2. Daraz model:   option.price (absolute)  → overrides the base price     */
/*                                                                             */
/*  The selected absolute price wins as the starting point; every selected     */
/*  option's price_adj is then added on top. Never negative, always 2dp.       */
/* -------------------------------------------------------------------------- */

import type { VariantGroup } from "@/types";

export interface VariantSelectionPart {
  groupName: string;
  optionLabel: string;
}

/** Split a "Group: Label · Group2: Label2" string into parts. */
export function parseVariantLabel(variantLabel?: string): VariantSelectionPart[] {
  if (!variantLabel) return [];
  return variantLabel
    .split(/\s*·\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx > 0) {
        return {
          groupName: part.slice(0, idx).trim(),
          optionLabel: part.slice(idx + 1).trim(),
        };
      }
      return { groupName: "", optionLabel: part };
    });
}

/** Locate the matching option for a selection part within the variant groups. */
function findOption(groups: VariantGroup[], part: VariantSelectionPart) {
  for (const group of groups) {
    if (part.groupName && group.name !== part.groupName) continue;
    const opt = group.options.find((o) => o.label === part.optionLabel);
    if (opt) return opt;
  }
  return undefined;
}

/**
 * Compute the authoritative unit price for a product + selected variants.
 * - `basePrice`: the product's base price (product.price).
 * - `variants`: the product's variant groups.
 * - `variantLabel`: the selected combination, e.g. "Color: Red · Size: L".
 */
export function computeVariantPrice(
  basePrice: number,
  variants: VariantGroup[] | null | undefined,
  variantLabel?: string,
): number {
  let price = basePrice;
  const groups = variants ?? [];
  if (variantLabel && groups.length > 0) {
    for (const part of parseVariantLabel(variantLabel)) {
      const opt = findOption(groups, part);
      if (!opt) continue;
      // Absolute (Daraz) price overrides the starting point.
      if (typeof opt.price === "number" && Number.isFinite(opt.price)) {
        price = opt.price;
      }
      // Additive adjustment is always applied on top.
      if (typeof opt.price_adj === "number" && Number.isFinite(opt.price_adj)) {
        price += opt.price_adj;
      }
    }
  }
  return Math.max(0, Math.round(price * 100) / 100);
}

/** Range of possible unit prices across all variant options (for "Rs. X - Y"). */
export function variantPriceRange(
  basePrice: number,
  variants: VariantGroup[] | null | undefined,
): { min: number; max: number } {
  const groups = variants ?? [];
  if (groups.length === 0) {
    return { min: basePrice, max: basePrice };
  }
  let min = basePrice;
  let max = basePrice;
  for (const group of groups) {
    for (const opt of group.options) {
      const start = typeof opt.price === "number" ? opt.price : basePrice;
      const total = start + (opt.price_adj ?? 0);
      if (total < min) min = total;
      if (total > max) max = total;
    }
  }
  return { min: Math.max(0, min), max: Math.max(0, max) };
}
