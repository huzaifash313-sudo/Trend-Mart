/* -------------------------------------------------------------------------- */
/*  TrendsMart — Shared Variant Pricing Helper                                  */
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

import type { ProductVariant, VariantGroup } from "@/types";

/** Reserved variants[] group for Flavour×Size combo prices / sold-out flags. */
export const SKU_MATRIX_GROUP = "__sku_matrix__";

export function isSkuMatrixGroup(name: string | undefined): boolean {
  return (name ?? "").trim() === SKU_MATRIX_GROUP;
}

export function customerVariantGroups(
  groups: VariantGroup[] | null | undefined,
): VariantGroup[] {
  return (groups ?? []).filter((g) => !isSkuMatrixGroup(g.name) && g.options.length > 0);
}

function findSkuOption(
  groups: VariantGroup[],
  variantLabel?: string,
): ProductVariant | undefined {
  if (!variantLabel) return undefined;
  const matrix = groups.find((g) => isSkuMatrixGroup(g.name));
  return matrix?.options.find((o) => o.label === variantLabel);
}

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
  for (const group of customerVariantGroups(groups)) {
    if (part.groupName && group.name !== part.groupName) continue;
    const opt = group.options.find((o) => o.label === part.optionLabel);
    if (opt) return opt;
  }
  return undefined;
}

/**
 * Effective unit price for a single option in isolation: absolute `price`
 * wins, then any `price_adj` is added on top. Used by the variant editor to
 * preview per-option pricing / % OFF before anything is saved.
 */
export function effectiveOptionPrice(
  basePrice: number,
  opt: Pick<ProductVariant, "price" | "price_adj">,
): number {
  let p =
    typeof opt.price === "number" && Number.isFinite(opt.price) ? opt.price : basePrice;
  if (typeof opt.price_adj === "number" && Number.isFinite(opt.price_adj)) {
    p += opt.price_adj;
  }
  return Math.max(0, Math.round(p * 100) / 100);
}

/**
 * Original ("before discount") price for a single option, or `null` when no
 * discount applies to it. Resolution order:
 *   1. Explicit per-option `original_price` (> effective price).
 *   2. Per-option `discount_pct` → derived original = round(price/(1-pct/100)).
 *   3. Product-level original scaled by the option's price delta from base.
 */
export function effectiveOptionOriginal(
  basePrice: number,
  baseOriginal: number | null | undefined,
  opt: ProductVariant,
): number | null {
  const effective = effectiveOptionPrice(basePrice, opt);

  if (
    typeof opt.original_price === "number" &&
    Number.isFinite(opt.original_price) &&
    opt.original_price > effective
  ) {
    return Math.round(opt.original_price * 100) / 100;
  }

  if (
    typeof opt.discount_pct === "number" &&
    Number.isFinite(opt.discount_pct) &&
    opt.discount_pct > 0 &&
    opt.discount_pct < 100
  ) {
    const derived = Math.round(effective / (1 - opt.discount_pct / 100));
    return derived > effective ? derived : null;
  }

  if (baseOriginal != null && Number.isFinite(baseOriginal) && baseOriginal > basePrice) {
    const ratio = baseOriginal / basePrice;
    const scaled = Math.round(effective * ratio);
    return scaled > effective ? scaled : null;
  }

  return null;
}

/**
 * Compute the authoritative original ("before discount") price for a product
 * + selected variant combination. Returns `null` when no discount applies to
 * the selected combo (so callers can hide the badge / strikethrough safely).
 * Resolution mirrors `computeVariantPrice` (absolute price wins, then every
 * selected option's `price_adj` is added) while `effectiveOptionOriginal()`
 * decides each option's own original price.
 */
export function computeVariantOriginalPrice(
  basePrice: number,
  baseOriginalPrice: number | null | undefined,
  variants: VariantGroup[] | null | undefined,
  variantLabel?: string,
): number | null {
  const groups = variants ?? [];
  if (!variantLabel || groups.length === 0) {
    return baseOriginalPrice != null &&
      Number.isFinite(baseOriginalPrice) &&
      baseOriginalPrice > basePrice
      ? baseOriginalPrice
      : null;
  }

  const effective = computeVariantPrice(basePrice, groups, variantLabel);
  const sku = findSkuOption(groups, variantLabel);
  if (
    sku &&
    typeof sku.original_price === "number" &&
    Number.isFinite(sku.original_price) &&
    sku.original_price > effective
  ) {
    return Math.round(sku.original_price * 100) / 100;
  }
  let original: number | null = null;
  for (const part of parseVariantLabel(variantLabel)) {
    const opt = findOption(groups, part);
    if (!opt) continue;
    const optOriginal = effectiveOptionOriginal(basePrice, baseOriginalPrice, opt);
    if (optOriginal != null) original = optOriginal;
  }
  // Base fallback when no selected option carries its own original.
  if (original == null) {
    original =
      baseOriginalPrice != null && Number.isFinite(baseOriginalPrice) && baseOriginalPrice > effective
        ? baseOriginalPrice
        : null;
  }
  return original != null && original > effective ? original : null;
}

/**
 * One-call helper: unit price + original price for a product/variant combo.
 * `originalPrice` is `null` when there is no discount on the selected combo —
 * feed both into `getProductDiscount()` to also honour `deal_expires_at`.
 */
export function computeVariantPricing(
  basePrice: number,
  baseOriginalPrice: number | null | undefined,
  variants: VariantGroup[] | null | undefined,
  variantLabel?: string,
): { price: number; originalPrice: number | null } {
  return {
    price: computeVariantPrice(basePrice, variants, variantLabel),
    originalPrice: computeVariantOriginalPrice(
      basePrice,
      baseOriginalPrice,
      variants,
      variantLabel,
    ),
  };
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
  const groups = variants ?? [];
  const sku = findSkuOption(groups, variantLabel);
  if (sku && typeof sku.price === "number" && Number.isFinite(sku.price)) {
    const adj = typeof sku.price_adj === "number" && Number.isFinite(sku.price_adj) ? sku.price_adj : 0;
    return Math.max(0, Math.round((sku.price + adj) * 100) / 100);
  }

  let price = basePrice;
  const pickFrom = customerVariantGroups(groups);
  if (variantLabel && pickFrom.length > 0) {
    for (const part of parseVariantLabel(variantLabel)) {
      const opt = findOption(pickFrom, part);
      if (!opt) continue;
      if (typeof opt.price === "number" && Number.isFinite(opt.price)) {
        price = opt.price;
      }
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
  const combos = groups.filter((g) => !isSkuMatrixGroup(g.name));
  if (combos.length === 0) {
    return { min: basePrice, max: basePrice };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  const visible = customerVariantGroups(groups);
  const walk = (gi: number, labelParts: string[]) => {
    if (gi >= visible.length) {
      const label = labelParts.join(" · ");
      const p = computeVariantPrice(basePrice, groups, label);
      if (p < min) min = p;
      if (p > max) max = p;
      return;
    }
    const g = visible[gi]!;
    for (const opt of g.options) {
      if (!opt.label.trim() || opt.is_available === false) continue;
      walk(gi + 1, [...labelParts, `${g.name}: ${opt.label}`]);
    }
  };
  walk(0, []);
  if (!Number.isFinite(min)) return { min: basePrice, max: basePrice };
  return { min: Math.max(0, min), max: Math.max(0, max) };
}
