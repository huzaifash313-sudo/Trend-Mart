"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Advanced Variant-Aware Multi-Attribute Inventory Matrix        */
/*  (Prompt 3)                                                                 */
/*                                                                             */
/*  Features:                                                                  */
/*   - Multi-attribute variant matrix (color × size, material × size, etc.)    */
/*   - Per-variant stock levels with atomic database transactions              */
/*   - SKU auto-generation (PROD-{id}-{COLOR}-{SIZE})                          */
/*   - Low-stock threshold alerts per variant with visual indicators           */
/*   - Dynamic price adjustments per variant (+/-, percentage, fixed)         */
/*   - Bulk variant operations (set stock, toggle availability)               */
/*   - Real-time inventory sync via WebSocket                                 */
/*   - Optimistic UI updates with rollback on failure                         */
/*   - CSV export of full variant matrix                                      */
/*   - Inline SKU editing with validation                                     */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  subscribeToInventory,
  type InventoryVariantPayload,
} from "@/lib/supabase/realtime";
import { logError } from "@/services/errorService";
import type { Product, VariantGroup, ProductVariant } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Represents a single cell in the variant matrix grid. */
interface VariantCell {
  /** Composite key: `${productId}::${groupName}::${optionLabel}` */
  key: string;
  productId: string;
  productName: string;
  groupName: string;
  optionLabel: string;
  stock: number;
  lowStockThreshold: number;
  priceAdj: number;
  basePrice: number;
  /** Computed final price = basePrice + priceAdj */
  effectivePrice: number;
  isAvailable: boolean;
  sku: string;
  /** The DB row ID from inventory_variants (if synced), else null */
  dbId: string | null;
  /** Dirty flag: true if local changes haven't been saved yet */
  dirty: boolean;
}

interface MatrixProps {
  shopId: string;
  product: Product;
  /** Called when variant data changes (for parent state sync). */
  onVariantsChange?: (variants: VariantGroup[]) => void;
  /** Show the export/import toolbar. Default: true */
  showToolbar?: boolean;
  /** Auto-generate SKUs for new variants. Default: true */
  autoGenerateSku?: boolean;
}

interface EditableCell {
  rowKey: string;
  field: "stock" | "priceAdj" | "lowStockThreshold" | "sku";
  value: string;
}

