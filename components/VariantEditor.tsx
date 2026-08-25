"use client";

/* -------------------------------------------------------------------------- */
/*  VariantEditor — dead-simple options builder for merchants                 */
/*                                                                             */
/*  One screen: add a group (Size / Color / Spice / Flavour / Portion /       */
/*  Add-ons), then add options to it. Each option can have an absolute price   */
/*  (Daraz-style: this color costs Rs. X) and/or a price add-on (+Rs. 100).   */
/*  Live preview of how the customer will see it.                              */
/* -------------------------------------------------------------------------- */

import { useState } from "react";
import type { VariantGroup } from "@/types";

const PRESET_GROUPS = ["Size", "Color", "Spice Level", "Flavour", "Portion", "Add-ons"];

/** Common options auto-filled when a preset group is added, so merchants don't
 *  have to type every option by hand for the most-used groups. */
const PRESET_OPTIONS: Record<string, string[]> = {
  Size: ["XS", "S", "M", "L", "XL", "XXL"],
  Color: ["Black", "White", "Red", "Blue", "Green"],
};

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export default function VariantEditor({
  variants,
  onChange,
}: {
  variants: VariantGroup[];
  onChange: (next: VariantGroup[]) => void;
}) {
  const [customGroup, setCustomGroup] = useState("");

  function addGroup(name: string) {
    const clean = name.trim();
    if (!clean) return;
    if (variants.some((g) => g.name === clean)) return;
    const preset = PRESET_OPTIONS[clean];
    onChange([
      ...variants,
      {
        name: clean,
        options: preset
          ? preset.map((label) => ({ label, is_available: true }))
          : [],
      },
    ]);
    setCustomGroup("");
  }

  function updateGroup(idx: number, name: string) {
    const next = variants.map((g, i) => (i === idx ? { ...g, name } : g));
    onChange(next);
  }

  function addOption(groupIdx: number) {
    const next = variants.map((g, i) =>
      i === groupIdx
        ? {
            ...g,
            options: [
              ...g.options,
              { label: "", price: undefined, price_adj: undefined, is_available: true },
            ],
          }
        : g,
    );
    onChange(next);
  }

  function updateOption(groupIdx: number, optIdx: number, patch: Record<string, unknown>) {
    const next = variants.map((g, i) =>
      i === groupIdx
        ? {
            ...g,
            options: g.options.map((o, j) => (j === optIdx ? { ...o, ...patch } : o)),
          }
        : g,
    );
    onChange(next);
  }

  function removeOption(groupIdx: number, optIdx: number) {
    const next = variants.map((g, i) =>
      i === groupIdx ? { ...g, options: g.options.filter((_, j) => j !== optIdx) } : g,
    );
    onChange(next);
  }

  function removeGroup(groupIdx: number) {
    onChange(variants.filter((_, i) => i !== groupIdx));
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/30">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          Options / Variants{" "}
          <span className="font-normal text-zinc-400">(optional — e.g. Size, Color, Spice)</span>
        </span>
        {variants.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Group adder */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {PRESET_GROUPS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => addGroup(preset)}
            disabled={variants.some((g) => g.name === preset)}
            className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
          >
            + {preset}
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input
            value={customGroup}
            onChange={(e) => setCustomGroup(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGroup(customGroup);
              }
            }}
            placeholder="Custom…"
            className="w-24 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            onClick={() => addGroup(customGroup)}
            className="rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add
          </button>
        </div>
      </div>

      {variants.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-center text-[11px] text-zinc-400 dark:border-zinc-700">
          No options yet. Tap a preset above (e.g. Size) to add your first group.
        </p>
      )}

      <div className="space-y-3">
        {variants.map((group, groupIdx) => (
          <div key={groupIdx} className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between gap-2">
              <input
                value={group.name}
                onChange={(e) => updateGroup(groupIdx, e.target.value)}
                className="w-40 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                aria-label="Group name"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => addOption(groupIdx)}
                  className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                >
                  <PlusIcon /> Option
                </button>
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

            {group.options.length === 0 && (
              <p className="px-1 pb-1 text-[11px] text-zinc-400">No options — tap &quot;Option&quot; to add.</p>
            )}

            <div className="space-y-1.5">
              {group.options.map((option, optIdx) => (
                <div key={optIdx} className="flex items-center gap-1.5">
                  <input
                    value={option.label}
                    onChange={(e) => updateOption(groupIdx, optIdx, { label: e.target.value })}
                    placeholder="Option name (e.g. Large)"
                    className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <input
                    value={option.price ?? ""}
                    onChange={(e) =>
                      updateOption(groupIdx, optIdx, {
                        price: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    type="number"
                    min={0}
                    placeholder="Price"
                    title="Absolute price for this option (Daraz-style)"
                    className="w-16 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1.5 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <span className="text-[10px] text-zinc-400">Rs.</span>
                  <input
                    value={option.price_adj ?? ""}
                    onChange={(e) =>
                      updateOption(groupIdx, optIdx, {
                        price_adj: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    type="number"
                    placeholder="+Add"
                    title="Price add-on on top of base (e.g. +100)"
                    className="w-16 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1.5 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(groupIdx, optIdx)}
                    className="rounded-md p-1 text-zinc-300 hover:text-red-500"
                    aria-label="Remove option"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Live preview */}
      {variants.length > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900/10">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Customer will see:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {variants.map((g) => {
              const shown = g.options.filter((o) => o.label.trim()).slice(0, 4);
              const total = g.options.filter((o) => o.label.trim()).length;
              return (
                <span key={g.name} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                  {g.name}:
                  {shown.map((o, idx) => (
                    <span key={`${o.label}-${idx}`} className="text-emerald-600 dark:text-emerald-400">
                      {idx > 0 ? " ·" : ""} {o.label}
                      {typeof o.price === "number" ? ` (${o.price})` : ""}
                      {o.price_adj ? ` +${o.price_adj}` : ""}
                    </span>
                  ))}
                  {total > 4 ? " …" : ""}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
