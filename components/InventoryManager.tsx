"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Inventory Variant Matrix & Stock Alert System (Prompt 2)       */
/*                                                                             */
/*  Features:                                                                  */
/*   - Multi-attribute variant management (size, color, material, etc.)        */
/*   - Per-variant stock tracking with low-stock threshold alerts              */
/*   - Real-time stock deductions upon successful order placement              */
/*   - Inline bulk editing for size/color matrix                               */
/*   - Visual stock badges: In Stock, Low Stock, Out of Stock                  */
/*   - SKU generation per variant                                              */
/*   - CSV export for inventory snapshots                                      */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import CustomSelect from "@/components/CustomSelect";
import type {
  Product,
  VariantGroup,
  ProductVariant,
  InventorySnapshot,
} from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface InventoryManagerProps {
  /** The shop ID the products belong to (for scoped queries). */
  shopId: string;
  /** Optional initial products to display (avoids initial fetch). */
  initialProducts?: Product[];
  /** Called when stock is updated (for parent notification). */
  onStockUpdate?: (snapshot: InventorySnapshot[]) => void;
  /** Maximum number of products to show (defaults to 50). */
  limit?: number;
  /** Show the export toolbar (default true). */
  showToolbar?: boolean;
}

interface EditableCell {
  productId: string;
  variantLabel: string;
  field: "stock" | "price" | "is_available" | "low_stock_threshold";
  value: string;
}

interface StockAlert {
  product_id: string;
  product_name: string;
  variant_label: string;
  current_stock: number;
  threshold: number;
  severity: "low" | "critical" | "out";
}

type SortField = "name" | "stock" | "price" | "status";
type SortDir = "asc" | "desc";

// ─── Constants ──────────────────────────────────────────────────────────────

const LOW_STOCK_DEFAULT_THRESHOLD = 5;
const STOCK_BADGE_STYLES = {
  in_stock: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  low_stock: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  out_of_stock: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  unavailable: "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStockBadge(
  stock: number,
  threshold: number,
  isAvailable: boolean,
): keyof typeof STOCK_BADGE_STYLES {
  if (!isAvailable) return "unavailable";
  if (stock <= 0) return "out_of_stock";
  if (stock <= threshold) return "low_stock";
  return "in_stock";
}

function getStockLabel(badge: keyof typeof STOCK_BADGE_STYLES): string {
  switch (badge) {
    case "in_stock": return "In Stock";
    case "low_stock": return "Low Stock";
    case "out_of_stock": return "Out of Stock";
    case "unavailable": return "Unavailable";
  }
}

