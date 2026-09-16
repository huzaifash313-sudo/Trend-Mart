"use client";

/**
 * POS Catalog Setup — online products already power billing.
 * Fill optional POS fields (barcode, cost, stock…) by subcategory.
 * Save one row or all changed rows; leave blanks for later.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  setProductPosFavourite,
  stocktakeSetQty,
  updateProductBarcode,
  updateProductCostPrice,
  updateProductInventoryMeta,
} from "@/services/posService";
import { fetchSubCategories } from "@/services/subCategoryService";
import { formatRupees } from "@/lib/formatters";
import { useToast } from "@/components/Toast";
import type { Product } from "@/types";

type Draft = {
  barcode: string;
  cost: string;
  stock: string;
  reorder: string;
  batch: string;
  expiry: string;
  favourite: boolean;
};

function emptyDraft(p: Product): Draft {
  return {
    barcode: p.barcode || "",
    cost: p.cost_price != null ? String(p.cost_price) : "",
    stock: p.stock_qty != null ? String(p.stock_qty) : "",
    reorder: p.reorder_level != null ? String(p.reorder_level) : "",
    batch: p.batch_no || "",
    expiry: (p.expiry_date || "").slice(0, 10),
    favourite: Boolean(p.pos_favourite),
  };
}

function isMissingPosFields(p: Product): boolean {
  return (
    !p.barcode?.trim() ||
    p.cost_price == null ||
    p.stock_qty == null
  );
}

function draftChanged(p: Product, d: Draft): boolean {
  const base = emptyDraft(p);
  return (
    d.barcode.trim() !== base.barcode.trim() ||
    d.cost.trim() !== base.cost.trim() ||
    d.stock.trim() !== base.stock.trim() ||
    d.reorder.trim() !== base.reorder.trim() ||
    d.batch.trim() !== base.batch.trim() ||
    d.expiry.trim() !== base.expiry.trim() ||
    d.favourite !== base.favourite
  );
}

export interface PosCatalogSetupPanelProps {
  shopId: string;
  shopCategory: string;
  products: Product[];
  onProductsChange: (updater: (prev: Product[]) => Product[]) => void;
}

export default function PosCatalogSetupPanel({
  shopId,
  shopCategory,
  products,
  onProductsChange,
}: PosCatalogSetupPanelProps) {
  const { addToast } = useToast();
  const [q, setQ] = useState("");
  const [subFilter, setSubFilter] = useState<string>("all");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [lowStockFirst, setLowStockFirst] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [subNames, setSubNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE = 40;

  useEffect(() => {
    let cancelled = false;
    void fetchSubCategories(shopCategory).then((res) => {
      if (cancelled || !res.success) return;
      const map: Record<string, string> = {};
      for (const s of res.data) map[s.id] = s.name;
      setSubNames(map);
    });
    return () => {
      cancelled = true;
    };
  }, [shopCategory]);

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of products) {
        if (!next[p.id]) next[p.id] = emptyDraft(p);
      }
      return next;
    });
  }, [products]);

  const subOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const key = p.sub_category_id || "__none__";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const opts = [...counts.entries()].map(([id, count]) => ({
      id,
      label:
        id === "__none__"
          ? "Uncategorized"
          : subNames[id] || "Sub-category",
      count,
    }));
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [products, subNames]);

  const missingCount = useMemo(
    () => products.filter(isMissingPosFields).length,
    [products],
  );

  /**
   * Products created without a photo (bulk-add / CSV import / "save custom item"
   * all allow skipping it). They sell fine, but look blank on the storefront —
   * surface the count so photos can be added later.
   */
  const missingPhotoCount = useMemo(
    () =>
      products.filter(
        (p) =>
          p.sell_online !== false &&
          !(p.image_url || "").trim() &&
          !(Array.isArray(p.images) && p.images.some((u) => (u || "").trim())),
      ).length,
    [products],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = products;
    if (subFilter !== "all") {
      rows = rows.filter((p) =>
        subFilter === "__none__"
          ? !p.sub_category_id
          : p.sub_category_id === subFilter,
      );
    }
    if (onlyMissing) rows = rows.filter(isMissingPosFields);
    if (needle) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          (p.barcode || "").toLowerCase().includes(needle) ||
          (p.short_code || "").toLowerCase().includes(needle),
      );
    }
    if (lowStockFirst) {
      rows = [...rows].sort((a, b) => {
        const aq = a.stock_qty;
        const bq = b.stock_qty;
        if (aq == null && bq == null) return a.name.localeCompare(b.name);
        if (aq == null) return 1;
        if (bq == null) return -1;
        const ath = a.reorder_level ?? 5;
        const bth = b.reorder_level ?? 5;
        const aneed = aq <= ath ? 0 : 1;
        const bneed = bq <= bth ? 0 : 1;
        if (aneed !== bneed) return aneed - bneed;
        if (aq !== bq) return aq - bq;
        return a.name.localeCompare(b.name);
      });
    }
    return rows;
  }, [products, q, subFilter, onlyMissing, lowStockFirst]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageSafe = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(pageSafe * PAGE, pageSafe * PAGE + PAGE);

  const dirtyIds = useMemo(() => {
    return products
      .filter((p) => {
        const d = drafts[p.id];
        return d && draftChanged(p, d);
      })
      .map((p) => p.id);
  }, [products, drafts]);

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || emptyDraft(products.find((x) => x.id === id)!)), ...patch },
    }));
  }

  async function saveOne(p: Product): Promise<boolean> {
    const d = drafts[p.id] || emptyDraft(p);
    const barcode = d.barcode.trim() || null;
    const costRaw = d.cost.trim();
    const cost =
      costRaw === "" ? null : Math.max(0, Math.round(Number(costRaw) * 100) / 100);
    const stockRaw = d.stock.trim();
    const stock =
      stockRaw === "" ? null : Math.max(0, Math.round(Number(stockRaw) * 100) / 100);
    const reorderRaw = d.reorder.trim();
    const reorder =
      reorderRaw === ""
        ? null
        : Math.max(0, Math.round(Number(reorderRaw)));

    const r1 = await updateProductBarcode(shopId, p.id, barcode);
    if (!r1.success) {
      addToast(r1.error || "Barcode save failed", "error");
      return false;
    }
    const r2 = await updateProductCostPrice(shopId, p.id, cost);
    if (!r2.success) {
      addToast(r2.error || "Cost save failed", "error");
      return false;
    }
    const r3 = await updateProductInventoryMeta(shopId, p.id, {
      batch_no: d.batch.trim() || null,
      expiry_date: d.expiry.trim() || null,
      reorder_level: reorder,
    });
    if (!r3.success) {
      addToast(r3.error || "Inventory meta failed", "error");
      return false;
    }
    if (stock != null) {
      const r4 = await stocktakeSetQty(shopId, p.id, stock, "Catalog setup");
      if (!r4.success) {
        addToast(r4.error || "Stock save failed", "error");
        return false;
      }
    }
    if (Boolean(p.pos_favourite) !== d.favourite) {
      await setProductPosFavourite(shopId, p.id, d.favourite);
    }

    onProductsChange((prev) =>
      prev.map((x) =>
        x.id === p.id
          ? {
              ...x,
              barcode,
              cost_price: cost,
              stock_qty: stock != null ? stock : x.stock_qty,
              batch_no: d.batch.trim() || null,
              expiry_date: d.expiry.trim() || null,
              reorder_level: reorder,
              pos_favourite: d.favourite,
            }
          : x,
      ),
    );
    setDrafts((prev) => ({
      ...prev,
      [p.id]: {
        barcode: barcode || "",
        cost: cost != null ? String(cost) : "",
        stock: stock != null ? String(stock) : "",
        reorder: reorder != null ? String(reorder) : "",
        batch: d.batch.trim(),
        expiry: d.expiry.trim(),
        favourite: d.favourite,
      },
    }));
    return true;
  }

  async function saveAllDirty() {
    if (dirtyIds.length === 0) {
      addToast("No changes to save", "info");
      return;
    }
    setBusy(true);
    let ok = 0;
    for (const id of dirtyIds) {
      const p = products.find((x) => x.id === id);
      if (!p) continue;
      if (await saveOne(p)) ok += 1;
    }
    setBusy(false);
    addToast(`Saved ${ok} product${ok === 1 ? "" : "s"}`, "success");
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Link
          href="/dashboard/products/new"
          className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700"
        >
          Bulk add products
        </Link>
        <Link
          href="/dashboard/products"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          Products page · CSV
        </Link>
        <span className="text-[10px] text-zinc-500">
          {products.length} items · {missingCount} still missing optional fields
        </span>
        {missingPhotoCount > 0 ? (
          <Link
            href="/dashboard/products"
            className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300"
            title="These products show online without a photo — add one from the Products page"
          >
            🖼 {missingPhotoCount} online item{missingPhotoCount === 1 ? "" : "s"} without a photo
          </Link>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Search product name, barcode, SKU"
          className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          value={subFilter}
          onChange={(e) => {
            setSubFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="all">All groups ({products.length})</option>
          {subOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} ({o.count})
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-900">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => {
              setOnlyMissing(e.target.checked);
              setPage(0);
            }}
            className="rounded border-zinc-300 text-emerald-600"
          />
          Only incomplete rows
        </label>
        <label className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <input
            type="checkbox"
            checked={lowStockFirst}
            onChange={(e) => {
              setLowStockFirst(e.target.checked);
              setPage(0);
            }}
            className="rounded border-amber-300 text-emerald-600"
          />
          Low / reorder first
        </label>
        <button
          type="button"
          disabled={busy || dirtyIds.length === 0}
          onClick={() => void saveAllDirty()}
          className="rounded-xl bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : `Save changes (${dirtyIds.length})`}
        </button>
      </div>

      <p className="text-[11px] text-zinc-500">
        Showing {pageRows.length} of {filtered.length}
        {filtered.length !== products.length ? ` (filtered)` : ""}
        {" · "}Barcode / Cost / Stock / Reorder — optional, fill when ready
      </p>

      {/* Spreadsheet — same sheet on phone (scrolls sideways) and desktop */}
      <div className="max-h-[70vh] overflow-auto rounded-lg border border-zinc-300 dark:border-zinc-700">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-zinc-100 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <th className="w-9 whitespace-nowrap border border-zinc-300 px-2 py-1.5 text-center dark:border-zinc-700">#</th>
              <th className="whitespace-nowrap border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">Product</th>
              <th className="whitespace-nowrap border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">Sub-category</th>
              <th className="whitespace-nowrap border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">Price</th>
              <th className="whitespace-nowrap border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">Barcode</th>
              <th className="whitespace-nowrap border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">Cost</th>
              <th className="whitespace-nowrap border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">Stock</th>
              <th className="whitespace-nowrap border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">Reorder</th>
              <th className="whitespace-nowrap border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">Fav</th>
              <th className="whitespace-nowrap border border-zinc-300 px-3 py-1.5 dark:border-zinc-700" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p, idx) => {
              const d = drafts[p.id] || emptyDraft(p);
              const subLabel = p.sub_category_id
                ? subNames[p.sub_category_id] || "—"
                : "Uncategorized";
              return (
                <tr
                  key={p.id}
                  className={`align-middle ${
                    idx % 2 === 1 ? "bg-zinc-50/80 dark:bg-zinc-900/40" : "bg-white dark:bg-zinc-950"
                  }`}
                >
                  <td className={`${TD} text-center text-xs tabular-nums text-zinc-400`}>
                    {pageSafe * PAGE + idx + 1}
                  </td>
                  <td className={`${TD} max-w-[14rem] truncate px-3 py-1.5 font-semibold text-zinc-900 dark:text-zinc-50`}>
                    {p.name}
                  </td>
                  <td className={`${TD} whitespace-nowrap px-3 py-1.5 text-xs text-zinc-500`}>
                    {subLabel}
                  </td>
                  <td className={`${TD} whitespace-nowrap px-3 py-1.5 tabular-nums`}>
                    {formatRupees(p.price)}
                  </td>
                  <td className={`${TD} px-2 py-1.5`}>
                    <input
                      value={d.barcode}
                      onChange={(e) => patchDraft(p.id, { barcode: e.target.value })}
                      className="w-28 rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      placeholder="Optional"
                    />
                  </td>
                  <td className={`${TD} px-2 py-1.5`}>
                    <input
                      value={d.cost}
                      onChange={(e) => patchDraft(p.id, { cost: e.target.value })}
                      inputMode="decimal"
                      className="w-20 rounded border border-zinc-200 bg-white px-2 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                      placeholder="—"
                    />
                  </td>
                  <td className={`${TD} px-2 py-1.5`}>
                    <input
                      value={d.stock}
                      onChange={(e) => patchDraft(p.id, { stock: e.target.value })}
                      inputMode="decimal"
                      className="w-20 rounded border border-zinc-200 bg-white px-2 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                      placeholder="—"
                    />
                  </td>
                  <td className={`${TD} px-2 py-1.5`}>
                    <input
                      value={d.reorder}
                      onChange={(e) => patchDraft(p.id, { reorder: e.target.value })}
                      inputMode="numeric"
                      className="w-16 rounded border border-zinc-200 bg-white px-2 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                      placeholder="—"
                    />
                  </td>
                  <td className={`${TD} px-3 py-1.5 text-center`}>
                    <input
                      type="checkbox"
                      checked={d.favourite}
                      onChange={(e) => patchDraft(p.id, { favourite: e.target.checked })}
                    />
                  </td>
                  <td className={`${TD} px-2 py-1.5`}>
                    <button
                      type="button"
                      disabled={busy || !draftChanged(p, d)}
                      onClick={() =>
                        void saveOne(p).then((ok) => ok && addToast("Saved", "success"))
                      }
                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          {onlyMissing
            ? "No products with missing POS fields in this filter."
            : "No products match."}
        </p>
      ) : null}

      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={pageSafe <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-zinc-700"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            {pageSafe + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={pageSafe >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-zinc-700"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

const TD = "border border-zinc-200 dark:border-zinc-800";

