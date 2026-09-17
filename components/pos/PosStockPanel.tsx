"use client";

/**
 * Heavy POS Inventory — category-aware stock desk:
 * health filters, stocktake, restock/damage, batch/expiry, move history.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  damageWriteOff,
  enableProductStockTracking,
  listStockMoves,
  restockProduct,
  setProductPosFavourite,
  setProductStockAvailable,
  stocktakeSetQty,
  updateProductBarcode,
  updateProductCostPrice,
  updateProductInventoryMeta,
  type PosStockMoveRow,
} from "@/services/posService";
import {
  daysUntilExpiry,
  isExpired,
  isExpiringSoon,
  listReorderQueue,
  needsReorder,
  packStockProfile,
  productStockBucket,
  suggestedRestockQty,
  summarizeStockHealth,
  type StockHealthFilter,
} from "@/lib/pos/stockRules";
import type { PosSettings } from "@/lib/pos/types";
import { formatRupees } from "@/lib/formatters";
import { useToast } from "@/components/Toast";
import type { Product } from "@/types";
import PosCatalogSetupPanel from "@/components/pos/PosCatalogSetupPanel";

const STOCK_PAGE_SIZE = 50;

/** Spreadsheet cell styles — every cell gets a gridline like Excel. */
const TH =
  "whitespace-nowrap border border-zinc-300 px-2 py-1.5 dark:border-zinc-700";
const TD = "border border-zinc-200 px-1.5 py-1 dark:border-zinc-800";
const CELL_INPUT =
  "rounded border border-zinc-200 bg-white px-1.5 py-1 text-[11px] tabular-nums dark:border-zinc-700 dark:bg-zinc-900";
const BTN_GREEN =
  "rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50";

export interface PosStockPanelProps {
  shopId: string;
  shopCategory: string;
  products: Product[];
  settings: PosSettings;
  onProductsChange: (updater: (prev: Product[]) => Product[]) => void;
  onRefresh: () => Promise<void>;
  /** Open directly on catalog setup (from Setup CTA). */
  initialMode?: "stock" | "catalog";
}

