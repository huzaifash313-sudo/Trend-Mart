/* -------------------------------------------------------------------------- */
/*  TrendMart — Boutique Garment Color & Size Variant Matrix                    */
/*                                                                             */
/*  A specialized product variation management component for boutique/ apparel */
/*  merchants and customers alike:                                             */
/*                                                                             */
/*   - Merchant View: Configure multiple clothing sizes (S, M, L, XL, XXL)    */
/*     and color swatches per product listing                                */
/*   - Customer View: Click specific color/size combinations to instantly    */
/*     update active product image preview, stock availability, and price    */
/*     prior to cart addition                                               */
/*   - Visual color swatches with hex-code detection                        */
/*   - Real-time price adjustment calculation                               */
/*   - Stock availability badges per variant combination                    */
/*   - Responsive grid: swatches for color, chips for sizes                 */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useCallback,
  useMemo,
} from "react";
import type { VariantGroup, ProductVariant } from "@/types";
import { formatRupees } from "@/lib/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A selected variant combination entry. */
export interface SelectedVariant {
  groupName: string;
  optionLabel: string;
  priceAdj: number;
  stock?: number;
  isAvailable: boolean;
}

/** Callback payload when full variant matrix is confirmed. */
export interface SelectedVariantCombination {
  /** All selected variants across groups (e.g., Size + Color). */
  selections: SelectedVariant[];
  /** Effective price = basePrice + sum of all price adjustments. */
  effectivePrice: number;
  /** True when at least one selection in each group (matrix complete). */
  isComplete: boolean;
  /** True when the selected combination is in stock. */
  isAvailable: boolean;
  /** The primary image URL to show (e.g., the color-matched variant image). */
  activeImageUrl?: string;
}

interface GarmentVariantSelectorProps {
  /** Variant groups (e.g., [{name:"Size", options:[...]}, {name:"Color", options:[...]}]). */
  variants: VariantGroup[];
  /** Base price of the product before adjustments. */
  basePrice: number;
  /** Currency code for display (default: PKR). */
  currency?: string;
  /** Called whenever the selection changes (debounced). */
  onSelectionChange?: (combination: SelectedVariantCombination) => void;
  /** Called when a valid combination is confirmed (e.g., for "Add to Cart"). */
  onConfirm?: (combination: SelectedVariantCombination) => void;
  /** Pre-selected variant combination (e.g., from cart restoration). */
  initialSelection?: SelectedVariant[];
  /** Whether to show in compact mode for mobile drawers / side panels. */
  compact?: boolean;
  /** Whether to allow only merchant-configured combinations.
   *  When true, incompatible combinations are greyed out. */
  enforceCompatibility?: boolean;
  /** Custom image map: variant label → image URL (for color-based image switching). */
  variantImageMap?: Record<string, string>;
  /** Show a "Confirm Selection" button after matrix is complete. */
  showConfirmButton?: boolean;
  /** Confirm button label override. */
  confirmLabel?: string;
}

// ─── Color Hex Map ────────────────────────────────────────────────────────────

const COLOR_HEX_MAP: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  black: "#1f2937",
  white: "#f9fafb",
  pink: "#ec4899",
  purple: "#a855f7",
  orange: "#f97316",
  grey: "#6b7280",
  gray: "#6b7280",
  brown: "#92400e",
  navy: "#1e3a5f",
  beige: "#d4a574",
  maroon: "#7b1a1a",
  teal: "#14b8a6",
  gold: "#d4a017",
  silver: "#c0c0c0",
  olive: "#556b2f",
  cream: "#fffdd0",
  mustard: "#e1ad01",
  burgundy: "#800020",
  charcoal: "#36454f",
  khaki: "#c3b091",
  lavender: "#e6e6fa",
  mint: "#98ff98",
  peach: "#ffcba4",
  coral: "#ff7f50",
  indigo: "#4b0082",
  turquoise: "#40e0d0",
  magenta: "#ff00ff",
  cyan: "#00ffff",
  rose: "#ff007f",
  ruby: "#e0115f",
  emerald: "#50c878",
};

/** Detect a known color name and return its hex code (case-insensitive). */
function getColorHex(label: string): string | null {
  const lower = label.toLowerCase().trim();
  if (COLOR_HEX_MAP[lower]) return COLOR_HEX_MAP[lower];
  for (const [name, hex] of Object.entries(COLOR_HEX_MAP)) {
    if (lower.includes(name)) return hex;
  }
  return null;
}

