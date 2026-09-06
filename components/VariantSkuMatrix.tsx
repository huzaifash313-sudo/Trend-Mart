"use client";

import type { VariantGroup } from "@/types";
import { formatRupees } from "@/lib/formatters";
import {
  MAX_COMBO_ROWS,
  comboCount,
  computeComboPrice,
  expandComboRows,
  findSku,
  isComboUnavailable,
  setOptionAvailable,
  upsertSku,
} from "@/lib/variantMatrix";
import { customerVariantGroups } from "@/lib/variantPricing";

/**
 * Only for 2+ option groups (e.g. Flavour × Size).
 * Single-group products use the simple per-option rates panel instead.
 */
export default function VariantSkuMatrix({
  variants,
  onChange,
  basePrice,
}: {
  variants: VariantGroup[];
  onChange: (next: VariantGroup[]) => void;
  basePrice: number;
}) {
  const visible = customerVariantGroups(variants);
  const total = comboCount(variants);
  const rows = expandComboRows(variants);

  // Simple products (1 group) → no combo table needed.
  if (visible.length < 2 || total < 2) return null;

  const truncated = total > MAX_COMBO_ROWS;
  const groupNames = visible.map((g) => g.name).join(" × ");
  const firstGroup = visible[0];

  function setComboPrice(label: string, raw: string) {
    onChange(
      upsertSku(variants, label, {
        price: raw === "" ? undefined : Number(raw),
      }),
    );
  }

  function toggleCombo(label: string) {
    const sold = isComboUnavailable(variants, label);
    onChange(upsertSku(variants, label, { is_available: sold ? true : false }));
  }

  function toggleWholeOption(groupName: string, optionLabel: string, available: boolean) {
    onChange(setOptionAvailable(variants, groupName, optionLabel, available));
  }

  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-white p-2.5 dark:border-emerald-900/50 dark:bg-zinc-900">
      <div>
        <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
          Mix rates · {total} combinations
        </p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {groupNames} — har combination ka apna rate / sold-out. Poora option
          band karna ho to neeche chip dabao.
        </p>
      </div>

      {firstGroup && firstGroup.options.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {firstGroup.options
            .filter((o) => o.label.trim())
            .map((o) => {
              const off = o.is_available === false;
              return (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => toggleWholeOption(firstGroup.name, o.label, off)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    off
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  }`}
                >
                  {off ? "Sold out · " : ""}
                  {o.label}
                </button>
              );
            })}
        </div>
      ) : null}

      {truncated ? (
        <p className="text-[10px] text-amber-700 dark:text-amber-300">
          Showing first {MAX_COMBO_ROWS} of {total}. Remove extra options to see all.
        </p>
      ) : null}

      <div className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
        {rows.map((row) => {
          const sku = findSku(variants, row.label);
          const sold = isComboUnavailable(variants, row.label);
          const price = computeComboPrice(basePrice, variants, row.label);
          const optionOff = row.parts.some((p) => p.option.is_available === false);
          const shortLabel = row.parts.map((p) => p.option.label).join(" · ");
          return (
            <div
              key={row.label}
              className={`flex flex-wrap items-center gap-1.5 rounded-lg px-1.5 py-1 ${
                sold ? "bg-zinc-100 dark:bg-zinc-800/70" : "bg-zinc-50 dark:bg-zinc-800/40"
              }`}
            >
              <span
                className={`min-w-0 flex-1 truncate text-[11px] font-medium ${
                  sold ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-200"
                }`}
              >
                {shortLabel}
              </span>
              <input
                type="number"
                min={0}
                value={sku?.price ?? ""}
                placeholder={String(Math.round(price))}
                disabled={optionOff}
                onChange={(e) => setComboPrice(row.label, e.target.value)}
                className="w-16 rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-900"
                aria-label={`Price for ${row.label}`}
              />
              <span className="w-12 text-right text-[10px] text-zinc-400">
                {formatRupees(price)}
              </span>
              <button
                type="button"
                disabled={optionOff}
                onClick={() => toggleCombo(row.label)}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold disabled:opacity-40 ${
                  sold
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-ok-100 text-ok-700 dark:bg-ok-900/30 dark:text-ok-400"
                }`}
              >
                {sold ? "Sold out" : "In stock"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
