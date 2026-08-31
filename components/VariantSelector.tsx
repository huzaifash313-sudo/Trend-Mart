"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Advanced Product Variants & Color/Size Matrix                   */
/*                                                                             */
/*  Designed for Boutique/Garments merchants:                                  */
/*   - Color swatches with visual indicators                                  */
/*   - Size grid (XS, S, M, L, XL, XXL, custom sizes)                        */
/*   - Price adjustment per variant                                           */
/*   - Stock availability per variant combination                             */
/*   - Selected variant passed to checkout                                    */
/*                                                                             */
/*  Also works for Food (portion sizes), Electronics (storage/RAM variants),  */
/*  and Cosmetics (shades/volumes).                                           */
/*                                                                             */
/*  Each option now shows its OWN "Sold out" state and its own discount        */
/*  (original → now price + % OFF) so a Small / Large / Family pizza each      */
/*  carries a distinct price and markdown, Daraz-style.                       */
/* -------------------------------------------------------------------------- */

import { useState, useCallback, useMemo } from "react";
import type { VariantGroup, ProductVariant } from "@/types";
import {
  computeVariantPrice,
  effectiveOptionPrice,
  effectiveOptionOriginal,
} from "@/lib/variantPricing";
import { formatRupees } from "@/lib/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectedVariant {
  groupName: string;
  optionLabel: string;
  priceAdj: number;
}

interface VariantSelectorProps {
  /** Variant groups from the product (e.g., [{name:"Size", options:[...]}, {name:"Color", options:[...]}]) */
  variants: VariantGroup[];
  /** Base price of the product (for displaying total with adjustments) */
  basePrice: number;
  /** Base "before discount" price — enables accurate per-variant % OFF. */
  baseOriginalPrice?: number | null;
  /** Called when the user selects a variant combination */
  onSelectionChange?: (selected: SelectedVariant[]) => void;
  /** Pre-selected variant (e.g., from a shared link or saved cart) */
  initialSelection?: SelectedVariant[];
  /** Display mode: "swatches" for color, "chips" for size, "auto" for smart detection */
  displayMode?: "swatches" | "chips" | "auto";
  /** Compact mode for mobile */
  compact?: boolean;
}

// ─── Color Map ────────────────────────────────────────────────────────────────

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
  // Direct match
  if (COLOR_HEX_MAP[lower]) return COLOR_HEX_MAP[lower];

  // Partial match (e.g., "Light Blue" → blue)
  for (const [name, hex] of Object.entries(COLOR_HEX_MAP)) {
    if (lower.includes(name)) return hex;
  }

  return null;
}

/** Determine if a variant group is likely a color group. */
function isColorGroup(groupName: string, options: ProductVariant[]): boolean {
  const name = groupName.toLowerCase();
  if (name.includes("color") || name.includes("colour") || name.includes("shade")) {
    return true;
  }
  // Check if most option labels are known colors
  const colorCount = options.filter((o) => getColorHex(o.label) !== null).length;
  return colorCount >= options.length * 0.5;
}

/** Determine if a variant group is likely a size group. */
function isSizeGroup(groupName: string): boolean {
  const name = groupName.toLowerCase();
  return (
    name.includes("size") ||
    name.includes("volume") ||
    name.includes("weight") ||
    name.includes("portion") ||
    name.includes("storage") ||
    name.includes("ram") ||
    name === "capacity"
  );
}

