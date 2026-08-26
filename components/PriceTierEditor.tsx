"use client";

/* -------------------------------------------------------------------------- */
/*  PriceTierEditor — quantity-based bulk pricing builder for merchants        */
/*                                                                             */
/*  Set breakpoints like "1 = Rs 200" · "6 = Rs 1100" (pack totals) or a       */
/*  per-unit rate ("6+ = Rs 183"). Pack discounts apply only at the set         */
/*  quantities; other quantities combine packs + singles automatically.         */
/* -------------------------------------------------------------------------- */

import { useState } from "react";
import type { PriceTier } from "@/types";
import {
  normalizeTiers,
  tierPreviewLabels,
  tierMode,
  tierModeHint,
} from "@/lib/priceTiers";

const QUICK_PACKS = [2, 3, 6, 12];

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

export default function PriceTierEditor({
  tiers,
  onChange,
  basePrice,
}: {
  tiers: PriceTier[];
  onChange: (next: PriceTier[]) => void;
  basePrice?: number;
}) {
  const [qtyDraft, setQtyDraft] = useState("");

  const sorted = normalizeTiers(tiers);
  const labels = tierPreviewLabels(tiers);
  const mode = tierMode(tiers);

  function setMode(next: "pack" | "unit") {
    if (next === mode) return;
    onChange(tiers.map((t) => ({ ...t, mode: next })));
  }

  function addTier(minQty: number, price?: number) {
    const qty = Math.round(Number(minQty) || 0);
    if (qty < 1) return;
    const priceValue = price ?? Number(qtyDraft);
    const next = tiers.filter((t) => Number(t.min_qty) !== qty);
    if (Number.isFinite(priceValue) && priceValue > 0) {
      next.push({ min_qty: qty, price: Math.round(priceValue), mode });
    } else {
      next.push({ min_qty: qty, price: 0, mode });
    }
    onChange(next);
    setQtyDraft("");
  }

  function updateTier(idx: number, patch: Partial<PriceTier>) {
    onChange(tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function removeTier(idx: number) {
    onChange(tiers.filter((_, i) => i !== idx));
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/30">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          Quantity pricing (bulk)
          <span className="font-normal text-zinc-400">
            {" "}
            — {mode === "unit" ? "per-unit rate" : "pack prices"} · e.g. 6 = Rs 1100
          </span>
        </span>
        {tiers.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Mode toggle: pack total vs per-unit */}
      <div className="mb-2 flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setMode("pack")}
          className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${
            mode === "pack"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
          title="Set a TOTAL price for a pack, e.g. 6 items = Rs 1100"
        >
          Pack total
        </button>
        <button
          type="button"
          onClick={() => setMode("unit")}
          className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${
            mode === "unit"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
          title="Set a PER-ITEM price that applies once the quantity reaches the tier"
        >
          Per-unit rate
        </button>
      </div>

      {tiers.length === 0 && (
        <p className="mb-2 rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-center text-[11px] text-zinc-400 dark:border-zinc-700">
          {mode === "unit"
            ? 'Add a per-unit rate, e.g. qty "6" → "183" (each item costs Rs 183 once you buy 6+).'
            : 'Add a pack price, e.g. qty "6" → "1100" (a 6-pack costs Rs 1100). Discount shows only at the quantities you set.'}
        </p>
      )}

      {tiers.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {tiers.map((tier, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <input
                value={tier.min_qty}
                onChange={(e) => updateTier(idx, { min_qty: Math.max(1, Math.round(Number(e.target.value) || 0)) })}
                type="number"
                min={1}
                placeholder="Qty"
                title="Quantity for this price"
                className="w-16 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1.5 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <span className="text-[10px] text-zinc-400">= Rs</span>
              <input
                value={tier.price || ""}
                onChange={(e) => updateTier(idx, { price: Math.max(0, Number(e.target.value) || 0) })}
                type="number"
                min={0}
                placeholder="Price"
                title={
                  mode === "unit"
                    ? "Per-item price once the quantity reaches this tier"
                    : "Total price for this pack quantity (e.g. 6 items = Rs 1100)"
                }
                className="w-24 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1.5 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <span className="text-[10px] text-zinc-400">
                {mode === "unit" ? "each" : "total"}
              </span>
              <button
                type="button"
                onClick={() => removeTier(idx)}
                className="rounded-md p-1 text-zinc-300 hover:text-red-500"
                aria-label="Remove tier"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_PACKS.map((pack) => {
          const exists = sorted.some((t) => t.min_qty === pack);
          return (
            <button
              key={pack}
              type="button"
              onClick={() => addTier(pack)}
              disabled={exists}
              className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              + {pack} pack
            </button>
          );
        })}
        <div className="flex items-center gap-1">
          <input
            value={qtyDraft}
            onChange={(e) => setQtyDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTier(Number(qtyDraft));
              }
            }}
            placeholder="Qty"
            type="number"
            min={1}
            className="w-14 rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            onClick={() => addTier(Number(qtyDraft))}
            disabled={!qtyDraft || Number(qtyDraft) < 1}
            className="flex items-center gap-0.5 rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            <PlusIcon /> Add
          </button>
        </div>
      </div>

      {labels.length > 0 && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900/10">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Customer will see
          </p>
          <div className="flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <span key={label} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                {label}
              </span>
            ))}
            {basePrice != null && basePrice > 0 && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                below {sorted[0]?.min_qty ?? 1} = Rs {Math.round(basePrice).toLocaleString("en-PK")} each
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
            {tierModeHint(tiers)}
          </p>
        </div>
      )}
    </div>
  );
}
