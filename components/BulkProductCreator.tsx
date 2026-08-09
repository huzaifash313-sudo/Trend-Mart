"use client";

/* -------------------------------------------------------------------------- */
/*  Multi-item / table-based batch product creator                             */
/*  Rows: Name · Sub-Category · Price · Discount · Image                       */
/*  Main category is inherited from the merchant's shop profile.               */
/* -------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductFormData } from "@/types";
import {
  fetchSubCategories,
  getOthersSubCategoryId,
  resolveSubCategoryId,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";
import { bulkCreateProducts } from "@/services/productService";
import { isValidUUID } from "@/lib/sanitization";
import ImageUpload from "@/components/ImageUpload";

export interface BulkProductCreatorProps {
  shopId: string;
  /** Shop's main category — drives sub-category options. */
  shopCategory: string;
  onCreated?: () => void;
  onToast?: (message: string, variant?: "success" | "error" | "info") => void;
}

interface BulkRow {
  key: string;
  name: string;
  sub_category_id: string;
  price: string;
  original_price: string;
  image_url: string;
}

function newRow(defaultSubId = ""): BulkRow {
  return {
    key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    sub_category_id: defaultSubId,
    price: "",
    original_price: "",
    image_url: "",
  };
}

export default function BulkProductCreator({
  shopId,
  shopCategory,
  onCreated,
  onToast,
}: BulkProductCreatorProps) {
  const [subs, setSubs] = useState<SubCategoryWithMeta[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [rows, setRows] = useState<BulkRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [defaultSubId, setDefaultSubId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!shopCategory) {
        setSubs([]);
        setLoadingSubs(false);
        return;
      }
      setLoadingSubs(true);
      const result = await fetchSubCategories(shopCategory);
      if (cancelled) return;
      if (result.success) {
        setSubs(result.data);
        const others = result.data.find((s) => s.is_others);
        const id = others?.id ?? result.data[0]?.id ?? "";
        setDefaultSubId(id);
        setRows((prev) =>
          prev.map((r) => (r.sub_category_id ? r : { ...r, sub_category_id: id })),
        );
      } else {
        setSubs([]);
        onToast?.(result.error, "error");
      }
      setLoadingSubs(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [shopCategory, onToast]);

  const updateRow = useCallback((key: string, patch: Partial<BulkRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, newRow(defaultSubId)]);
  }, [defaultSubId]);

  const addFiveRows = useCallback(() => {
    setRows((prev) => [...prev, ...Array.from({ length: 5 }, () => newRow(defaultSubId))]);
  }, [defaultSubId]);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }, []);

  const filledCount = useMemo(
    () => rows.filter((r) => r.name.trim() && Number(r.price) > 0).length,
    [rows],
  );

  const handleSubmit = useCallback(async () => {
    if (!shopId) {
      onToast?.("Select a shop first.", "error");
      return;
    }
    if (!shopCategory) {
      onToast?.("Set your shop category in Store Settings first.", "error");
      return;
    }

    const validRows = rows.filter((r) => r.name.trim() && Number(r.price) > 0);
    if (validRows.length === 0) {
      onToast?.("Fill at least one row with a name and price.", "error");
      return;
    }

    setSaving(true);

    // Ensure built-in catalog exists in DB, then resolve each row's sub id
    await fetch("/api/sub-categories/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: shopCategory }),
    }).catch(() => undefined);

    const forms: ProductFormData[] = [];
    for (const r of validRows) {
      const price = Number(r.price);
      const original = r.original_price.trim() ? Number(r.original_price) : null;
      let subId =
        r.sub_category_id && isValidUUID(r.sub_category_id)
          ? r.sub_category_id
          : await resolveSubCategoryId(shopCategory, r.sub_category_id);

      if (!subId || !isValidUUID(subId)) {
        const othersFallback = await getOthersSubCategoryId(shopCategory);
        subId = isValidUUID(othersFallback) ? othersFallback : null;
      }

      forms.push({
        name: r.name.trim(),
        description: "",
        price,
        original_price:
          original && Number.isFinite(original) && original > price ? original : null,
        image_url: r.image_url.trim(),
        is_available: true,
        category_id: shopCategory,
        sub_category_id: subId,
      });
    }

    const result = await bulkCreateProducts(shopId, forms);
    setSaving(false);

    if (!result.success) {
      onToast?.(result.error, "error");
      return;
    }

    const { created, failed } = result.data;
    if (failed.length === 0) {
      onToast?.(`${created.length} product${created.length === 1 ? "" : "s"} added!`, "success");
    } else {
      onToast?.(
        `${created.length} added, ${failed.length} failed (check names/prices).`,
        "info",
      );
    }

    setRows([newRow(defaultSubId)]);
    onCreated?.();
  }, [
    shopId,
    shopCategory,
    rows,
    defaultSubId,
    onToast,
    onCreated,
  ]);

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Add Multiple Products
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Store type: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{shopCategory || "—"}</span>
            {" · "}Pick a sub-category per row, then submit all at once.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={addRow}
            className="btn-compact rounded-full border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-[color:var(--tm-border)] dark:text-zinc-300 dark:hover:bg-[color:var(--tm-elevated)]"
          >
            + Row
          </button>
          <button
            type="button"
            onClick={addFiveRows}
            className="btn-compact rounded-full border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-[color:var(--tm-border)] dark:text-zinc-300 dark:hover:bg-[color:var(--tm-elevated)]"
          >
            +5 Rows
          </button>
        </div>
      </div>

      {loadingSubs && (
        <p className="text-xs text-zinc-400 animate-pulse">Loading sub-categories…</p>
      )}

      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-[0.65rem] uppercase tracking-wider text-zinc-400 dark:border-[color:var(--tm-border)]">
              <th className="px-2 py-2 font-semibold">Name *</th>
              <th className="px-2 py-2 font-semibold">Sub-Category *</th>
              <th className="w-28 px-2 py-2 font-semibold">Price *</th>
              <th className="w-28 px-2 py-2 font-semibold">Was (discount)</th>
              <th className="min-w-[140px] px-2 py-2 font-semibold">Image</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.key}
                className="border-b border-zinc-100 align-top dark:border-[color:var(--tm-border)]"
              >
                <td className="px-2 py-2">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                    placeholder={`Product ${idx + 1}`}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    value={row.sub_category_id}
                    onChange={(e) => updateRow(row.key, { sub_category_id: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    disabled={loadingSubs || subs.length === 0}
                  >
                    {subs.length === 0 && <option value="">No sub-categories</option>}
                    {subs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon ? `${s.icon} ` : ""}
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={row.price}
                    onChange={(e) => updateRow(row.key, { price: e.target.value })}
                    placeholder="0"
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={row.original_price}
                    onChange={(e) => updateRow(row.key, { original_price: e.target.value })}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="url"
                    value={row.image_url}
                    onChange={(e) => updateRow(row.key, { image_url: e.target.value })}
                    placeholder="Image URL"
                    className="mb-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <ImageUpload
                    currentUrl={row.image_url}
                    onUploaded={(url) => updateRow(row.key, { image_url: url })}
                    folder="products"
                    fileId={`${shopId}-${row.key}`}
                    label="Upload"
                    showPreview={false}
                  />
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length <= 1}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 dark:hover:bg-red-950/30"
                    aria-label="Remove row"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((row, idx) => (
          <div
            key={row.key}
            className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-[color:var(--tm-border)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">Item {idx + 1}</span>
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                disabled={rows.length <= 1}
                className="text-xs text-red-500 disabled:opacity-30"
              >
                Remove
              </button>
            </div>
            <input
              type="text"
              value={row.name}
              onChange={(e) => updateRow(row.key, { name: e.target.value })}
              placeholder="Product name *"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <select
              value={row.sub_category_id}
              onChange={(e) => updateRow(row.key, { sub_category_id: e.target.value })}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              disabled={loadingSubs || subs.length === 0}
            >
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon ? `${s.icon} ` : ""}
                  {s.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                value={row.price}
                onChange={(e) => updateRow(row.key, { price: e.target.value })}
                placeholder="Price *"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <input
                type="number"
                min={0}
                value={row.original_price}
                onChange={(e) => updateRow(row.key, { original_price: e.target.value })}
                placeholder="Was price"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <input
              type="url"
              value={row.image_url}
              onChange={(e) => updateRow(row.key, { image_url: e.target.value })}
              placeholder="Image URL"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <ImageUpload
              currentUrl={row.image_url}
              onUploaded={(url) => updateRow(row.key, { image_url: url })}
              folder="products"
              fileId={`${shopId}-${row.key}`}
              label="Upload image"
              showPreview={!!row.image_url}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-[color:var(--tm-border)]">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {filledCount} ready · {rows.length} row{rows.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || filledCount === 0 || loadingSubs}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : `Add ${filledCount || ""} Product${filledCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
