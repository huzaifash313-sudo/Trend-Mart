"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deletePosRecipe,
  listPosRecipes,
  savePosRecipe,
} from "@/services/posService";
import type { PosRecipe, PosRecipeIngredient } from "@/lib/pos/types";
import { useToast } from "@/components/Toast";
import type { Product } from "@/types";

export default function PosRecipesPanel({
  shopId,
  products,
}: {
  shopId: string;
  products: Product[];
}) {
  const { addToast } = useToast();
  const [recipes, setRecipes] = useState<PosRecipe[]>([]);
  const [finishedId, setFinishedId] = useState("");
  const [ings, setIngs] = useState<PosRecipeIngredient[]>([]);
  const [ingPick, setIngPick] = useState("");
  const [ingQty, setIngQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  async function reload() {
    const res = await listPosRecipes(shopId);
    if (res.success) setRecipes(res.data);
  }

  useEffect(() => {
    void reload();
  }, [shopId]);

  function addIngredient() {
    if (!ingPick) return;
    const p = byId.get(ingPick);
    const qty = Math.max(0.01, Number(ingQty) || 1);
    setIngs((prev) => {
      const hit = prev.find((x) => x.product_id === ingPick);
      if (hit) {
        return prev.map((x) =>
          x.product_id === ingPick ? { ...x, qty: Math.round((x.qty + qty) * 100) / 100 } : x,
        );
      }
      return [...prev, { product_id: ingPick, qty, name: p?.name }];
    });
    setIngQty("1");
  }

  async function save() {
    if (!finishedId) {
      addToast("Pick finished product (e.g. Burger)", "info");
      return;
    }
    if (ings.length === 0) {
      addToast("Add at least one raw ingredient", "info");
      return;
    }
    setBusy(true);
    const res = await savePosRecipe(shopId, finishedId, ings, notes);
    setBusy(false);
    if (!res.success) {
      addToast(res.error, "error");
      return;
    }
    addToast("Recipe saved — sale pe raw stock katay ga", "success");
    setIngs([]);
    setNotes("");
    await reload();
  }

  function loadRecipe(r: PosRecipe) {
    setFinishedId(r.product_id);
    setIngs(r.ingredients);
    setNotes(r.notes || "");
  }

  return (
    <section className="mx-auto max-w-lg space-y-2">
      <div>
        <h2 className="text-sm font-bold">Recipes / BOM</h2>
        <p className="text-[11px] text-zinc-500">
          Finished item (burger) = raw items (bun + patty + sauce). Counter sale pe finished
          ke bajaye ingredients ka stock minus hoga.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
          Finished product
        </label>
        <select
          value={finishedId}
          onChange={(e) => setFinishedId(e.target.value)}
          className="mb-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="">Select…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <p className="mb-1 text-[11px] font-semibold text-zinc-500">Ingredients</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={ingPick}
            onChange={(e) => setIngPick(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Raw product…</option>
            {products
              .filter((p) => p.id !== finishedId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.stock_qty != null ? ` (${p.stock_qty})` : ""}
                </option>
              ))}
          </select>
          <input
            type="number"
            min={0.01}
            step={0.25}
            value={ingQty}
            onChange={(e) => setIngQty(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm sm:w-24 dark:border-zinc-700 dark:bg-zinc-800"
            placeholder="Qty"
          />
          <button
            type="button"
            onClick={addIngredient}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            Add
          </button>
        </div>

        <ul className="mt-2 space-y-1">
          {ings.map((i) => (
            <li
              key={i.product_id}
              className="flex items-center justify-between rounded-lg bg-zinc-50 px-2 py-1.5 text-xs dark:bg-zinc-800"
            >
              <span>
                {i.name || byId.get(i.product_id)?.name || i.product_id} × {i.qty}
              </span>
              <button
                type="button"
                className="font-bold text-rose-500"
                onClick={() => setIngs((prev) => prev.filter((x) => x.product_id !== i.product_id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />

        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="mt-2 w-full rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          Save recipe
        </button>
      </div>

      <ul className="space-y-1.5">
        {recipes.length === 0 ? (
          <li className="rounded-xl border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-500 dark:border-zinc-700">
            No recipes yet — food / cafe / bakery packs ke liye useful
          </li>
        ) : (
          recipes.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => loadRecipe(r)}>
                  <p className="truncate text-sm font-semibold">
                    {byId.get(r.product_id)?.name || "Product"}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {r.ingredients
                      .map(
                        (i) =>
                          `${i.name || byId.get(i.product_id)?.name || "?"}×${i.qty}`,
                      )
                      .join(" · ")}
                  </p>
                </button>
                <button
                  type="button"
                  className="text-[10px] font-bold text-rose-500"
                  onClick={() =>
                    void deletePosRecipe(shopId, r.product_id).then(() => reload())
                  }
                >
                  Del
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