export default function PosStockPanel({
  shopId,
  shopCategory,
  products,
  settings,
  onProductsChange,
  onRefresh,
  initialMode = "catalog",
}: PosStockPanelProps) {
  const { addToast } = useToast();
  const [mode, setMode] = useState<"stock" | "catalog">(initialMode);
  const profile = useMemo(() => packStockProfile(settings.pack), [settings.pack]);
  const warnDays = profile.expiry_warn_days;
  const showBatch = settings.track_batch || profile.track_batch;
  const showExpiry = settings.track_expiry || profile.track_expiry;

  const [filter, setFilter] = useState<StockHealthFilter>("all");
  const [q, setQ] = useState("");
  /** Rows rendered at once — every row holds ~10 inputs, so keep typing snappy. */
  const [rowLimit, setRowLimit] = useState(STOCK_PAGE_SIZE);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [restockDraft, setRestockDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [moves, setMoves] = useState<PosStockMoveRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const health = summarizeStockHealth(products, settings.low_stock_threshold, warnDays);
  const reorderQueue = useMemo(
    () => listReorderQueue(products, settings.low_stock_threshold),
    [products, settings.low_stock_threshold],
  );

  const allRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = products;
    if (needle) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          (p.barcode || "").toLowerCase().includes(needle) ||
          (p.batch_no || "").toLowerCase().includes(needle) ||
          (p.short_code || "").toLowerCase().includes(needle),
      );
    }
    if (filter !== "all") {
      rows = rows.filter(
        (p) => productStockBucket(p, settings.low_stock_threshold, warnDays) === filter,
      );
    }
    return rows;
  }, [products, q, filter, settings.low_stock_threshold, warnDays]);

  const list = allRows.slice(0, rowLimit);

  useEffect(() => {
    if (!historyFor) {
      setMoves([]);
      return;
    }
    let cancelled = false;
    void listStockMoves(shopId, { productId: historyFor, limit: 30 }).then((res) => {
      if (!cancelled && res.success) setMoves(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [historyFor, shopId]);

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkRestockSuggested(targets: Product[]) {
    if (!targets.length || bulkBusy) return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const p of targets) {
        if (p.stock_qty == null) continue;
        const n = suggestedRestockQty(
          p,
          settings.low_stock_threshold,
          profile.restock_presets,
        );
        const res = await restockProduct(shopId, p.id, n, "Bulk restock");
        if (res.success) ok += 1;
        else fail += 1;
      }
      if (ok) addToast(`Restocked ${ok} item${ok === 1 ? "" : "s"}`, "success");
      if (fail) addToast(`${fail} could not update`, "error");
      setSelected(new Set());
      await onRefresh();
    } finally {
      setBulkBusy(false);
    }
  }

  const chips: { id: StockHealthFilter; label: string; count: number; tone: string }[] = [
    { id: "all", label: "All", count: health.total, tone: "bg-zinc-100 dark:bg-zinc-800" },
    { id: "low", label: "Low / reorder", count: health.low, tone: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200" },
    { id: "out", label: "Zero left", count: health.out, tone: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200" },
    {
      id: "expiring",
      label: "Expiring soon",
      count: health.expiring,
      tone: "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200",
    },
    {
      id: "untracked",
      label: "Not counted yet",
      count: health.untracked,
      tone: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800",
    },
    { id: "ok", label: "OK", count: health.ok, tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" },
  ];

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
            {mode === "catalog" ? "Product details" : "Stock maintenance"}
          </h2>
          <p className="text-[11px] text-zinc-500">
            {mode === "catalog"
              ? "Barcode, cost, reorder level & stock — fill what you need"
              : "Count, restock, damage & reorder — keep shelves healthy"}
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setMode("catalog")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              mode === "catalog"
                ? "bg-emerald-600 text-white"
                : "text-zinc-600 dark:text-zinc-300"
            }`}
          >
            Product details
          </button>
          <button
            type="button"
            onClick={() => setMode("stock")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              mode === "stock"
                ? "bg-emerald-600 text-white"
                : "text-zinc-600 dark:text-zinc-300"
            }`}
          >
            Count & restock
          </button>
        </div>
      </div>

      {mode === "catalog" ? (
        <PosCatalogSetupPanel
          shopId={shopId}
          shopCategory={shopCategory}
          products={products}
          onProductsChange={onProductsChange}
        />
      ) : (
        <>
      {reorderQueue.length > 0 ? (
        <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-white p-3 dark:border-amber-900/50 dark:from-amber-950/40 dark:to-zinc-900">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-amber-900 dark:text-amber-100">
                Reorder list · {reorderQueue.length} item
                {reorderQueue.length === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-200/80">
                Low or out — suggested qty brings stock above your reorder level
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setFilter("low");
                  setRowLimit(STOCK_PAGE_SIZE);
                }}
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
              >
                View low
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulkRestockSuggested(reorderQueue.slice(0, 40))}
                className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {bulkBusy ? "Restocking…" : "Restock all suggested"}
              </button>
            </div>
          </div>
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
            {reorderQueue.slice(0, 12).map((p) => {
              const sug = suggestedRestockQty(
                p,
                settings.low_stock_threshold,
                profile.restock_presets,
              );
              return (
                <li
                  key={`rq-${p.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-2 py-1.5 text-[11px] dark:bg-zinc-950/50"
                >
                  <span className="min-w-0 truncate font-semibold text-zinc-800 dark:text-zinc-100">
                    {p.name}
                    <span className="ml-1 font-medium text-zinc-400">
                      · {p.stock_qty ?? "—"} left
                      {p.reorder_level != null ? ` · reorder ${p.reorder_level}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busyId === p.id || bulkBusy || p.stock_qty == null}
                    onClick={() =>
                      void withBusy(p.id, async () => {
                        const res = await restockProduct(
                          shopId,
                          p.id,
                          sug,
                          "Suggested restock",
                        );
                        if (!res.success) addToast(res.error, "error");
                        else {
                          addToast(`+${sug} ${p.name}`, "success");
                          await onRefresh();
                        }
                      })
                    }
                    className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800"
                  >
                    +{sug}
                  </button>
                </li>
              );
            })}
          </ul>
          {reorderQueue.length > 12 ? (
            <p className="mt-1 text-[10px] text-amber-700/80 dark:text-amber-300/80">
              +{reorderQueue.length - 12} more — use Low filter below
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setFilter(c.id);
              setRowLimit(STOCK_PAGE_SIZE);
            }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${c.tone} ${
              filter === c.id ? "ring-2 ring-emerald-500" : ""
            }`}
          >
            {c.label} {c.count}
          </button>
        ))}
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-100">
            {selected.size} selected
          </span>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => {
              const targets = products.filter((p) => selected.has(p.id));
              void bulkRestockSuggested(targets);
            }}
            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50"
          >
            Restock selected (suggested)
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-[10px] font-semibold text-zinc-500 hover:underline"
          >
            Clear
          </button>
        </div>
      ) : null}

      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setRowLimit(STOCK_PAGE_SIZE);
        }}
        placeholder="Search product name / barcode…"
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-zinc-300 dark:border-zinc-700">
        <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-zinc-100 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <th className={`${TH} w-8 text-center`}>
                <span className="sr-only">Select</span>
              </th>
              <th className={`${TH} w-9 text-center`}>#</th>
              <th className={`${TH} min-w-[12rem]`}>Product</th>
              <th className={`${TH} text-right`}>Price</th>
              <th className={`${TH} text-right`}>On hand</th>
              <th className={TH}>Reorder ≤</th>
              <th className={TH}>Cost</th>
              {showBatch ? <th className={TH}>Batch</th> : null}
              {showExpiry ? <th className={TH}>Expiry</th> : null}
              <th className={TH}>Barcode</th>
              <th className={TH}>Exact count</th>
              <th className={TH}>Stock in / damage</th>
              <th className={`${TH} min-w-[9rem]`}>Note</th>
              <th className={TH}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td
                  colSpan={12 + (showBatch ? 1 : 0) + (showExpiry ? 1 : 0)}
                  className="px-4 py-10 text-center text-sm text-zinc-500"
                >
                  No products in this filter
                </td>
              </tr>
            ) : (
              list.map((p, idx) => {
                const bucket = productStockBucket(p, settings.low_stock_threshold, warnDays);
                const on = p.is_available !== false;
                const days = daysUntilExpiry(p.expiry_date);
                const expired = isExpired(p.expiry_date);
                const soon = isExpiringSoon(p.expiry_date, warnDays);
                const busy = busyId === p.id;
                const reorder = needsReorder(p, settings.low_stock_threshold);
                const sug =
                  p.stock_qty != null
                    ? suggestedRestockQty(
                        p,
                        settings.low_stock_threshold,
                        profile.restock_presets,
                      )
                    : 0;
                const rowTone =
                  bucket === "out"
                    ? "bg-red-50/70 dark:bg-red-950/20"
                    : bucket === "low"
                      ? "bg-amber-50/70 dark:bg-amber-950/20"
                      : bucket === "expiring"
                        ? "bg-orange-50/70 dark:bg-orange-950/20"
                        : idx % 2 === 1
                          ? "bg-zinc-50/80 dark:bg-zinc-900/40"
                          : "bg-white dark:bg-zinc-950";

                return (
                  <Fragment key={p.id}>
                    <tr className={`align-middle ${rowTone}`}>
                      <td className={`${TD} text-center`}>
                        {p.stock_qty != null ? (
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                            aria-label={`Select ${p.name}`}
                          />
                        ) : null}
                      </td>
                      <td className={`${TD} text-center tabular-nums text-zinc-400`}>
                        {idx + 1}
                      </td>
                      <td className={TD}>
                        <p className="max-w-[16rem] truncate font-semibold text-zinc-900 dark:text-zinc-50">
                          {p.name}
                        </p>
                        <p className="flex flex-wrap gap-1 text-[9px] font-bold">
                          {bucket === "low" ? <span className="text-amber-700">LOW</span> : null}
                          {bucket === "out" ? <span className="text-red-700">OUT</span> : null}
                          {expired ? (
                            <span className="text-red-700">EXPIRED</span>
                          ) : soon ? (
                            <span className="text-orange-700">EXP {days}d</span>
                          ) : null}
                          {p.stock_qty == null ? (
                            <span className="text-zinc-400">UNTRACKED</span>
                          ) : null}
                        </p>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>
                        {formatRupees(p.price)}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right font-bold tabular-nums`}>
                        {p.stock_qty != null ? (
                          <>
                            {p.stock_qty}
                            <span className="ml-0.5 text-[9px] font-medium text-zinc-400">
                              {profile.unit_label}
                            </span>
                          </>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className={TD}>
                        <input
                          type="number"
                          min={0}
                          defaultValue={p.reorder_level ?? ""}
                          key={`r-${p.id}-${p.reorder_level ?? ""}`}
                          placeholder={String(settings.low_stock_threshold)}
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            const next = raw === "" ? null : Math.max(0, Number(raw) || 0);
                            if (next === (p.reorder_level ?? null)) return;
                            void updateProductInventoryMeta(shopId, p.id, {
                              reorder_level: next,
                            }).then((res) => {
                              if (!res.success) addToast(res.error, "error");
                              else {
                                onProductsChange((prev) =>
                                  prev.map((x) =>
                                    x.id === p.id ? { ...x, reorder_level: next } : x,
                                  ),
                                );
                                addToast("Reorder level saved", "success");
                              }
                            });
                          }}
                          className={`${CELL_INPUT} w-16`}
                          aria-label="Reorder level"
                        />
                      </td>
                      <td className={TD}>
                        <input
                          type="number"
                          min={0}
                          defaultValue={p.cost_price ?? ""}
                          key={`c-${p.id}-${p.cost_price ?? ""}`}
                          placeholder="—"
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            const next = raw === "" ? null : Math.max(0, Number(raw) || 0);
                            if (next === (p.cost_price ?? null)) return;
                            void updateProductCostPrice(shopId, p.id, next).then((res) => {
                              if (!res.success) addToast(res.error, "error");
                              else {
                                onProductsChange((prev) =>
                                  prev.map((x) =>
                                    x.id === p.id ? { ...x, cost_price: next } : x,
                                  ),
                                );
                                addToast("Cost saved", "success");
                              }
                            });
                          }}
                          className={`${CELL_INPUT} w-20`}
                          aria-label="Cost"
                        />
                      </td>
                      {showBatch ? (
                        <td className={TD}>
                          <input
                            defaultValue={p.batch_no ?? ""}
                            key={`b-${p.id}-${p.batch_no ?? ""}`}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v === (p.batch_no || "")) return;
                              void updateProductInventoryMeta(shopId, p.id, {
                                batch_no: v || null,
                              }).then((res) => {
                                if (!res.success) addToast(res.error, "error");
                                else {
                                  onProductsChange((prev) =>
                                    prev.map((x) =>
                                      x.id === p.id ? { ...x, batch_no: v || null } : x,
                                    ),
                                  );
                                }
                              });
                            }}
                            className={`${CELL_INPUT} w-24 font-mono`}
                            aria-label="Batch / lot"
                          />
                        </td>
                      ) : null}
                      {showExpiry ? (
                        <td className={TD}>
                          <input
                            type="date"
                            defaultValue={p.expiry_date?.slice(0, 10) ?? ""}
                            key={`e-${p.id}-${p.expiry_date ?? ""}`}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v === (p.expiry_date?.slice(0, 10) || "")) return;
                              void updateProductInventoryMeta(shopId, p.id, {
                                expiry_date: v || null,
                              }).then((res) => {
                                if (!res.success) addToast(res.error, "error");
                                else {
                                  onProductsChange((prev) =>
                                    prev.map((x) =>
                                      x.id === p.id ? { ...x, expiry_date: v || null } : x,
                                    ),
                                  );
                                }
                              });
                            }}
                            className={`${CELL_INPUT} w-32`}
                            aria-label="Expiry"
                          />
                        </td>
                      ) : null}
                      <td className={TD}>
                        <form
                          className="flex gap-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const fd = new FormData(e.currentTarget);
                            const code = String(fd.get("barcode") || "").trim();
                            void withBusy(p.id, async () => {
                              const res = await updateProductBarcode(shopId, p.id, code || null);
                              if (!res.success) {
                                addToast(res.error, "error");
                                return;
                              }
                              onProductsChange((prev) =>
                                prev.map((x) =>
                                  x.id === p.id ? { ...x, barcode: code || null } : x,
                                ),
                              );
                              addToast("Barcode saved", "success");
                            });
                          }}
                        >
                          <input
                            name="barcode"
                            defaultValue={p.barcode ?? ""}
                            key={`${p.id}-${p.barcode ?? ""}`}
                            placeholder="—"
                            className={`${CELL_INPUT} w-28 font-mono`}
                            aria-label="Barcode"
                          />
                          <button type="submit" disabled={busy} className={BTN_GREEN}>
                            Save
                          </button>
                        </form>
                      </td>
                      <td className={TD}>
                        {p.stock_qty == null ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void withBusy(p.id, async () => {
                                const res = await enableProductStockTracking(shopId, p.id, 0);
                                if (!res.success) addToast(res.error, "error");
                                else {
                                  addToast("Tracking on — set qty", "success");
                                  await onRefresh();
                                }
                              })
                            }
                            className="whitespace-nowrap rounded border border-dashed border-emerald-400 px-2 py-1 text-[10px] font-bold text-emerald-800 dark:text-emerald-200"
                          >
                            Start counting
                          </button>
                        ) : (
                          <div className="flex gap-1">
                            <input
                              type="number"
                              min={0}
                              value={qtyDraft[p.id] ?? String(p.stock_qty)}
                              onChange={(e) =>
                                setQtyDraft((d) => ({ ...d, [p.id]: e.target.value }))
                              }
                              className={`${CELL_INPUT} w-16`}
                              aria-label="Exact count now"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void withBusy(p.id, async () => {
                                  const raw = qtyDraft[p.id] ?? String(p.stock_qty ?? 0);
                                  const res = await stocktakeSetQty(
                                    shopId,
                                    p.id,
                                    Number(raw) || 0,
                                    noteDraft[p.id],
                                  );
                                  if (!res.success) addToast(res.error, "error");
                                  else {
                                    addToast("Count saved", "success");
                                    await onRefresh();
                                  }
                                })
                              }
                              className={BTN_GREEN}
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </td>
                      <td className={TD}>
                        {p.stock_qty == null ? (
                          <span className="text-zinc-400">—</span>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex gap-1">
                              <input
                                type="number"
                                min={1}
                                value={restockDraft[p.id] ?? ""}
                                onChange={(e) =>
                                  setRestockDraft((d) => ({ ...d, [p.id]: e.target.value }))
                                }
                                placeholder="qty"
                                className={`${CELL_INPUT} w-14`}
                                aria-label="New stock arrived"
                              />
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void withBusy(p.id, async () => {
                                    const n = Math.max(
                                      1,
                                      Number(restockDraft[p.id]) ||
                                        profile.restock_presets[0] ||
                                        10,
                                    );
                                    const res = await restockProduct(
                                      shopId,
                                      p.id,
                                      n,
                                      noteDraft[p.id],
                                    );
                                    if (!res.success) addToast(res.error, "error");
                                    else {
                                      addToast(`Added +${n}`, "success");
                                      setRestockDraft((d) => ({ ...d, [p.id]: "" }));
                                      await onRefresh();
                                    }
                                  })
                                }
                                className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                              >
                                + Add
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void withBusy(p.id, async () => {
                                    const n = Math.max(1, Number(restockDraft[p.id]) || 1);
                                    if (!window.confirm(`Write off ${n} as damage/wastage?`)) return;
                                    const res = await damageWriteOff(
                                      shopId,
                                      p.id,
                                      n,
                                      noteDraft[p.id] || "Damage/wastage",
                                    );
                                    if (!res.success) addToast(res.error, "error");
                                    else {
                                      addToast(`Damage −${n}`, "info");
                                      await onRefresh();
                                    }
                                  })
                                }
                                className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-800 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                              >
                                Damage
                              </button>
                            </div>
                            {profile.restock_presets.length > 0 ? (
                              <div className="flex gap-0.5">
                                {profile.restock_presets.map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      void withBusy(p.id, async () => {
                                        const res = await restockProduct(shopId, p.id, n);
                                        if (!res.success) addToast(res.error, "error");
                                        else {
                                          addToast(`+${n}`, "success");
                                          await onRefresh();
                                        }
                                      })
                                    }
                                    className="rounded border border-zinc-200 px-1.5 py-0.5 text-[9px] font-bold dark:border-zinc-700"
                                  >
                                    +{n}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className={TD}>
                        <input
                          value={noteDraft[p.id] ?? ""}
                          onChange={(e) =>
                            setNoteDraft((d) => ({ ...d, [p.id]: e.target.value }))
                          }
                          placeholder={profile.note_hint}
                          className={`${CELL_INPUT} w-full min-w-[8rem]`}
                          aria-label="Note"
                        />
                      </td>
                      <td className={TD}>
                        <div className="flex items-center gap-1">
                          {reorder && sug > 0 ? (
                            <button
                              type="button"
                              disabled={busy || bulkBusy}
                              onClick={() =>
                                void withBusy(p.id, async () => {
                                  const res = await restockProduct(
                                    shopId,
                                    p.id,
                                    sug,
                                    "Suggested restock",
                                  );
                                  if (!res.success) addToast(res.error, "error");
                                  else {
                                    addToast(`+${sug}`, "success");
                                    await onRefresh();
                                  }
                                })
                              }
                              className={`${BTN_GREEN} whitespace-nowrap`}
                            >
                              Restock +{sug}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            title="Favourite"
                            onClick={() =>
                              void withBusy(p.id, async () => {
                                const next = !p.pos_favourite;
                                const res = await setProductPosFavourite(shopId, p.id, next);
                                if (!res.success) addToast(res.error, "error");
                                else {
                                  onProductsChange((prev) =>
                                    prev.map((x) =>
                                      x.id === p.id ? { ...x, pos_favourite: next } : x,
                                    ),
                                  );
                                }
                              })
                            }
                            className={`rounded px-1.5 py-1 text-[10px] font-bold ${
                              p.pos_favourite
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                            }`}
                          >
                            ★
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void withBusy(p.id, async () => {
                                const res = await setProductStockAvailable(shopId, p.id, !on);
                                if (!res.success) addToast(res.error, "error");
                                else await onRefresh();
                              })
                            }
                            className={`rounded px-2 py-1 text-[10px] font-bold ${
                              on
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                                : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800"
                            }`}
                          >
                            {on ? "Selling" : "Paused"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistoryFor((h) => (h === p.id ? null : p.id))}
                            className={`rounded border px-2 py-1 text-[10px] font-bold ${
                              historyFor === p.id
                                ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
                                : "border-zinc-200 dark:border-zinc-700"
                            }`}
                          >
                            History
                          </button>
                        </div>
                      </td>
                    </tr>
                    {historyFor === p.id ? (
                      <tr className="bg-zinc-50 dark:bg-zinc-900">
                        <td
                          colSpan={12 + (showBatch ? 1 : 0) + (showExpiry ? 1 : 0)}
                          className={`${TD} px-3 py-2`}
                        >
                          <p className="mb-1 text-[10px] font-bold uppercase text-zinc-500">
                            Recent moves · {p.name}
                          </p>
                          {moves.length === 0 ? (
                            <p className="text-[11px] text-zinc-500">No ledger rows yet</p>
                          ) : (
                            <table className="w-full max-w-2xl border-collapse text-[10px] tabular-nums">
                              <thead>
                                <tr className="bg-zinc-100 text-left uppercase text-zinc-500 dark:bg-zinc-800">
                                  <th className={TH}>Change</th>
                                  <th className={TH}>Reason</th>
                                  <th className={TH}>Note</th>
                                  <th className={TH}>When</th>
                                </tr>
                              </thead>
                              <tbody>
                                {moves.map((m) => (
                                  <tr key={m.id} className="bg-white dark:bg-zinc-950">
                                    <td
                                      className={`${TD} font-bold ${
                                        m.delta >= 0 ? "text-emerald-700" : "text-red-600"
                                      }`}
                                    >
                                      {m.delta >= 0 ? "+" : ""}
                                      {m.delta}
                                    </td>
                                    <td className={`${TD} uppercase text-zinc-500`}>{m.reason}</td>
                                    <td className={`${TD} text-zinc-500`}>{m.note || "—"}</td>
                                    <td className={`${TD} whitespace-nowrap text-zinc-400`}>
                                      {new Date(m.created_at).toLocaleString("en-PK", {
                                        day: "2-digit",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {allRows.length > list.length ? (
        <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-500">
          Showing {list.length} of {allRows.length}
          <button
            type="button"
            onClick={() => setRowLimit((n) => n + STOCK_PAGE_SIZE)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Show {Math.min(STOCK_PAGE_SIZE, allRows.length - list.length)} more
          </button>
        </div>
      ) : null}
        </>
      )}
    </section>
  );
}