/** % OFF implied by an option's original vs its effective price. */
function percentOff(effective: number, original: number | null): number {
  if (original == null || !Number.isFinite(original) || original <= effective) return 0;
  return Math.round(((original - effective) / original) * 100);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VariantSelector({
  variants,
  basePrice,
  baseOriginalPrice = null,
  onSelectionChange,
  initialSelection,
  displayMode = "auto",
  compact = false,
}: VariantSelectorProps) {
  const [selectedMap, setSelectedMap] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (initialSelection) {
      for (const sel of initialSelection) {
        initial[sel.groupName] = sel.optionLabel;
      }
    }
    return initial;
  });

  /** Compute which option is selected for each group. */
  const selectedEntries = useMemo((): SelectedVariant[] => {
    return variants.flatMap((group) => {
      const selectedLabel = selectedMap[group.name];
      if (!selectedLabel) return [];
      const option = group.options.find((o) => o.label === selectedLabel);
      if (!option) return [];
      return [
        {
          groupName: group.name,
          optionLabel: option.label,
          priceAdj: option.price_adj ?? 0,
        },
      ];
    });
  }, [variants, selectedMap]);

  /** Total price with adjustments (absolute prices + additive adjustments). */
  const totalPrice = useMemo(() => {
    const label = selectedEntries
      .map((e) => `${e.groupName}: ${e.optionLabel}`)
      .join(" · ");
    return computeVariantPrice(basePrice, variants, label);
  }, [basePrice, variants, selectedEntries]);

  const handleSelect = useCallback(
    (groupName: string, optionLabel: string) => {
      setSelectedMap((prev) => {
        const next = { ...prev, [groupName]: optionLabel };
        // Notify parent after state update
        setTimeout(() => {
          const entries = variants.flatMap((group) => {
            const label = next[group.name];
            if (!label) return [];
            const opt = group.options.find((o) => o.label === label);
            if (!opt) return [];
            return [
              {
                groupName: group.name,
                optionLabel: opt.label,
                priceAdj: opt.price_adj ?? 0,
              },
            ];
          });
          onSelectionChange?.(entries);
        }, 0);
        return next;
      });
    },
    [variants, onSelectionChange],
  );

  if (!variants || variants.length === 0) return null;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {variants.map((group) => {
        const isColor =
          displayMode === "swatches"
            ? true
            : displayMode === "chips"
              ? false
              : isColorGroup(group.name, group.options);
        const isSize = isSizeGroup(group.name);

        return (
          <div key={group.name}>
            {/* Group label */}
            <div className="mb-1.5 flex items-center justify-between">
              <span
                className={`font-semibold text-zinc-700 dark:text-zinc-300 ${
                  compact ? "text-xs" : "text-sm"
                }`}
              >
                {group.name}
                <span className="ml-1 font-normal text-zinc-400">
                  {isSize
                    ? "(Select size)"
                    : isColor
                      ? "(Select color)"
                      : "(Select)"}
                </span>
              </span>
              {selectedMap[group.name] && (
                <span
                  className={`text-zinc-400 dark:text-zinc-500 ${
                    compact ? "text-[0.625rem]" : "text-xs"
                  }`}
                >
                  {selectedMap[group.name]}
                </span>
              )}
            </div>

            {/* Options */}
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((option) => {
                const isSelected = selectedMap[group.name] === option.label;
                const colorHex = isColor ? getColorHex(option.label) : null;
                const unavailable = option.is_available === false;
                const eff = effectiveOptionPrice(basePrice, option);
                const orig = effectiveOptionOriginal(basePrice, baseOriginalPrice, option);
                const pct = percentOff(eff, orig);
                const hasOwnPrice =
                  typeof option.price === "number" ||
                  (option.price_adj != null && option.price_adj !== 0);

                return (
                  <button
                    key={option.label}
                    type="button"
                    disabled={unavailable}
                    onClick={() => handleSelect(group.name, option.label)}
                    className={`relative flex flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-1.5 text-center transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      isSelected
                        ? "border-emerald-600 bg-emerald-50 shadow-sm dark:border-emerald-400 dark:bg-emerald-900/20"
                        : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-500"
                    } ${
                      unavailable
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer"
                    } ${compact ? "min-w-[3.25rem]" : "min-w-[4rem]"}`}
                    aria-label={`${option.label}${unavailable ? " (sold out)" : ""}`}
                    aria-pressed={isSelected}
                  >
                    {colorHex ? (
                      <span
                        className="inline-block h-5 w-5 rounded-full border border-black/10"
                        style={{ backgroundColor: colorHex }}
                        aria-hidden="true"
                      />
                    ) : null}

                    <span
                      className={`text-xs font-semibold ${
                        isSize ? "uppercase tracking-wide" : ""
                      } ${
                        unavailable
                          ? "line-through text-zinc-400"
                          : isSelected
                            ? "text-emerald-800 dark:text-emerald-200"
                            : "text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {option.label}
                    </span>

                    {unavailable ? (
                      <span className="text-[9px] font-semibold leading-none text-red-500">
                        Sold out
                      </span>
                    ) : pct > 0 && orig != null ? (
                      <span className="text-[9px] leading-none">
                        <s className="text-zinc-400">{formatRupees(orig)}</s>{" "}
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {formatRupees(eff)}
                        </span>{" "}
                        <span className="font-bold text-red-500">-{pct}%</span>
                      </span>
                    ) : hasOwnPrice ? (
                      <span className="text-[9px] font-semibold leading-none text-zinc-600 dark:text-zinc-400">
                        {formatRupees(eff)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Total price display (whenever the selected options change the price) */}
      {totalPrice !== basePrice && (
        <div
          className={`border-t border-zinc-100 pt-3 text-right dark:border-zinc-800 ${
            compact ? "text-sm" : ""
          }`}
        >
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Total:{" "}
          </span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">
            {formatRupees(totalPrice)}
          </span>
          {selectedEntries.some((e) => e.priceAdj !== 0) ? (
            <span className="ml-1 text-[0.65rem] text-zinc-400">
              (incl. adjustments)
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
