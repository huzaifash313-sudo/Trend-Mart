"use client";

/* -------------------------------------------------------------------------- */
/*  VariantEditor — category-smart, chip-first options builder                 */
/*                                                                             */
/*  Flow for merchants:                                                        */
/*   1. One-tap pack for their shop category (Size+Color, Portion, …)         */
/*   2. Tap chips to keep / remove options                                     */
/*   3. Optional: set different price per option (collapsed)                   */
/*   Skip anytime — variants are never required.                               */
/* -------------------------------------------------------------------------- */

import { useMemo, useState } from "react";
import type { ProductVariant, VariantGroup } from "@/types";
import { effectiveOptionPrice } from "@/lib/variantPricing";
import {
  EXTRA_GROUP_PRESETS,
  categoryUsuallyHasVariants,
  cloneVariantGroups,
  getOptionPoolForGroup,
  getVariantTemplates,
  type VariantTemplatePack,
} from "@/lib/variantTemplates";

function originalFromPercent(effective: number, pct: number): number | undefined {
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return undefined;
  const derived = Math.round(effective / (1 - pct / 100));
  return derived > effective ? derived : undefined;
}

function percentFromOriginal(effective: number, original?: number): number | undefined {
  if (original == null || !Number.isFinite(original) || original <= effective) return undefined;
  return Math.round(((original - effective) / original) * 100);
}

function PlusIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function optionKey(label: string) {
  return label.trim().toLowerCase();
}

