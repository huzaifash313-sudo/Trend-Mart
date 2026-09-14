"use client";

/**
 * Heavy POS Inventory — category-aware stock desk:
 * health filters, stocktake, restock/damage, batch/expiry, move history.
 */

import { useEffect, useMemo, useState } from "react";
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
  packStockProfile,
  productStockBucket,
  summarizeStockHealth,
  type StockHealthFilter,
} from "@/lib/pos/stockRules";
import type { PosSettings } from "@/lib/pos/types";
import { formatRupees } from "@/lib/formatters";
import { useToast } from "@/components/Toast";
import type { Product } from "@/types";
import PosCatalogSetupPanel from "@/components/pos/PosCatalogSetupPanel";

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
  const profile = packStockProfile(settings.pack);
  const warnDays = profile.expiry_warn_days;
  const showBatch = settings.track_batch || profile.track_batch;
  const showExpiry = settings.track_expiry || profile.track_expiry;

  const [filter, setFilter] = useState<StockHealthFilter>("all");
  const [q, setQ] = useState("");
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [restockDraft, setRestockDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [moves, setMoves] = useState<PosStockMoveRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const health = useMemo(
    () => summarizeStockHealth(products, settings.low_stock_threshold, warnDays),
    [products, settings.low_stock_threshold, warnDays],
  );

  const list = useMemo(() => {
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
    return rows.slice(0, 150);
  }, [products, q, filter, settings.low_stock_threshold, warnDays]);

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

  const chips: { id: StockHealthFilter; label: string; count: number; tone: string }[] = [
    { id: "all", label: "All", count: health.total, tone: "bg-zinc-100 dark:bg-zinc-800" },
    { id: "low", label: "Low", count: health.low, tone: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200" },
    { id: "out", label: "Out", count: health.out, tone: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200" },
    {
      id: "expiring",
      label: "Expiring",
      count: health.expiring,
      tone: "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200",
    },
    {
      id: "untracked",
      label: "Untracked",
      count: health.untracked,
      tone: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800",
    },
    { id: "ok", label: "OK", count: health.ok, tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {mode === "catalog" ? "Catalog setup" : "Inventory desk"}
          </h2>
          <p className="text-[11px] text-zinc-500">
            {mode === "catalog"
              ? "Online products are already in POS — fill optional fields when ready."
              : `${profile.blurb} · low ≤ ${settings.low_stock_threshold}`}
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
            Catalog setup
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
            Stock desk
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-[10px] font-bold uppercase text-zinc-400">Tracked</p>
          <p className="text-lg font-black tabular-nums">{health.tracked}</p>
        </div>
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-[10px] font-bold uppercase text-amber-700/70">Low</p>
          <p className="text-lg font-black tabular-nums text-amber-800 dark:text-amber-200">
            {health.low}
          </p>
        </div>
        <div className="rounded-xl border border-red-200/60 bg-red-50/80 px-3 py-2 dark:border-red-900 dark:bg-red-950/20">
          <p className="text-[10px] font-bold uppercase text-red-700/70">Out</p>
          <p className="text-lg font-black tabular-nums text-red-800 dark:text-red-200">
            {health.out}
          </p>
        </div>
        <div className="rounded-xl border border-orange-200/60 bg-orange-50/80 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/20">
          <p className="text-[10px] font-bold uppercase text-orange-700/70">Expiring</p>
          <p className="text-lg font-black tabular-nums text-orange-800 dark:text-orange-200">
            {health.expiring}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${c.tone} ${
              filter === c.id ? "ring-2 ring-emerald-500" : ""
            }`}
          >
            {c.label} {c.count}
          </button>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name / barcode / batch…"
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />

      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {list.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-zinc-500">No products in this filter</li>
        ) : (
          list.map((p) => {
            const bucket = productStockBucket(p, settings.low_stock_threshold, warnDays);
            const on = p.is_available !== false;
            const days = daysUntilExpiry(p.expiry_date);
            const expired = isExpired(p.expiry_date);
            const soon = isExpiringSoon(p.expiry_date, warnDays);
            const busy = busyId === p.id;

            return (
              <li
                key={p.id}
                className={`space-y-2 px-3 py-3 ${
                  bucket === "out"
                    ? "bg-red-50/50 dark:bg-red-950/15"
                    : bucket === "low"
                      ? "bg-amber-50/60 dark:bg-amber-950/15"
                      : bucket === "expiring"
                        ? "bg-orange-50/60 dark:bg-orange-950/15"
                        : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {p.name}
                      {bucket === "low" ? (
                        <span className="ml-1.5 text-[10px] font-bold text-amber-700">LOW</span>
                      ) : null}
                      {bucket === "out" ? (
                        <span className="ml-1.5 text-[10px] font-bold text-red-700">OUT</span>
                      ) : null}
                      {expired ? (
                        <span className="ml-1.5 text-[10px] font-bold text-red-700">EXPIRED</span>
                      ) : soon ? (
                        <span className="ml-1.5 text-[10px] font-bold text-orange-700">
                          EXP {days}d
                        </span>
                      ) : null}
                      {p.stock_qty == null ? (
                        <span className="ml-1.5 text-[10px] font-bold text-zinc-400">UNTRACKED</span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {formatRupees(p.price)}
                      {p.stock_qty != null ? ` · on hand ${p.stock_qty} ${profile.unit_label}` : ""}
                      {p.reorder_level != null ? ` · reorder @ ${p.reorder_level}` : ""}
                      {p.batch_no ? ` · batch ${p.batch_no}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
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
                      className={`rounded-full px-2 py-1 text-[11px] font-bold ${
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
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        on
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800"
                      }`}
                    >
                      {on ? "In" : "Out"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setHistoryFor((h) => (h === p.id ? null : p.id))
                      }
                      className="rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] font-bold dark:border-zinc-700"
                    >
                      Hist
                    </button>
                  </div>
                </div>

                {/* Stocktake + restock + damage */}
                <div className="flex flex-wrap items-end gap-2">
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
                      className="rounded-lg border border-dashed border-emerald-400 px-2.5 py-1.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-200"
                    >
                      Start tracking
                    </button>
                  ) : (
                    <>
                      <label className="text-[10px] text-zinc-500">
                        Stocktake
                        <input
                          type="number"
                          min={0}
                          value={qtyDraft[p.id] ?? String(p.stock_qty)}
                          onChange={(e) =>
                            setQtyDraft((d) => ({ ...d, [p.id]: e.target.value }))
                          }
                          className="mt-0.5 block w-20 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </label>
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
                              addToast("Stocktake saved", "success");
                              await onRefresh();
                            }
                          })
                        }
                        className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[10px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        Set
                      </button>
                      <label className="text-[10px] text-zinc-500">
                        + Restock
                        <input
                          type="number"
                          min={1}
                          value={restockDraft[p.id] ?? ""}
                          onChange={(e) =>
                            setRestockDraft((d) => ({ ...d, [p.id]: e.target.value }))
                          }
                          placeholder="qty"
                          className="mt-0.5 block w-16 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void withBusy(p.id, async () => {
                            const n = Math.max(
                              1,
                              Number(restockDraft[p.id]) || profile.restock_presets[0] || 10,
                            );
                            const res = await restockProduct(
                              shopId,
                              p.id,
                              n,
                              noteDraft[p.id],
                            );
                            if (!res.success) addToast(res.error, "error");
                            else {
                              addToast(`Restocked +${n}`, "success");
                              setRestockDraft((d) => ({ ...d, [p.id]: "" }));
                              await onRefresh();
                            }
                          })
                        }
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                      >
                        Restock
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void withBusy(p.id, async () => {
                            const n = Math.max(
                              1,
                              Number(restockDraft[p.id]) || 1,
                            );
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
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                      >
                        Damage
                      </button>
                    </>
                  )}
                </div>

                {p.stock_qty != null && profile.restock_presets.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
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
                        className="rounded-md border border-zinc-200 px-2 py-0.5 text-[10px] font-bold dark:border-zinc-700"
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                ) : null}

                <input
                  value={noteDraft[p.id] ?? ""}
                  onChange={(e) =>
                    setNoteDraft((d) => ({ ...d, [p.id]: e.target.value }))
                  }
                  placeholder={profile.note_hint}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                />

                {(showBatch || showExpiry) && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {showBatch ? (
                      <label className="text-[10px] text-zinc-500">
                        Batch / lot
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
                          className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </label>
                    ) : null}
                    {showExpiry ? (
                      <label className="text-[10px] text-zinc-500">
                        Expiry
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
                          className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </label>
                    ) : null}
                    <label className="text-[10px] text-zinc-500">
                      Reorder at
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
                            }
                          });
                        }}
                        className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </label>
                    <label className="text-[10px] text-zinc-500">
                      Cost (optional)
                      <input
                        type="number"
                        min={0}
                        defaultValue={p.cost_price ?? ""}
                        key={`c-${p.id}-${p.cost_price ?? ""}`}
                        placeholder="COGS"
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const next =
                            raw === "" ? null : Math.max(0, Number(raw) || 0);
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
                        className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </label>
                  </div>
                )}

                <form
                  className="flex gap-2"
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
                    placeholder="Barcode"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[10px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Save
                  </button>
                </form>

                {historyFor === p.id ? (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                    <p className="mb-1 text-[10px] font-bold uppercase text-zinc-500">
                      Recent moves
                    </p>
                    {moves.length === 0 ? (
                      <p className="text-[11px] text-zinc-500">No ledger rows yet</p>
                    ) : (
                      <ul className="max-h-40 space-y-1 overflow-y-auto">
                        {moves.map((m) => (
                          <li
                            key={m.id}
                            className="flex justify-between gap-2 text-[10px] tabular-nums"
                          >
                            <span>
                              <span
                                className={
                                  m.delta >= 0 ? "font-bold text-emerald-700" : "font-bold text-red-600"
                                }
                              >
                                {m.delta >= 0 ? "+" : ""}
                                {m.delta}
                              </span>{" "}
                              <span className="uppercase text-zinc-500">{m.reason}</span>
                              {m.note ? (
                                <span className="text-zinc-400"> · {m.note}</span>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-zinc-400">
                              {new Date(m.created_at).toLocaleString("en-PK", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
        </>
      )}
    </section>
  );
}