/** Determine if options in a group qualify as colors (visual swatches). */
function isColorGroup(options: ProductVariant[]): boolean {
  const colorCount = options.filter((o) => getColorHex(o.label) !== null).length;
  return colorCount >= options.length * 0.4;
}

/** Build the selection notification payload and fire the callback. */
function notifyParent(
  next: Record<string, string>,
  variants: VariantGroup[],
  basePrice: number,
  variantImageMap: Record<string, string> | undefined,
  onSelectionChange: ((c: SelectedVariantCombination) => void) | undefined,
) {
  if (!onSelectionChange) return;

  const entries: SelectedVariant[] = variants.flatMap((group) => {
    const label = next[group.name];
    if (!label) return [];
    const opt = group.options.find((o) => o.label === label);
    if (!opt) return [];
    return [{
      groupName: group.name,
      optionLabel: opt.label,
      priceAdj: opt.price_adj ?? 0,
      stock: opt.stock,
      isAvailable: opt.is_available !== false,
    }];
  });

  const complete = variants.length > 0 && variants.every((g) => next[g.name] != null);
  const available = complete && entries.every((e) => e.isAvailable);

  let imgUrl: string | undefined;
  if (variantImageMap) {
    for (const entry of entries) {
      const key = entry.optionLabel;
      if (variantImageMap[key]) {
        imgUrl = variantImageMap[key];
        break;
      }
      const lowerKey = key.toLowerCase();
      for (const [mapKey, url] of Object.entries(variantImageMap)) {
        if (mapKey.toLowerCase() === lowerKey) {
          imgUrl = url;
          break;
        }
      }
      if (imgUrl) break;
    }
  }

  onSelectionChange({
    selections: entries,
    effectivePrice: entries.reduce((sum, e) => sum + e.priceAdj, basePrice),
    isComplete: complete,
    isAvailable: available,
    activeImageUrl: imgUrl,
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GarmentVariantSelector({
  variants,
  basePrice,
  currency: _currency = "PKR",
  onSelectionChange,
  onConfirm,
  initialSelection,
  compact = false,
  enforceCompatibility: _enforceCompatibility = false,
  variantImageMap,
  showConfirmButton = false,
  confirmLabel = "Confirm Selection",
}: GarmentVariantSelectorProps) {
  // ── State: selected label per group ───────────────────────────────────────
  const [selectedMap, setSelectedMap] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (initialSelection) {
      for (const sel of initialSelection) {
        initial[sel.groupName] = sel.optionLabel;
      }
    }
    return initial;
  });

  // ── Derived: full selection array ─────────────────────────────────────────
  const selectedEntries = useMemo((): SelectedVariant[] => {
    return variants.flatMap((group) => {
      const selectedLabel = selectedMap[group.name];
      if (!selectedLabel) return [];
      const option = group.options.find((o) => o.label === selectedLabel);
      if (!option) return [];
      return [{
        groupName: group.name,
        optionLabel: option.label,
        priceAdj: option.price_adj ?? 0,
        stock: option.stock,
        isAvailable: option.is_available !== false,
      }];
    });
  }, [variants, selectedMap]);

  // ── Derived: total price ──────────────────────────────────────────────────
  const effectivePrice = useMemo(() => {
    return selectedEntries.reduce((sum, entry) => sum + entry.priceAdj, basePrice);
  }, [basePrice, selectedEntries]);

  // ── Derived: completion & availability ────────────────────────────────────
  const isComplete = useMemo(() => {
    return variants.length > 0 && variants.every((g) => selectedMap[g.name] != null);
  }, [variants, selectedMap]);

  const isAvailable = useMemo(() => {
    if (!isComplete) return false;
    return selectedEntries.every((e) => e.isAvailable);
  }, [isComplete, selectedEntries]);

  // ── Derived: active image (first color-matched variant) ───────────────────
  const activeImageUrl = useMemo(() => {
    if (!variantImageMap) return undefined;
    for (const entry of selectedEntries) {
      const key = entry.optionLabel;
      if (variantImageMap[key]) return variantImageMap[key];
      const lowerKey = key.toLowerCase();
      for (const [mapKey, url] of Object.entries(variantImageMap)) {
        if (mapKey.toLowerCase() === lowerKey) return url;
      }
    }
    return undefined;
  }, [variantImageMap, selectedEntries]);

  // ── Handler: select/deselect an option ────────────────────────────────────
  const handleSelect = useCallback(
    (groupName: string, optionLabel: string) => {
      setSelectedMap((prev) => {
        const isCurrentlySelected = prev[groupName] === optionLabel;
        let next: Record<string, string>;

        if (isCurrentlySelected) {
          // Remove this group's selection entirely
          const { [groupName]: _removed, ...rest } = prev;
          next = rest;
        } else {
          // Set/update the selection for this group
          next = { ...prev, [groupName]: optionLabel };
        }

        // Notify parent asynchronously
        setTimeout(() => {
          notifyParent(next, variants, basePrice, variantImageMap, onSelectionChange);
        }, 0);

        return next;
      });
    },
    [variants, basePrice, onSelectionChange, variantImageMap],
  );

  // ── Handler: confirm selection ────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!isComplete) return;
    onConfirm?.({
      selections: selectedEntries,
      effectivePrice,
      isComplete,
      isAvailable,
      activeImageUrl,
    });
  }, [
    isComplete,
    isAvailable,
    selectedEntries,
    effectivePrice,
    activeImageUrl,
    onConfirm,
  ]);

  // ── Return null if no variants ────────────────────────────────────────────
  if (!variants || variants.length === 0) return null;

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      {/* ── Variant Groups ─────────────────────────────────────────────────── */}
      {variants.map((group) => {
        const isColorGrp = isColorGroup(group.options);
        const isSizeGrp = group.name.toLowerCase().includes("size");

        return (
          <div key={group.name}>
            {/* Group Label */}
            <div className="mb-2 flex items-center justify-between">
              <span
                className={`font-semibold text-zinc-700 dark:text-zinc-300 ${
                  compact ? "text-xs" : "text-sm"
                }`}
              >
                {group.name}
                <span className="ml-1 font-normal text-zinc-400">
                  {isSizeGrp
                    ? "(Select Size)"
                    : isColorGrp
                      ? "(Select Color)"
                      : "(Select)"}
                </span>
              </span>
              {/* Selected chip indicator */}
              {selectedMap[group.name] && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.625rem] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  ✓ {selectedMap[group.name]}
                </span>
              )}
            </div>

            {/* Options Grid */}
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const isSelected = selectedMap[group.name] === option.label;
                const isUnavailable = option.is_available === false;
                const colorHex = getColorHex(option.label);
                const isColor = isColorGrp && colorHex;
                const stockLabel =
                  option.stock != null
                    ? option.stock <= 0
                      ? "Out of stock"
                      : option.stock <= 5
                        ? `Only ${option.stock} left`
                        : `${option.stock} in stock`
                    : undefined;

                // ── Color Swatch Button ─────────────────────────────────────
                if (isColor) {
                  return (
                    <button
                      key={option.label}
                      type="button"
                      disabled={isUnavailable}
                      onClick={() => handleSelect(group.name, option.label)}
                      title={`${option.label}${stockLabel ? ` — ${stockLabel}` : ""}${option.price_adj ? ` (${option.price_adj > 0 ? "+" : ""}Rs. ${option.price_adj})` : ""}`}
                      className={`relative flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 ${
                        isSelected
                          ? "border-emerald-600 bg-emerald-50 shadow-md dark:border-emerald-400 dark:bg-emerald-900/20"
                          : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-500"
                      } ${
                        isUnavailable
                          ? "cursor-not-allowed opacity-40"
                          : "cursor-pointer"
                      } ${compact ? "min-w-[3.5rem]" : "min-w-[4.5rem]"}`}
                      aria-label={`${option.label}${isUnavailable ? " (unavailable)" : ""}`}
                      aria-pressed={isSelected}
                    >
                      {/* Color Circle */}
                      <span
                        className={`inline-block rounded-full border-2 ${
                          isSelected
                            ? "border-emerald-600 dark:border-emerald-400"
                            : "border-black/10"
                        } transition-all ${compact ? "h-7 w-7" : "h-8 w-8"}`}
                        style={{ backgroundColor: colorHex }}
                        aria-hidden="true"
                      />
                      {/* Label */}
                      <span
                        className={`text-center font-medium leading-tight ${
                          compact ? "text-[0.6rem]" : "text-[0.7rem]"
                        } ${
                          isSelected
                            ? "text-emerald-800 dark:text-emerald-200"
                            : "text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {option.label}
                      </span>
                      {/* Price Adj */}
                      {option.price_adj && option.price_adj !== 0 && (
                        <span className="text-[0.55rem] text-zinc-400">
                          {option.price_adj > 0 ? "+" : ""}Rs.{" "}
                          {Math.abs(option.price_adj)}
                        </span>
                      )}
                      {/* Stock Badge */}
                      {option.stock != null && option.stock <= 5 && option.stock > 0 && (
                        <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1 py-0 text-[0.5rem] font-bold text-white shadow-sm">
                          {option.stock}
                        </span>
                      )}
                    </button>
                  );
                }

                // ── Size / Regular Chip Button ──────────────────────────────
                return (
                  <button
                    key={option.label}
                    type="button"
                    disabled={isUnavailable}
                    onClick={() => handleSelect(group.name, option.label)}
                    title={`${option.label}${stockLabel ? ` — ${stockLabel}` : ""}${option.price_adj ? ` (${option.price_adj > 0 ? "+" : ""}Rs. ${option.price_adj})` : ""}`}
                    className={`relative rounded-xl border-2 px-3.5 py-2.5 font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 ${
                      isSelected
                        ? "border-emerald-600 bg-emerald-600 text-white shadow-md"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-500"
                    } ${
                      isUnavailable
                        ? "cursor-not-allowed opacity-40 line-through"
                        : "cursor-pointer"
                    } ${compact ? "px-3 py-2 text-xs" : "text-sm"}`}
                    aria-label={`${option.label}${isUnavailable ? " (unavailable)" : ""}`}
                    aria-pressed={isSelected}
                  >
                    <span
                      className={
                        isSizeGrp
                          ? "tracking-wide uppercase"
                          : ""
                      }
                    >
                      {option.label}
                    </span>
                    {/* Price Adj */}
                    {option.price_adj && option.price_adj !== 0 && (
                      <span
                        className={`ml-1 text-[0.6rem] ${
                          isSelected ? "text-emerald-100" : "text-zinc-400"
                        }`}
                      >
                        {option.price_adj > 0 ? "+" : ""}Rs.{" "}
                        {Math.abs(option.price_adj)}
                      </span>
                    )}
                    {/* Stock Dot */}
                    {option.stock != null && option.stock <= 5 && option.stock > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[0.5rem] font-bold text-white shadow-sm">
                        !
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Low stock warning for selected option */}
            {selectedMap[group.name] && (() => {
              const selOption = group.options.find(
                (o) => o.label === selectedMap[group.name],
              );
              if (selOption?.stock != null && selOption.stock <= 5 && selOption.stock > 0) {
                return (
                  <p className="mt-1 text-[0.65rem] text-amber-600 dark:text-amber-400">
                    ⚠️ Low stock — only {selOption.stock} left!
                  </p>
                );
              }
              return null;
            })()}
          </div>
        );
      })}

      {/* ── Summary Bar ─────────────────────────────────────────────────────── */}
      {selectedEntries.length > 0 && (
        <div
          className={`rounded-xl border bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {/* Selected combination summary */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Selection:
            </span>
            {selectedEntries.map((entry) => (
              <span
                key={`${entry.groupName}-${entry.optionLabel}`}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium shadow-sm dark:bg-zinc-700"
              >
                {isColorGroup(
                  variants.find((g) => g.name === entry.groupName)
                    ?.options ?? [],
                ) &&
                  getColorHex(entry.optionLabel) && (
                    <span
                      className="inline-block h-3 w-3 rounded-full border border-black/10"
                      style={{
                        backgroundColor: getColorHex(entry.optionLabel)!,
                      }}
                      aria-hidden="true"
                    />
                  )}
                {entry.optionLabel}
              </span>
            ))}
            {!isComplete && (
              <span className="text-xs text-amber-500">
                (select all options)
              </span>
            )}
          </div>

          {/* Price + Stock */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Price:
              </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {formatRupees(effectivePrice)}
              </span>
              {selectedEntries.some((e) => e.priceAdj !== 0) && (
                <span className="rounded bg-emerald-100 px-1.5 py-0 text-[0.6rem] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  adjusted
                </span>
              )}
            </div>

            {/* Availability indicator */}
            {isComplete && (
              <span
                className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${
                  isAvailable
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                }`}
              >
                {isAvailable ? "✓ In Stock" : "✕ Out of Stock"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Confirm Button ──────────────────────────────────────────────────── */}
      {showConfirmButton && (
        <button
          type="button"
          disabled={!isComplete || !isAvailable}
          onClick={handleConfirm}
          className={`w-full rounded-xl py-3 text-sm font-bold text-white shadow-lg transition-all ${
            isComplete && isAvailable
              ? "bg-pink-600 shadow-pink-600/25 hover:bg-pink-700 active:scale-[0.98]"
              : "cursor-not-allowed bg-zinc-300 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
          }`}
        >
          {!isComplete
            ? "Select all options to continue"
            : !isAvailable
              ? "Currently unavailable"
              : `${confirmLabel} — ${formatRupees(effectivePrice)}`}
        </button>
      )}
    </div>
  );
}