export default function VariantEditor({
  variants,
  onChange,
  basePrice = 0,
  shopCategory,
  compact = false,
}: {
  variants: VariantGroup[];
  onChange: (next: VariantGroup[]) => void;
  basePrice?: number;
  /** Shop main category label — drives suggested packs */
  shopCategory?: string | null;
  /** Tighter layout for bulk table rows */
  compact?: boolean;
}) {
  const [customGroup, setCustomGroup] = useState("");
  const [customOption, setCustomOption] = useState<Record<number, string>>({});
  const [showPrices, setShowPrices] = useState(false);
  const [showMoreGroups, setShowMoreGroups] = useState(false);

  const templates = useMemo(
    () => getVariantTemplates(shopCategory),
    [shopCategory],
  );

  const usuallyNeeds = categoryUsuallyHasVariants(shopCategory);
  const hasVariants = variants.length > 0;

  function applyPack(pack: VariantTemplatePack) {
    onChange(cloneVariantGroups(pack.groups));
    setShowMoreGroups(false);
  }

  function addGroup(name: string) {
    const clean = name.trim();
    if (!clean) return;
    if (variants.some((g) => g.name === clean)) return;
    const pool = getOptionPoolForGroup(clean);
    onChange([
      ...variants,
      {
        name: clean,
        options: pool.length
          ? pool.map((label) => ({ label, is_available: true }))
          : [],
      },
    ]);
    setCustomGroup("");
    setShowMoreGroups(false);
  }

  function updateGroupName(idx: number, name: string) {
    onChange(variants.map((g, i) => (i === idx ? { ...g, name } : g)));
  }

  function removeGroup(idx: number) {
    onChange(variants.filter((_, i) => i !== idx));
  }

  function isOptionSelected(group: VariantGroup, label: string) {
    return group.options.some((o) => optionKey(o.label) === optionKey(label));
  }

  function togglePoolOption(groupIdx: number, label: string) {
    const group = variants[groupIdx];
    if (!group) return;
    const exists = isOptionSelected(group, label);
    let nextOptions: ProductVariant[];
    if (exists) {
      nextOptions = group.options.filter((o) => optionKey(o.label) !== optionKey(label));
    } else {
      nextOptions = [...group.options, { label, is_available: true }];
    }
    onChange(
      variants.map((g, i) => (i === groupIdx ? { ...g, options: nextOptions } : g)),
    );
  }

  function addCustomOption(groupIdx: number) {
    const raw = (customOption[groupIdx] ?? "").trim();
    if (!raw) return;
    const group = variants[groupIdx];
    if (!group || isOptionSelected(group, raw)) {
      setCustomOption((prev) => ({ ...prev, [groupIdx]: "" }));
      return;
    }
    onChange(
      variants.map((g, i) =>
        i === groupIdx
          ? { ...g, options: [...g.options, { label: raw, is_available: true }] }
          : g,
      ),
    );
    setCustomOption((prev) => ({ ...prev, [groupIdx]: "" }));
  }

  function updateOption(
    groupIdx: number,
    optIdx: number,
    patch: Partial<ProductVariant>,
  ) {
    onChange(
      variants.map((g, i) =>
        i === groupIdx
          ? {
              ...g,
              options: g.options.map((o, j) => (j === optIdx ? { ...o, ...patch } : o)),
            }
          : g,
      ),
    );
  }

  function removeOption(groupIdx: number, optIdx: number) {
    onChange(
      variants.map((g, i) =>
        i === groupIdx
          ? { ...g, options: g.options.filter((_, j) => j !== optIdx) }
          : g,
      ),
    );
  }

  const comboCount = useMemo(() => {
    if (variants.length === 0) return 0;
    return variants.reduce((acc, g) => {
      const n = g.options.filter((o) => o.label.trim()).length;
      return acc * Math.max(n, 1);
    }, 1);
  }, [variants]);

  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-700 dark:bg-zinc-800/30 ${
        compact ? "p-2.5" : "p-3"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Options / Variants
            <span className="ml-1 font-normal text-zinc-400">(optional)</span>
          </p>
          {shopCategory ? (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Suggested for{" "}
              <span className="font-medium text-teal-700 dark:text-teal-300">
                {shopCategory}
              </span>
            </p>
          ) : null}
        </div>
        {hasVariants ? (
          <div className="flex items-center gap-1.5">
            {comboCount > 0 ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {comboCount} combo{comboCount === 1 ? "" : "s"}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onChange([])}
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Empty: one-tap category packs ─────────────────────────────── */}
      {!hasVariants ? (
        <div className="space-y-2.5">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {usuallyNeeds
              ? "Ek tap se options lagao — baad mein chips se hata / add kar sakte ho."
              : "Zyada tar items bina options ke chalenge. Zarurat ho to neeche se choose karo."}
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {templates.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => applyPack(pack)}
                className="rounded-xl border border-teal-200 bg-white px-3 py-2.5 text-left transition hover:border-teal-400 hover:bg-teal-50/80 dark:border-teal-900/50 dark:bg-zinc-900 dark:hover:border-teal-700 dark:hover:bg-teal-950/30"
              >
                <span className="block text-xs font-bold text-teal-800 dark:text-teal-300">
                  {pack.label}
                </span>
                <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                  {pack.hint}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => setShowMoreGroups((v) => !v)}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {showMoreGroups ? "Hide extras" : "+ Other group"}
            </button>
            <span className="text-[11px] text-zinc-400">
              Ya skip — simple product, no options
            </span>
          </div>
          {showMoreGroups ? (
            <ExtraGroupBar
              variants={variants}
              customGroup={customGroup}
              setCustomGroup={setCustomGroup}
              onAdd={addGroup}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Swap pack without clearing manually */}
          <div className="flex flex-wrap gap-1.5">
            {templates.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => applyPack(pack)}
                className="rounded-full border border-teal-200 bg-white px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:bg-zinc-900 dark:text-teal-300 dark:hover:bg-teal-950/40"
                title={pack.hint}
              >
                Use {pack.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowMoreGroups((v) => !v)}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            >
              + Group
            </button>
          </div>

          {showMoreGroups ? (
            <ExtraGroupBar
              variants={variants}
              customGroup={customGroup}
              setCustomGroup={setCustomGroup}
              onAdd={addGroup}
            />
          ) : null}

          {variants.map((group, groupIdx) => {
            const pool = getOptionPoolForGroup(group.name);
            const selectedKeys = new Set(
              group.options.map((o) => optionKey(o.label)).filter(Boolean),
            );
            const extraSelected = group.options.filter(
              (o) =>
                o.label.trim() &&
                !pool.some((p) => optionKey(p) === optionKey(o.label)),
            );

            return (
              <div
                key={`${group.name}-${groupIdx}`}
                className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <input
                    value={group.name}
                    onChange={(e) => updateGroupName(groupIdx, e.target.value)}
                    className="w-36 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    aria-label="Group name"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-medium text-zinc-400">
                      {group.options.filter((o) => o.label.trim()).length} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => removeGroup(groupIdx)}
                      className="rounded-md p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      aria-label="Remove group"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                  Tap to include / remove
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pool.map((label) => {
                    const on = selectedKeys.has(optionKey(label));
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => togglePoolOption(groupIdx, label)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                          on
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "border border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-emerald-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {on ? "✓ " : ""}
                        {label}
                      </button>
                    );
                  })}
                  {extraSelected.map((o) => (
                    <button
                      key={`extra-${o.label}`}
                      type="button"
                      onClick={() => togglePoolOption(groupIdx, o.label)}
                      className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
                      title="Tap to remove"
                    >
                      ✓ {o.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    value={customOption[groupIdx] ?? ""}
                    onChange={(e) =>
                      setCustomOption((prev) => ({
                        ...prev,
                        [groupIdx]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomOption(groupIdx);
                      }
                    }}
                    placeholder="Custom option…"
                    className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => addCustomOption(groupIdx)}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    <PlusIcon /> Add
                  </button>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setShowPrices((v) => !v)}
            className="text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            {showPrices
              ? "Hide per-option prices"
              : "▸ Different price / discount per option (optional)"}
          </button>

          {showPrices ? (
            <div className="space-y-2 rounded-lg border border-dashed border-zinc-300 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-900">
              <p className="text-[10px] text-zinc-500">
                Leave blank to use the product&apos;s main price. Fill only when this
                option costs differently.
              </p>
              {variants.map((group, groupIdx) => (
                <div key={`price-${groupIdx}`} className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                    {group.name}
                  </p>
                  {group.options.filter((o) => o.label.trim()).length === 0 ? (
                    <p className="text-[11px] text-zinc-400">No options selected.</p>
                  ) : null}
                  {group.options.map((option, optIdx) => {
                    if (!option.label.trim()) return null;
                    const eff = effectiveOptionPrice(basePrice, option);
                    const impliedPct =
                      option.discount_pct ??
                      percentFromOriginal(eff, option.original_price);
                    const unavailable = option.is_available === false;
                    return (
                      <div
                        key={optIdx}
                        className={`flex flex-wrap items-center gap-1.5 rounded-lg px-1 py-1 ${
                          unavailable ? "bg-zinc-100 dark:bg-zinc-800/60" : ""
                        }`}
                      >
                        <span
                          className={`w-20 truncate text-[11px] font-medium ${
                            unavailable
                              ? "text-zinc-400 line-through"
                              : "text-zinc-700 dark:text-zinc-200"
                          }`}
                        >
                          {option.label}
                        </span>
                        <input
                          value={option.price ?? ""}
                          onChange={(e) =>
                            updateOption(groupIdx, optIdx, {
                              price:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                          type="number"
                          min={0}
                          placeholder="Price"
                          title="Absolute price for this option"
                          className="w-16 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-800"
                        />
                        <input
                          value={option.original_price ?? ""}
                          onChange={(e) =>
                            updateOption(groupIdx, optIdx, {
                              original_price:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                              discount_pct: undefined,
                            })
                          }
                          type="number"
                          min={0}
                          placeholder="Was"
                          className="w-16 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-800"
                        />
                        <input
                          value={option.discount_pct ?? ""}
                          onChange={(e) => {
                            const pct =
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value);
                            updateOption(groupIdx, optIdx, {
                              discount_pct: pct,
                              original_price:
                                pct != null
                                  ? originalFromPercent(eff, pct)
                                  : undefined,
                            });
                          }}
                          type="number"
                          min={0}
                          max={99}
                          placeholder="% Off"
                          className="w-14 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-800"
                        />
                        <input
                          value={option.price_adj ?? ""}
                          onChange={(e) =>
                            updateOption(groupIdx, optIdx, {
                              price_adj:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                          type="number"
                          placeholder="+Add"
                          className="w-14 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-800"
                        />
                        {impliedPct != null && impliedPct > 0 ? (
                          <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400">
                            -{impliedPct}%
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            updateOption(groupIdx, optIdx, {
                              is_available: unavailable,
                            })
                          }
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            unavailable
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          }`}
                        >
                          {unavailable ? "Sold out" : "In stock"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeOption(groupIdx, optIdx)}
                          className="rounded-md p-1 text-zinc-300 hover:text-red-500"
                          aria-label="Remove option"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}

          {/* Live preview */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900/10">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Customer will see
            </p>
            <div className="flex flex-wrap gap-1.5">
              {variants.map((g) => {
                const shown = g.options.filter((o) => o.label.trim()).slice(0, 6);
                const total = g.options.filter((o) => o.label.trim()).length;
                if (total === 0) {
                  return (
                    <span
                      key={g.name}
                      className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                    >
                      {g.name}: pick options above
                    </span>
                  );
                }
                return (
                  <span
                    key={g.name}
                    className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {g.name}:{" "}
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {shown.map((o) => o.label).join(" · ")}
                      {total > 6 ? " …" : ""}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExtraGroupBar({
  variants,
  customGroup,
  setCustomGroup,
  onAdd,
}: {
  variants: VariantGroup[];
  customGroup: string;
  setCustomGroup: (v: string) => void;
  onAdd: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 bg-white/80 p-2 dark:border-zinc-600 dark:bg-zinc-900/50">
      {EXTRA_GROUP_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => onAdd(preset)}
          disabled={variants.some((g) => g.name === preset)}
          className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-400"
        >
          + {preset}
        </button>
      ))}
      <input
        value={customGroup}
        onChange={(e) => setCustomGroup(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd(customGroup);
          }
        }}
        placeholder="Custom group…"
        className="w-28 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="button"
        onClick={() => onAdd(customGroup)}
        className="rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Add
      </button>
    </div>
  );
}
