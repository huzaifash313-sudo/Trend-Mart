/* -------------------------------------------------------------------------- */
/*  Combo SKUs: Flavour × Size (and any other groups) as independently priced  */
/*  / stocked rows. Stored inside products.variants as a reserved group so no  */
/*  extra DB column is required.                                               */
/* -------------------------------------------------------------------------- */

import type { ProductVariant, VariantGroup } from "@/types";
import {
  SKU_MATRIX_GROUP,
  computeVariantPrice,
  customerVariantGroups,
  isSkuMatrixGroup,
  parseVariantLabel,
} from "@/lib/variantPricing";

export { SKU_MATRIX_GROUP, customerVariantGroups, isSkuMatrixGroup };

export function comboCount(groups: VariantGroup[] | null | undefined): number {
  const visible = customerVariantGroups(groups);
  if (visible.length === 0) return 0;
  return visible.reduce((acc, g) => acc * Math.max(g.options.filter((o) => o.label.trim()).length, 1), 1);
}

export function buildVariantLabel(
  parts: Array<{ groupName: string; optionLabel: string }>,
): string {
  return parts
    .filter((p) => p.groupName && p.optionLabel)
    .map((p) => `${p.groupName}: ${p.optionLabel}`)
    .join(" · ");
}

export interface ComboRow {
  label: string;
  parts: Array<{ groupName: string; optionLabel: string; option: ProductVariant }>;
}

function cartesian<T>(lists: T[][]): T[][] {
  if (lists.length === 0) return [];
  return lists.reduce<T[][]>(
    (acc, list) => acc.flatMap((prefix) => list.map((item) => [...prefix, item])),
    [[]],
  );
}

/** Every Flavour × Size (etc.) row. Caps at 48 so the editor stays usable. */
export const MAX_COMBO_ROWS = 48;

export function expandComboRows(groups: VariantGroup[] | null | undefined): ComboRow[] {
  const visible = customerVariantGroups(groups);
  if (visible.length === 0) return [];
  const lists = visible.map((g) =>
    g.options
      .filter((o) => o.label.trim())
      .map((option) => ({ groupName: g.name, optionLabel: option.label, option })),
  );
  if (lists.some((l) => l.length === 0)) return [];
  const combos = cartesian(lists);
  return combos.slice(0, MAX_COMBO_ROWS).map((parts) => ({
    parts,
    label: buildVariantLabel(parts),
  }));
}

function skuGroup(groups: VariantGroup[] | null | undefined): VariantGroup | undefined {
  return (groups ?? []).find((g) => isSkuMatrixGroup(g.name));
}

export function findSku(
  groups: VariantGroup[] | null | undefined,
  label: string | undefined,
): ProductVariant | undefined {
  if (!label) return undefined;
  const g = skuGroup(groups);
  if (!g) return undefined;
  return g.options.find((o) => o.label === label);
}

/** Option-level sold out (e.g. whole Onion flavour) OR this exact combo. */
export function isComboUnavailable(
  groups: VariantGroup[] | null | undefined,
  label: string | undefined,
): boolean {
  if (!label) return false;
  const sku = findSku(groups, label);
  if (sku?.is_available === false) return true;
  if (typeof sku?.stock === "number" && sku.stock <= 0) return true;

  const visible = customerVariantGroups(groups);
  for (const part of parseVariantLabel(label)) {
    const group = visible.find((g) =>
      part.groupName ? g.name === part.groupName : true,
    );
    const opt = group?.options.find((o) => o.label === part.optionLabel);
    if (opt?.is_available === false) return true;
    if (typeof opt?.stock === "number" && opt.stock <= 0) return true;
  }
  return false;
}

/** True when every combo that includes this option is sold out. */
export function isOptionFullySoldOut(
  groups: VariantGroup[] | null | undefined,
  groupName: string,
  optionLabel: string,
): boolean {
  const visible = customerVariantGroups(groups);
  const group = visible.find((g) => g.name === groupName);
  const opt = group?.options.find((o) => o.label === optionLabel);
  if (opt?.is_available === false) return true;

  const rows = expandComboRows(groups).filter((row) =>
    row.parts.some((p) => p.groupName === groupName && p.optionLabel === optionLabel),
  );
  if (rows.length === 0) return false;
  return rows.every((row) => isComboUnavailable(groups, row.label));
}

export function computeComboPrice(
  basePrice: number,
  groups: VariantGroup[] | null | undefined,
  label?: string,
): number {
  return computeVariantPrice(basePrice, groups, label);
}

export function upsertSku(
  groups: VariantGroup[],
  label: string,
  patch: Partial<ProductVariant>,
): VariantGroup[] {
  const next = groups.map((g) => ({
    ...g,
    options: g.options.map((o) => ({ ...o })),
  }));
  let matrix = next.find((g) => isSkuMatrixGroup(g.name));
  if (!matrix) {
    matrix = { name: SKU_MATRIX_GROUP, options: [] };
    next.push(matrix);
  }
  const idx = matrix.options.findIndex((o) => o.label === label);
  const current = idx >= 0 ? matrix.options[idx]! : { label, is_available: true };
  const merged: ProductVariant = { ...current, ...patch, label };
  if (idx >= 0) matrix.options[idx] = merged;
  else matrix.options.push(merged);

  const meaningful = matrix.options.filter((o) => skuHasOverride(o));
  if (meaningful.length === 0) {
    return next.filter((g) => !isSkuMatrixGroup(g.name));
  }
  matrix.options = meaningful;
  return next;
}

function skuHasOverride(o: ProductVariant): boolean {
  if (o.is_available === false) return true;
  if (typeof o.price === "number" && Number.isFinite(o.price)) return true;
  if (typeof o.original_price === "number" && Number.isFinite(o.original_price)) return true;
  if (typeof o.price_adj === "number" && o.price_adj !== 0) return true;
  if (typeof o.stock === "number") return true;
  if (typeof o.discount_pct === "number" && o.discount_pct > 0) return true;
  return false;
}

/** Disable / enable every combo that includes this option (whole flavour). */
export function setOptionAvailable(
  groups: VariantGroup[],
  groupName: string,
  optionLabel: string,
  available: boolean,
): VariantGroup[] {
  return groups.map((g) => {
    if (isSkuMatrixGroup(g.name) || g.name !== groupName) return g;
    return {
      ...g,
      options: g.options.map((o) =>
        o.label === optionLabel ? { ...o, is_available: available } : o,
      ),
    };
  });
}

export function stripEmptySkuMatrix(groups: VariantGroup[]): VariantGroup[] {
  return groups.filter((g) => !isSkuMatrixGroup(g.name) || g.options.some(skuHasOverride));
}