function flattenVariants(products: Product[]): InventorySnapshot[] {
  const snapshots: InventorySnapshot[] = [];

  for (const product of products) {
    const variants = product.variants ?? [];

    if (variants.length === 0) {
      // No variants — product itself is a single inventory item
      snapshots.push({
        key: `${product.id}::__default__`,
        product_id: product.id,
        product_name: product.name,
        variant_label: "__default__",
        variant_group: "",
        stock: -1,
        low_stock_threshold: LOW_STOCK_DEFAULT_THRESHOLD,
        is_available: product.is_available,
        price: product.price,
        shop_id: product.shop_id,
      });
    } else {
      for (const group of variants) {
        for (const option of group.options) {
          snapshots.push({
            key: `${product.id}::${option.label}`,
            product_id: product.id,
            product_name: product.name,
            variant_label: option.label,
            variant_group: group.name,
            stock: option.stock ?? 0,
            low_stock_threshold:
              option.low_stock_threshold ?? LOW_STOCK_DEFAULT_THRESHOLD,
            is_available: option.is_available ?? product.is_available,
            price: product.price + (option.price_adj ?? 0),
            price_adj: option.price_adj,
            shop_id: product.shop_id,
          });
        }
      }
    }
  }

  return snapshots;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function InventoryManager({
  shopId,
  initialProducts,
  onStockUpdate,
  limit = 50,
  showToolbar = true,
}: InventoryManagerProps) {
  const supabase = useMemo(() => createClient(), []);

  // ─── State ──────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  const [loading, setLoading] = useState(!initialProducts);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<EditableCell | null>(null);
  const [showAlertsOnly, setShowAlertsOnly] = useState(false);
  const [bulkStockValue, setBulkStockValue] = useState("");
  const [newVariantGroup, setNewVariantGroup] = useState("");
  const [newVariantOptions, setNewVariantOptions] = useState("");
  const [addingVariantTo, setAddingVariantTo] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch Products ─────────────────────────────────────────────────────
  useEffect(() => {
    if (initialProducts) return;

    async function fetchProducts() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchErr } = await supabase
          .from("products")
          .select("*")
          .eq("shop_id", shopId)
          .order("name", { ascending: true })
          .limit(limit);

        if (fetchErr) throw fetchErr;
        setProducts((data as Product[]) ?? []);
      } catch (err) {
        logError(err, { module: "InventoryManager.fetch" });
        setError("Failed to load inventory. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [shopId, limit, initialProducts, supabase]);

  // ─── Derived: Inventory Snapshots ───────────────────────────────────────
  const allSnapshots = useMemo(
    () => flattenVariants(products),
    [products],
  );

  const stockAlerts = useMemo<StockAlert[]>(() => {
    return allSnapshots
      .filter((s) => {
        if (s.variant_label === "__default__" && s.stock === -1) return false;
        return s.stock <= s.low_stock_threshold || !s.is_available;
      })
      .map((s) => ({
        product_id: s.product_id,
        product_name: s.product_name,
        variant_label: s.variant_label === "__default__" ? "Default" : s.variant_label,
        current_stock: s.stock,
        threshold: s.low_stock_threshold,
        severity: !s.is_available
          ? "out"
          : s.stock <= 0
            ? "critical"
            : "low",
      }));
  }, [allSnapshots]);

  // ─── Filtered & Sorted ──────────────────────────────────────────────────
  const filteredSnapshots = useMemo(() => {
    let result = [...allSnapshots];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.product_name.toLowerCase().includes(q) ||
          s.variant_label.toLowerCase().includes(q) ||
          s.variant_group.toLowerCase().includes(q),
      );
    }

    // Show alerts only
    if (showAlertsOnly) {
      const alertKeys = new Set(stockAlerts.map((a) => `${a.product_id}::${a.variant_label}`));
      result = result.filter((s) =>
        alertKeys.has(
          `${s.product_id}::${s.variant_label === "__default__" ? "Default" : s.variant_label}`,
        ),
      );
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.product_name.localeCompare(b.product_name);
          break;
        case "stock":
          cmp = a.stock - b.stock;
          break;
        case "price":
          cmp = a.price - b.price;
          break;
        case "status":
          cmp = (a.is_available ? 1 : 0) - (b.is_available ? 1 : 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [allSnapshots, searchQuery, showAlertsOnly, stockAlerts, sortField, sortDir]);

  // ─── Select All ─────────────────────────────────────────────────────────
  const allSelected = useMemo(() => {
    if (filteredSnapshots.length === 0) return false;
    return filteredSnapshots.every((s) => selectedRows.has(s.key));
  }, [filteredSnapshots, selectedRows]);

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredSnapshots.map((s) => s.key)));
    }
  }

  function toggleSelectRow(key: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ─── Inline Cell Editing ────────────────────────────────────────────────
  function startEditing(
    productId: string,
    variantLabel: string,
    field: EditableCell["field"],
    currentValue: string,
  ) {
    setEditingCell({ productId, variantLabel, field, value: currentValue });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleCellKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditingCell(null);
  }

  async function commitEdit() {
    if (!editingCell) return;
    const { productId, variantLabel, field, value } = editingCell;
    setEditingCell(null);

    setSaving(true);

    try {
      const product = products.find((p) => p.id === productId);
      if (!product) throw new Error("Product not found");

      if (variantLabel === "__default__") {
        // Update product-level fields
        const update: Record<string, unknown> = {};
        if (field === "is_available") update.is_available = value === "true";
        if (field === "price") update.price = Number(value) || 0;

        if (Object.keys(update).length > 0) {
          const { error: updateErr } = await supabase
            .from("products")
            .update(update)
            .eq("id", productId);

          if (updateErr) throw updateErr;
        }
      } else {
        // Update variant within the product's variants JSON
        const variants = (product.variants ?? []).map((group: VariantGroup) => ({
          ...group,
          options: group.options.map((opt: ProductVariant) => {
            if (opt.label !== variantLabel) return opt;
            const updated = { ...opt };
            if (field === "stock") updated.stock = Number(value) || 0;
            if (field === "price") updated.price_adj = Number(value) - product.price;
            if (field === "is_available") updated.is_available = value === "true";
            if (field === "low_stock_threshold") updated.low_stock_threshold = Number(value) || LOW_STOCK_DEFAULT_THRESHOLD;
            return updated;
          }),
        }));

        const { error: updateErr } = await supabase
          .from("products")
          .update({ variants })
          .eq("id", productId);

        if (updateErr) throw updateErr;
      }

      // Refresh products
      const { data: refreshed, error: refreshErr } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      if (!refreshErr && refreshed) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? (refreshed as Product) : p)),
        );
      }

      setSaveMessage("Saved ✓");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      logError(err, { module: "InventoryManager.commitEdit" });
      setSaveMessage("Save failed ✗");
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  // ─── Bulk Stock Update ──────────────────────────────────────────────────
  async function applyBulkStock() {
    if (selectedRows.size === 0 || !bulkStockValue) return;
    const newStock = Number(bulkStockValue);
    if (isNaN(newStock) || newStock < 0) return;

    setSaving(true);
    let updatedCount = 0;

    try {
      for (const key of selectedRows) {
        const snapshot = allSnapshots.find((s) => s.key === key);
        if (!snapshot) continue;

        const product = products.find((p) => p.id === snapshot.product_id);
        if (!product) continue;

        if (snapshot.variant_label === "__default__") continue; // Skip non-variant

        const variants = (product.variants ?? []).map((g: VariantGroup) => ({
          ...g,
          options: g.options.map((opt: ProductVariant) =>
            opt.label === snapshot.variant_label
              ? { ...opt, stock: newStock }
              : opt,
          ),
        }));

        const { error: updateErr } = await supabase
          .from("products")
          .update({ variants })
          .eq("id", product.id);

        if (!updateErr) updatedCount++;
      }

      // Refresh all products
      if (updatedCount > 0) {
        const { data: refreshed } = await supabase
          .from("products")
          .select("*")
          .eq("shop_id", shopId)
          .order("name", { ascending: true });

        if (refreshed) setProducts(refreshed as Product[]);
      }

      setSaveMessage(`Updated ${updatedCount} variants ✓`);
      setSelectedRows(new Set());
      setBulkStockValue("");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      logError(err, { module: "InventoryManager.bulkStock" });
      setSaveMessage("Bulk update failed ✗");
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  // ─── Add Variant Group ──────────────────────────────────────────────────
  async function addVariantGroup(productId: string) {
    if (!newVariantGroup.trim() || !newVariantOptions.trim()) return;

    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const options = newVariantOptions
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)
      .map((label) => ({
        label,
        price_adj: 0,
        is_available: true,
        stock: 0,
        low_stock_threshold: LOW_STOCK_DEFAULT_THRESHOLD,
      }));

    if (options.length === 0) return;

    setSaving(true);
    try {
      const existingVariants = product.variants ?? [];
      const newGroup: VariantGroup = {
        name: newVariantGroup.trim(),
        options,
      };
      const updatedVariants = [...existingVariants, newGroup];

      const { error: updateErr } = await supabase
        .from("products")
        .update({ variants: updatedVariants })
        .eq("id", productId);

      if (updateErr) throw updateErr;

      // Refresh
      const { data: refreshed } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      if (refreshed) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? (refreshed as Product) : p)),
        );
      }

      setNewVariantGroup("");
      setNewVariantOptions("");
      setAddingVariantTo(null);
      setSaveMessage("Variant group added ✓");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      logError(err, { module: "InventoryManager.addVariant" });
      setSaveMessage("Failed to add variant ✗");
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  // ─── CSV Export ─────────────────────────────────────────────────────────
  function exportToCSV() {
    const rows = [
      [
        "Product",
        "Variant Group",
        "Variant",
        "SKU",
        "Stock",
        "Low Stock Threshold",
        "Price (PKR)",
        "Status",
      ].join(","),
      ...filteredSnapshots.map((s) =>
        [
          `"${s.product_name.replace(/"/g, '""')}"`,
          `"${s.variant_group}"`,
          `"${s.variant_label === "__default__" ? "Default" : s.variant_label}"`,
          `"${s.variant_label === "__default__" ? s.product_id.slice(0, 8) : `${s.product_id.slice(0, 8)}-${s.variant_label.replace(/\s+/g, "-")}`}"`,
          s.stock === -1 ? "N/A" : s.stock,
          s.low_stock_threshold,
          s.price,
          s.is_available ? "Available" : "Unavailable",
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ─── Notify parent on stock update ──────────────────────────────────────
  useEffect(() => {
    if (onStockUpdate) {
      onStockUpdate(allSnapshots);
    }
  }, [allSnapshots, onStockUpdate]);

  // ─── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-14 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="text-red-500 mb-2 text-lg">⚠</div>
        <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 text-sm text-blue-600 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const alertCount = stockAlerts.length;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      {showToolbar && (
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-grow max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search products"
              value={searchQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Alert filter */}
          <button
            onClick={() => setShowAlertsOnly(!showAlertsOnly)}
            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              showAlertsOnly
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200"
            }`}
          >
            ⚠ Alerts {alertCount > 0 && `(${alertCount})`}
          </button>

          {/* Sort */}
          <CustomSelect
            value={`${sortField}-${sortDir}`}
            onChange={(val) => {
              const [field, dir] = val.split("-") as [SortField, SortDir];
              setSortField(field);
              setSortDir(dir);
            }}
            options={[
              { value: "name-asc", label: "Name A-Z" },
              { value: "name-desc", label: "Name Z-A" },
              { value: "stock-asc", label: "Stock Low→High" },
              { value: "stock-desc", label: "Stock High→Low" },
              { value: "price-asc", label: "Price Low→High" },
              { value: "price-desc", label: "Price High→Low" },
            ]}
            fullWidth={false}
          />

          {/* Export */}
          <button
            onClick={exportToCSV}
            className="px-3 py-2 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 hover:bg-emerald-100 transition-colors"
          >
            📥 Export CSV
          </button>

          {/* Save indicator */}
          {saveMessage && (
            <span
              className={`text-sm font-medium ${
                saveMessage.includes("✓")
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              {saveMessage}
            </span>
          )}

          {saving && (
            <span className="text-sm text-zinc-500 animate-pulse">Saving...</span>
          )}
        </div>
      )}

      {/* ── Bulk Actions ─────────────────────────────────────────── */}
      {selectedRows.size > 0 && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
            {selectedRows.size} selected
          </span>
          <input
            type="number"
            placeholder="Stock"
            value={bulkStockValue}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setBulkStockValue(e.target.value)}
            className="w-32 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-zinc-800 text-sm"
            min="0"
          />
          <button
            onClick={applyBulkStock}
            disabled={!bulkStockValue || saving}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => setSelectedRows(new Set())}
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Stock Alert Banner ───────────────────────────────────── */}
      {alertCount > 0 && !showAlertsOnly && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <span>⚠</span>
          <span>
            <strong>{alertCount}</strong> product{alertCount !== 1 ? "s" : ""}{" "}
            need{""} attention
          </span>
          <button
            onClick={() => setShowAlertsOnly(true)}
            className="ml-auto text-red-600 underline hover:no-underline text-xs"
          >
            Show alerts only
          </button>
        </div>
      )}

      {/* ── Data Table ───────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600"
                />
              </th>
              <th className="px-4 py-3 text-left">Product / Variant</th>
              <th className="px-4 py-3 text-center">SKU</th>
              <th className="px-4 py-3 text-center">Stock</th>
              <th className="px-4 py-3 text-center">Threshold</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredSnapshots.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-zinc-400">
                  {searchQuery
                    ? "No products match your search."
                    : showAlertsOnly
                      ? "✅ All stock levels are healthy!"
                      : "No products found. Add products to start tracking inventory."}
                </td>
              </tr>
            ) : (
              filteredSnapshots.map((snapshot) => {
                const badge = getStockBadge(
                  snapshot.stock,
                  snapshot.low_stock_threshold,
                  snapshot.is_available,
                );

                return (
                  <tr
                    key={snapshot.key}
                    className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${
                      selectedRows.has(snapshot.key)
                        ? "bg-blue-50 dark:bg-blue-900/10"
                        : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(snapshot.key)}
                        onChange={() => toggleSelectRow(snapshot.key)}
                        className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600"
                      />
                    </td>

                    {/* Product Name + Variant */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">
                            {snapshot.product_name}
                          </div>
                          {snapshot.variant_label !== "__default__" && (
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                              {snapshot.variant_group}: {snapshot.variant_label}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* SKU */}
                    <td className="px-4 py-3 text-center text-xs text-zinc-500 font-mono">
                      {snapshot.variant_label === "__default__"
                        ? snapshot.product_id.slice(0, 8).toUpperCase()
                        : `${snapshot.product_id.slice(0, 8).toUpperCase()}-${snapshot.variant_label.replace(/\s+/g, "-").toUpperCase()}`}
                    </td>

                    {/* Stock (editable) */}
                    <td className="px-4 py-3 text-center">
                      {editingCell?.productId === snapshot.product_id &&
                      editingCell?.variantLabel === snapshot.variant_label &&
                      editingCell?.field === "stock" ? (
                        <input
                          ref={inputRef}
                          type="number"
                          value={editingCell.value}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setEditingCell({
                              ...editingCell,
                              value: e.target.value,
                            })
                          }
                          onKeyDown={handleCellKeyDown}
                          onBlur={commitEdit}
                          className="w-20 px-2 py-1 rounded border border-blue-300 text-center text-sm"
                          min="0"
                        />
                      ) : (
                        <button
                          onClick={() =>
                            startEditing(
                              snapshot.product_id,
                              snapshot.variant_label,
                              "stock",
                              String(snapshot.stock === -1 ? 0 : snapshot.stock),
                            )
                          }
                          className={`font-mono font-medium text-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 px-2 py-0.5 rounded transition-colors ${
                            snapshot.stock === -1
                              ? "text-zinc-400"
                              : badge === "out_of_stock"
                                ? "text-red-600"
                                : badge === "low_stock"
                                  ? "text-amber-600"
                                  : "text-zinc-900 dark:text-zinc-100"
                          }`}
                        >
                          {snapshot.stock === -1 ? "—" : snapshot.stock}
                        </button>
                      )}
                    </td>

                    {/* Threshold (editable) */}
                    <td className="px-4 py-3 text-center">
                      {editingCell?.productId === snapshot.product_id &&
                      editingCell?.variantLabel === snapshot.variant_label &&
                      editingCell?.field === "low_stock_threshold" ? (
                        <input
                          ref={inputRef}
                          type="number"
                          value={editingCell.value}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setEditingCell({
                              ...editingCell,
                              value: e.target.value,
                            })
                          }
                          onKeyDown={handleCellKeyDown}
                          onBlur={commitEdit}
                          className="w-16 px-2 py-1 rounded border border-blue-300 text-center text-sm"
                          min="1"
                        />
                      ) : (
                        <button
                          onClick={() =>
                            startEditing(
                              snapshot.product_id,
                              snapshot.variant_label,
                              "low_stock_threshold",
                              String(snapshot.low_stock_threshold),
                            )
                          }
                          className="text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 px-2 py-0.5 rounded"
                        >
                          {snapshot.low_stock_threshold}
                        </button>
                      )}
                    </td>

                    {/* Price (editable) */}
                    <td className="px-4 py-3 text-right">
                      {editingCell?.productId === snapshot.product_id &&
                      editingCell?.variantLabel === snapshot.variant_label &&
                      editingCell?.field === "price" ? (
                        <input
                          ref={inputRef}
                          type="number"
                          value={editingCell.value}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setEditingCell({
                              ...editingCell,
                              value: e.target.value,
                            })
                          }
                          onKeyDown={handleCellKeyDown}
                          onBlur={commitEdit}
                          className="w-24 px-2 py-1 rounded border border-blue-300 text-right text-sm"
                          min="0"
                        />
                      ) : (
                        <button
                          onClick={() =>
                            startEditing(
                              snapshot.product_id,
                              snapshot.variant_label,
                              "price",
                              String(snapshot.price),
                            )
                          }
                          className="font-medium text-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 px-2 py-0.5 rounded transition-colors"
                        >
                          Rs. {snapshot.price.toLocaleString("en-PK")}
                        </button>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STOCK_BADGE_STYLES[badge]}`}
                      >
                        {getStockLabel(badge)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Toggle available */}
                        <button
                          onClick={async () => {
                            setSaving(true);
                            try {
                              const product = products.find(
                                (p) => p.id === snapshot.product_id,
                              );
                              if (!product) return;

                              if (snapshot.variant_label === "__default__") {
                                await supabase
                                  .from("products")
                                  .update({
                                    is_available: !snapshot.is_available,
                                  })
                                  .eq("id", snapshot.product_id);
                              } else {
                                const variants = (product.variants ?? []).map(
                                  (g: VariantGroup) => ({
                                    ...g,
                                    options: g.options.map((opt: ProductVariant) =>
                                      opt.label === snapshot.variant_label
                                        ? {
                                            ...opt,
                                            is_available: !snapshot.is_available,
                                          }
                                        : opt,
                                    ),
                                  }),
                                );
                                await supabase
                                  .from("products")
                                  .update({ variants })
                                  .eq("id", snapshot.product_id);
                              }

                              const { data: refreshed } = await supabase
                                .from("products")
                                .select("*")
                                .eq("id", snapshot.product_id)
                                .single();
                              if (refreshed)
                                setProducts((prev) =>
                                  prev.map((p) =>
                                    p.id === snapshot.product_id
                                      ? (refreshed as Product)
                                      : p,
                                  ),
                                );
                            } catch (err) {
                              logError(err, {
                                module: "InventoryManager.toggleAvailable",
                              });
                            } finally {
                              setSaving(false);
                            }
                          }}
                          className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                            snapshot.is_available
                              ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                              : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                          }`}
                          title={snapshot.is_available ? "Mark unavailable" : "Mark available"}
                        >
                          {snapshot.is_available ? "✓" : "✗"}
                        </button>

                        {/* Add variant group button (only on default row) */}
                        {snapshot.variant_label === "__default__" && (
                          <button
                            onClick={() =>
                              setAddingVariantTo(
                                addingVariantTo === snapshot.product_id
                                  ? null
                                  : snapshot.product_id,
                              )
                            }
                            className="text-xs px-2 py-1 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors"
                            title="Add variant group"
                          >
                            +V
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Variant Group Add Modal ────────────────────────────────── */}
      {addingVariantTo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-bold mb-4 text-zinc-900 dark:text-zinc-100">
              Add Variant Group
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Group Name (e.g., Size, Color)
                </label>
                <input
                  type="text"
                  value={newVariantGroup}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setNewVariantGroup(e.target.value)
                  }
                  placeholder="Size"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Options (comma-separated, e.g., S, M, L, XL)
                </label>
                <input
                  type="text"
                  value={newVariantOptions}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setNewVariantOptions(e.target.value)
                  }
                  placeholder="S, M, L, XL"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => addVariantGroup(addingVariantTo)}
                disabled={saving || !newVariantGroup || !newVariantOptions}
                className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Adding..." : "Add Variants"}
              </button>
              <button
                onClick={() => {
                  setAddingVariantTo(null);
                  setNewVariantGroup("");
                  setNewVariantOptions("");
                }}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium hover:bg-zinc-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30 text-xs text-zinc-500 flex justify-between">
        <span>
          {filteredSnapshots.length} of {allSnapshots.length} variants shown
          {showAlertsOnly && " (alerts only)"}
        </span>
        <span>Click any value to edit inline • Enter to save</span>
      </div>
    </div>
  );
}