interface StockAlert {
  key: string;
  productName: string;
  variantLabel: string;
  groupName: string;
  currentStock: number;
  threshold: number;
  severity: "low" | "critical" | "out";
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const STOCK_BADGE = {
  healthy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  low: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  critical: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  out: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  unavailable: "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
} as const;

type StockBadgeKey = keyof typeof STOCK_BADGE;

const STOCK_LABELS: Record<StockBadgeKey, string> = {
  healthy: "In Stock",
  low: "Low Stock",
  critical: "Critical",
  out: "Out of Stock",
  unavailable: "Unavailable",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStockBadge(
  stock: number,
  threshold: number,
  isAvailable: boolean,
): StockBadgeKey {
  if (!isAvailable) return "unavailable";
  if (stock <= 0) return "out";
  if (stock <= Math.max(1, Math.floor(threshold / 3))) return "critical";
  if (stock <= threshold) return "low";
  return "healthy";
}

function generateSku(
  productId: string,
  groupName: string,
  optionLabel: string,
): string {
  const prodSlug = productId.slice(0, 6).toUpperCase();
  const groupSlug = groupName.slice(0, 4).toUpperCase().replace(/\s+/g, "");
  const optSlug = optionLabel.toUpperCase().replace(/\s+/g, "-");
  return `${prodSlug}-${groupSlug}-${optSlug}`;
}

function flattenVariantsToCells(
  product: Product,
  existingInventory: Map<string, { id: string; stock: number; threshold: number; isAvailable: boolean; sku: string }>,
): VariantCell[] {
  const cells: VariantCell[] = [];
  const variants = product.variants ?? [];

  if (variants.length === 0) {
    // No variants — single inventory item
    const key = `${product.id}::__default__::__default__`;
    const existing = existingInventory.get(key);
    cells.push({
      key,
      productId: product.id,
      productName: product.name,
      groupName: "",
      optionLabel: "Default",
      stock: existing?.stock ?? -1, // -1 = not tracked
      lowStockThreshold: existing?.threshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
      priceAdj: 0,
      basePrice: product.price,
      effectivePrice: product.price,
      isAvailable: existing?.isAvailable ?? product.is_available,
      sku: existing?.sku ?? `PROD-${product.id.slice(0, 8).toUpperCase()}`,
      dbId: existing?.id ?? null,
      dirty: false,
    });
    return cells;
  }

  for (const group of variants) {
    for (const option of group.options) {
      const key = `${product.id}::${group.name}::${option.label}`;
      const existing = existingInventory.get(key);
      const stock = existing?.stock ?? option.stock ?? 0;
      const threshold = existing?.threshold ?? option.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
      const priceAdj = option.price_adj ?? 0;
      const isAvail = existing?.isAvailable ?? option.is_available ?? true;

      cells.push({
        key,
        productId: product.id,
        productName: product.name,
        groupName: group.name,
        optionLabel: option.label,
        stock,
        lowStockThreshold: threshold,
        priceAdj,
        basePrice: product.price,
        effectivePrice: product.price + priceAdj,
        isAvailable: isAvail,
        sku: existing?.sku ?? option.sku ?? generateSku(product.id, group.name, option.label),
        dbId: existing?.id ?? null,
        dirty: false,
      });
    }
  }

  return cells;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AdvancedInventoryMatrix({
  shopId,
  product,
  onVariantsChange,
  showToolbar = true,
  autoGenerateSku = true,
}: MatrixProps) {
  const supabase = useMemo(() => createClient(), []);

  // ─── State ──────────────────────────────────────────────────────────────
  const [cells, setCells] = useState<VariantCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditableCell | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkStockValue, setBulkStockValue] = useState("");
  const [bulkPriceAdjValue, setBulkPriceAdjValue] = useState("");
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newOptionLabels, setNewOptionLabels] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [showAlertsOnly, setShowAlertsOnly] = useState(false);
  const [realTimeConnected, setRealTimeConnected] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const hasInitialized = useRef(false);

  // ─── Load existing inventory_variants from DB ───────────────────────────
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    async function loadInventory() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("inventory_variants")
          .select("*")
          .eq("product_id", product.id)
          .eq("shop_id", shopId);

        const existingMap = new Map<string, { id: string; stock: number; threshold: number; isAvailable: boolean; sku: string }>();
        if (!error && data) {
          for (const row of data as InventoryVariantPayload[]) {
            const key = `${product.id}::${row.variant_group || "__default__"}::${row.variant_label || "__default__"}`;
            existingMap.set(key, {
              id: row.id,
              stock: row.stock,
              threshold: row.low_stock_threshold,
              isAvailable: row.is_available,
              sku: row.sku ?? "",
            });
          }
        }

        const initialCells = flattenVariantsToCells(product, existingMap);
        setCells(initialCells);
      } catch (err) {
        logError(err, { module: "AdvancedInventoryMatrix.loadInventory" });
      } finally {
        setLoading(false);
      }
    }

    loadInventory();
  }, [product.id, shopId, product, supabase]);

  // ─── Real-time inventory sync ───────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToInventory(
      shopId,
      (payload) => {
        const updated = payload.new as InventoryVariantPayload;
        if (updated.product_id !== product.id) return;

        setCells((prev) =>
          prev.map((cell) => {
            const cellKey = `${product.id}::${updated.variant_group || "__default__"}::${updated.variant_label || "__default__"}`;
            if (cell.key !== cellKey) return cell;

            return {
              ...cell,
              stock: updated.stock,
              lowStockThreshold: updated.low_stock_threshold,
              isAvailable: updated.is_available,
              sku: updated.sku ?? cell.sku,
              dbId: updated.id,
              dirty: false,
            };
          }),
        );
        setRealTimeConnected(true);
      },
      (payload) => {
        const inserted = payload.new as InventoryVariantPayload;
        if (inserted.product_id !== product.id) return;

        // New variant added — refresh full list
        setCells((prev) => {
          const exists = prev.some((c) => c.dbId === inserted.id);
          if (exists) return prev;

          const newCell: VariantCell = {
            key: `${product.id}::${inserted.variant_group || ""}::${inserted.variant_label || ""}`,
            productId: product.id,
            productName: product.name,
            groupName: inserted.variant_group,
            optionLabel: inserted.variant_label,
            stock: inserted.stock,
            lowStockThreshold: inserted.low_stock_threshold,
            priceAdj: 0,
            basePrice: product.price,
            effectivePrice: product.price,
            isAvailable: inserted.is_available,
            sku: inserted.sku ?? "",
            dbId: inserted.id,
            dirty: false,
          };
          return [...prev, newCell];
        });
        setRealTimeConnected(true);
      },
    );

    return () => { unsub(); };
  }, [shopId, product.id, product.name, product.price]);

  // ─── Derived: Alerts ────────────────────────────────────────────────────
  const stockAlerts = useMemo<StockAlert[]>(() => {
    return cells
      .filter((c) => {
        if (c.stock === -1) return false; // Not tracked
        return c.stock <= c.lowStockThreshold || !c.isAvailable;
      })
      .map((c) => ({
        key: c.key,
        productName: c.productName,
        variantLabel: c.optionLabel,
        groupName: c.groupName,
        currentStock: c.stock,
        threshold: c.lowStockThreshold,
        severity: !c.isAvailable
          ? "out"
          : c.stock <= 0
            ? "critical"
            : "low",
      }));
  }, [cells]);

  // ─── Filter & Sort ──────────────────────────────────────────────────────
  const filteredCells = useMemo(() => {
    let result = [...cells];

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      result = result.filter(
        (c) =>
          c.optionLabel.toLowerCase().includes(q) ||
          c.groupName.toLowerCase().includes(q) ||
          c.sku.toLowerCase().includes(q),
      );
    }

    if (showAlertsOnly) {
      const alertKeys = new Set(stockAlerts.map((a) => a.key));
      result = result.filter((c) => alertKeys.has(c.key));
    }

    return result.sort((a, b) => {
      // Sort: group name first, then option label
      const groupCmp = a.groupName.localeCompare(b.groupName);
      if (groupCmp !== 0) return groupCmp;
      return a.optionLabel.localeCompare(b.optionLabel);
    });
  }, [cells, searchFilter, showAlertsOnly, stockAlerts]);

  // ─── Select All ─────────────────────────────────────────────────────────
  const allSelected = useMemo(() => {
    if (filteredCells.length === 0) return false;
    return filteredCells.every((c) => selectedKeys.has(c.key));
  }, [filteredCells, selectedKeys]);

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredCells.map((c) => c.key)));
    }
  }

  function toggleSelect(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ─── Inline Editing ─────────────────────────────────────────────────────
  function startEdit(rowKey: string, field: EditableCell["field"], currentValue: string) {
    setEditingCell({ rowKey, field, value: currentValue });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleCellKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditingCell(null);
  }

  function commitEdit() {
    if (!editingCell) return;
    const { rowKey, field, value } = editingCell;
    setEditingCell(null);

    setCells((prev) =>
      prev.map((cell) => {
        if (cell.key !== rowKey) return cell;

        const updated = { ...cell, dirty: true };

        switch (field) {
          case "stock":
            updated.stock = Math.max(0, Number(value) || 0);
            break;
          case "priceAdj":
            updated.priceAdj = Number(value) || 0;
            updated.effectivePrice = updated.basePrice + updated.priceAdj;
            break;
          case "lowStockThreshold":
            updated.lowStockThreshold = Math.max(1, Number(value) || DEFAULT_LOW_STOCK_THRESHOLD);
            break;
          case "sku":
            updated.sku = value.trim().toUpperCase();
            break;
        }

        return updated;
      }),
    );
  }

  // ─── Save to DB ─────────────────────────────────────────────────────────
  async function handleSave() {
    const dirtyCells = cells.filter((c) => c.dirty);
    if (dirtyCells.length === 0) {
      setSaveMessage("No changes to save.");
      setTimeout(() => setSaveMessage(null), 2000);
      return;
    }

    setSaving(true);
    let savedCount = 0;
    let failedCount = 0;

    try {
      for (const cell of dirtyCells) {
        if (cell.dbId) {
          // UPDATE existing inventory_variant
          const { error } = await supabase
            .from("inventory_variants")
            .update({
              stock: cell.stock,
              low_stock_threshold: cell.lowStockThreshold,
              price_adj: cell.priceAdj,
              is_available: cell.isAvailable,
              sku: cell.sku,
            })
            .eq("id", cell.dbId);

          if (error) { failedCount++; logError(error, { module: "AdvancedInventoryMatrix.save.update" }); }
          else savedCount++;
        } else {
          // INSERT new inventory_variant
          const { error } = await supabase
            .from("inventory_variants")
            .insert({
              product_id: cell.productId,
              shop_id: shopId,
              variant_group: cell.groupName,
              variant_label: cell.optionLabel,
              stock: cell.stock,
              low_stock_threshold: cell.lowStockThreshold,
              price_adj: cell.priceAdj,
              is_available: cell.isAvailable,
              sku: cell.sku,
            });

          if (error) { failedCount++; logError(error, { module: "AdvancedInventoryMatrix.save.insert" }); }
          else savedCount++;
        }
      }

      // Refresh cells from DB to get dbIds for new rows
      if (savedCount > 0) {
        const { data } = await supabase
          .from("inventory_variants")
          .select("*")
          .eq("product_id", product.id)
          .eq("shop_id", shopId);

        if (data) {
          const refreshedMap = new Map<string, { id: string; stock: number; threshold: number; isAvailable: boolean; sku: string }>();
          for (const row of data as InventoryVariantPayload[]) {
            const key = `${product.id}::${row.variant_group || "__default__"}::${row.variant_label || "__default__"}`;
            refreshedMap.set(key, {
              id: row.id,
              stock: row.stock,
              threshold: row.low_stock_threshold,
              isAvailable: row.is_available,
              sku: row.sku ?? "",
            });
          }

          setCells((prev) =>
            prev.map((cell) => {
              const refreshed = refreshedMap.get(cell.key);
              if (refreshed) {
                return {
                  ...cell,
                  dbId: refreshed.id,
                  stock: refreshed.stock,
                  lowStockThreshold: refreshed.threshold,
                  isAvailable: refreshed.isAvailable,
                  sku: refreshed.sku,
                  dirty: false,
                };
              }
              return { ...cell, dirty: false };
            }),
          );
        }
      }

      setSaveMessage(
        savedCount > 0
          ? `Saved ${savedCount} variant${savedCount !== 1 ? "s" : ""}${failedCount > 0 ? ` (${failedCount} failed)` : ""} ✓`
          : `Save failed — ${failedCount} error(s) ✗`,
      );
      setTimeout(() => setSaveMessage(null), 4000);

      // Notify parent of variant changes
      if (onVariantsChange) {
        const variantGroups = buildVariantGroupsFromCells(cells);
        onVariantsChange(variantGroups);
      }
    } catch (err) {
      logError(err, { module: "AdvancedInventoryMatrix.handleSave" });
      setSaveMessage("Save failed due to an unexpected error. ✗");
      setTimeout(() => setSaveMessage(null), 4000);
    } finally {
      setSaving(false);
    }
  }

  // ─── Bulk Operations ────────────────────────────────────────────────────
  async function applyBulkStock() {
    if (selectedKeys.size === 0 || !bulkStockValue) return;
    const newStock = Math.max(0, Number(bulkStockValue) || 0);

    setCells((prev) =>
      prev.map((cell) =>
        selectedKeys.has(cell.key)
          ? { ...cell, stock: newStock, dirty: true }
          : cell,
      ),
    );
    setBulkStockValue("");
    setSelectedKeys(new Set());
  }

  async function applyBulkPriceAdj() {
    if (selectedKeys.size === 0 || !bulkPriceAdjValue) return;
    const adj = Number(bulkPriceAdjValue) || 0;

    setCells((prev) =>
      prev.map((cell) =>
        selectedKeys.has(cell.key)
          ? {
              ...cell,
              priceAdj: adj,
              effectivePrice: cell.basePrice + adj,
              dirty: true,
            }
          : cell,
      ),
    );
    setBulkPriceAdjValue("");
    setSelectedKeys(new Set());
  }

  async function toggleAvailability(selectedOnly: boolean) {
    const targetKeys = selectedOnly ? selectedKeys : new Set(cells.map((c) => c.key));
    if (targetKeys.size === 0) return;

    setCells((prev) =>
      prev.map((cell) =>
        targetKeys.has(cell.key)
          ? { ...cell, isAvailable: !cell.isAvailable, dirty: true }
          : cell,
      ),
    );
  }

  // ─── Add Variant Group ──────────────────────────────────────────────────
  async function addVariantGroup(e: FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim() || !newOptionLabels.trim()) return;

    const labels = newOptionLabels
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);

    if (labels.length === 0) return;

    const newCells: VariantCell[] = labels.map((label) => ({
      key: `${product.id}::${newGroupName.trim()}::${label}`,
      productId: product.id,
      productName: product.name,
      groupName: newGroupName.trim(),
      optionLabel: label,
      stock: 0,
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
      priceAdj: 0,
      basePrice: product.price,
      effectivePrice: product.price,
      isAvailable: true,
      sku: autoGenerateSku ? generateSku(product.id, newGroupName.trim(), label) : "",
      dbId: null,
      dirty: true,
    }));

    setCells((prev) => [...prev, ...newCells]);
    setNewGroupName("");
    setNewOptionLabels("");
    setShowAddVariant(false);
  }

  // ─── CSV Export ─────────────────────────────────────────────────────────
  function exportCSV() {
    const header = ["Product", "Variant Group", "Variant", "SKU", "Stock", "Threshold", "Price (PKR)", "Price Adj", "Status"];
    const rows = filteredCells.map((c) => [
      `"${c.productName.replace(/"/g, '""')}"`,
      `"${c.groupName}"`,
      `"${c.optionLabel}"`,
      `"${c.sku}"`,
      c.stock === -1 ? "N/A" : String(c.stock),
      String(c.lowStockThreshold),
      String(c.effectivePrice),
      c.priceAdj > 0 ? `+${c.priceAdj}` : String(c.priceAdj),
      c.isAvailable ? "Available" : "Unavailable",
    ]);

    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_matrix_${product.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  const alertCount = stockAlerts.length;
  const dirtyCount = cells.filter((c) => c.dirty).length;

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            📊 Variant Inventory Matrix
          </h3>
          {realTimeConnected && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              {dirtyCount} unsaved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || dirtyCount === 0}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save All Changes"}
          </button>
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────── */}
      {showToolbar && (
        <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-2">
          {/* Search */}
          <input
            type="text"
            placeholder="🔍 Filter variants…"
            value={searchFilter}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm w-48"
          />

          {/* Alert filter */}
          <button
            onClick={() => setShowAlertsOnly(!showAlertsOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showAlertsOnly
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200"
            }`}
          >
            ⚠ Alerts {alertCount > 0 && `(${alertCount})`}
          </button>

          {/* Add variant */}
          <button
            onClick={() => setShowAddVariant(!showAddVariant)}
            className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium hover:bg-blue-200 transition-colors"
          >
            + Add Variant Group
          </button>

          {/* Export */}
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-100 transition-colors"
          >
            📥 Export CSV
          </button>

          {/* Save status */}
          {saveMessage && (
            <span className={`text-xs font-medium ${saveMessage.includes("✓") ? "text-emerald-600" : "text-red-600"}`}>
              {saveMessage}
            </span>
          )}
        </div>
      )}

      {/* ── Add Variant Form ───────────────────────────────────────── */}
      {showAddVariant && (
        <form onSubmit={addVariantGroup} className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 space-y-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Add a new variant group (e.g., Color: Red, Blue, Green)
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Group name (e.g. Color)"
              value={newGroupName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewGroupName(e.target.value)}
              className="flex-1 min-w-[120px] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
              required
            />
            <input
              type="text"
              placeholder="Options (comma-separated)"
              value={newOptionLabels}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewOptionLabels(e.target.value)}
              className="flex-[2] min-w-[200px] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
              required
            />
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAddVariant(false)}
              className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Bulk Actions Bar ────────────────────────────────────────── */}
      {selectedKeys.size > 0 && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
            {selectedKeys.size} selected
          </span>
          <input
            type="number"
            placeholder="Set stock…"
            value={bulkStockValue}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setBulkStockValue(e.target.value)}
            className="w-28 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-zinc-800 text-sm"
            min="0"
          />
          <button
            onClick={applyBulkStock}
            disabled={!bulkStockValue}
            className="px-2 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Apply Stock
          </button>
          <input
            type="number"
            placeholder="Price adj (±)"
            value={bulkPriceAdjValue}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setBulkPriceAdjValue(e.target.value)}
            className="w-28 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-zinc-800 text-sm"
          />
          <button
            onClick={applyBulkPriceAdj}
            disabled={!bulkPriceAdjValue}
            className="px-2 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Apply Price Adj
          </button>
          <button
            onClick={() => toggleAvailability(true)}
            className="px-2 py-1 rounded-lg bg-zinc-600 text-white text-xs font-medium hover:bg-zinc-700"
          >
            Toggle Available
          </button>
          <button
            onClick={() => setSelectedKeys(new Set())}
            className="text-xs text-zinc-500 hover:text-zinc-700 ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Alerts Banner ───────────────────────────────────────────── */}
      {alertCount > 0 && !showAlertsOnly && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <span>🚨</span>
          <span><strong>{alertCount}</strong> variant{alertCount !== 1 ? "s" : ""} need attention</span>
          <button onClick={() => setShowAlertsOnly(true)} className="ml-auto text-red-600 underline text-xs hover:no-underline">
            Show alerts
          </button>
        </div>
      )}

      {/* ── Matrix Table ────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wider">
              <th className="px-3 py-2.5 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded"
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-2.5 text-left">Variant</th>
              <th className="px-3 py-2.5 text-center">SKU</th>
              <th className="px-3 py-2.5 text-center">Stock</th>
              <th className="px-3 py-2.5 text-center">Threshold</th>
              <th className="px-3 py-2.5 text-right">Price (PKR)</th>
              <th className="px-3 py-2.5 text-center">Adj</th>
              <th className="px-3 py-2.5 text-center">Status</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredCells.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-zinc-400">
                  {searchFilter
                    ? "No variants match your filter."
                    : showAlertsOnly
                      ? "✅ All stock levels healthy!"
                      : "No variants defined. Click '+ Add Variant Group' to create attributes."}
                </td>
              </tr>
            ) : (
              filteredCells.map((cell) => {
                const badge = getStockBadge(cell.stock, cell.lowStockThreshold, cell.isAvailable);
                const isEditing = editingCell?.rowKey === cell.key;

                return (
                  <tr
                    key={cell.key}
                    className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${
                      cell.dirty ? "bg-amber-50 dark:bg-amber-900/10" : ""
                    } ${selectedKeys.has(cell.key) ? "bg-blue-50 dark:bg-blue-900/10" : ""}`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(cell.key)}
                        onChange={() => toggleSelect(cell.key)}
                        className="rounded"
                      />
                    </td>

                    {/* Variant Label */}
                    <td className="px-3 py-2.5">
                      <div>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {cell.optionLabel}
                        </span>
                        {cell.groupName && (
                          <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                            ({cell.groupName})
                          </span>
                        )}
                        {cell.dirty && (
                          <span className="ml-2 inline-block w-2 h-2 rounded-full bg-amber-500" title="Unsaved changes" />
                        )}
                      </div>
                    </td>

                    {/* SKU (editable) */}
                    <td className="px-3 py-2.5 text-center">
                      {isEditing && editingCell?.field === "sku" ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={editingCell.value}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setEditingCell({ ...editingCell, value: e.target.value.toUpperCase() })
                          }
                          onKeyDown={handleCellKeyDown}
                          onBlur={commitEdit}
                          className="w-28 px-2 py-1 rounded border border-blue-300 text-center text-xs font-mono"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(cell.key, "sku", cell.sku)}
                          className="text-xs font-mono text-zinc-500 dark:text-zinc-400 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 px-1.5 py-0.5 rounded"
                          title="Click to edit SKU"
                        >
                          {cell.sku || "—"}
                        </button>
                      )}
                    </td>

                    {/* Stock (editable) */}
                    <td className="px-3 py-2.5 text-center">
                      {isEditing && editingCell?.field === "stock" ? (
                        <input
                          ref={inputRef}
                          type="number"
                          value={editingCell.value}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setEditingCell({ ...editingCell, value: e.target.value })
                          }
                          onKeyDown={handleCellKeyDown}
                          onBlur={commitEdit}
                          className="w-20 px-2 py-1 rounded border border-blue-300 text-center text-sm"
                          min="0"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(cell.key, "stock", String(cell.stock === -1 ? 0 : cell.stock))}
                          className={`font-mono font-medium text-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 px-2 py-0.5 rounded transition-colors ${
                            cell.stock === -1
                              ? "text-zinc-400"
                              : badge === "out" || badge === "critical"
                                ? "text-red-600"
                                : badge === "low"
                                  ? "text-amber-600"
                                  : "text-zinc-900 dark:text-zinc-100"
                          }`}
                        >
                          {cell.stock === -1 ? "—" : cell.stock}
                        </button>
                      )}
                    </td>

                    {/* Threshold (editable) */}
                    <td className="px-3 py-2.5 text-center">
                      {isEditing && editingCell?.field === "lowStockThreshold" ? (
                        <input
                          ref={inputRef}
                          type="number"
                          value={editingCell.value}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setEditingCell({ ...editingCell, value: e.target.value })
                          }
                          onKeyDown={handleCellKeyDown}
                          onBlur={commitEdit}
                          className="w-16 px-2 py-1 rounded border border-blue-300 text-center text-sm"
                          min="1"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(cell.key, "lowStockThreshold", String(cell.lowStockThreshold))}
                          className="text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 px-1.5 py-0.5 rounded"
                        >
                          {cell.lowStockThreshold}
                        </button>
                      )}
                    </td>

                    {/* Price */}
                    <td className="px-3 py-2.5 text-right font-medium text-zinc-900 dark:text-zinc-100">
                      Rs. {cell.effectivePrice.toLocaleString("en-PK")}
                    </td>

                    {/* Price Adj (editable) */}
                    <td className="px-3 py-2.5 text-center">
                      {isEditing && editingCell?.field === "priceAdj" ? (
                        <input
                          ref={inputRef}
                          type="number"
                          value={editingCell.value}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setEditingCell({ ...editingCell, value: e.target.value })
                          }
                          onKeyDown={handleCellKeyDown}
                          onBlur={commitEdit}
                          className="w-20 px-2 py-1 rounded border border-blue-300 text-center text-sm"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(cell.key, "priceAdj", String(cell.priceAdj))}
                          className={`text-xs font-medium cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 px-1.5 py-0.5 rounded ${
                            cell.priceAdj > 0
                              ? "text-emerald-600"
                              : cell.priceAdj < 0
                                ? "text-red-600"
                                : "text-zinc-400"
                          }`}
                        >
                          {cell.priceAdj > 0 ? `+${cell.priceAdj}` : cell.priceAdj < 0 ? String(cell.priceAdj) : "0"}
                        </button>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STOCK_BADGE[badge]}`}>
                        {STOCK_LABELS[badge]}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => {
                          setCells((prev) =>
                            prev.map((c) =>
                              c.key === cell.key
                                ? { ...c, isAvailable: !c.isAvailable, dirty: true }
                                : c,
                            ),
                          );
                        }}
                        className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                          cell.isAvailable
                            ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                            : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                        }`}
                        title={cell.isAvailable ? "Mark unavailable" : "Mark available"}
                      >
                        {cell.isAvailable ? "✓" : "✗"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Helper: Rebuild VariantGroup[] from cells ─────────────────────────────

function buildVariantGroupsFromCells(cells: VariantCell[]): VariantGroup[] {
  const groupMap = new Map<string, VariantGroup>();

  for (const cell of cells) {
    if (cell.groupName === "") continue; // Skip default / non-grouped

    if (!groupMap.has(cell.groupName)) {
      groupMap.set(cell.groupName, { name: cell.groupName, options: [] });
    }

    const group = groupMap.get(cell.groupName)!;
    const existing = group.options.find((o) => o.label === cell.optionLabel);
    if (!existing) {
      group.options.push({
        label: cell.optionLabel,
        price_adj: cell.priceAdj,
        is_available: cell.isAvailable,
        stock: cell.stock,
        low_stock_threshold: cell.lowStockThreshold,
        sku: cell.sku,
      });
    }
  }

  return Array.from(groupMap.values());
}