"use client";

/* -------------------------------------------------------------------------- */
/*  KitchenManualOrderModal — merchant places a dine-in order for a table      */
/*  without the customer scanning (walk-in / staff tablet flow).               */
/* -------------------------------------------------------------------------- */

import { useEffect, useMemo, useState } from "react";
import { fetchProductsByShopId } from "@/services/productService";
import { placeDineInOrder } from "@/services/dineInService";
import VariantSelector, { type SelectedVariant } from "@/components/VariantSelector";
import { formatRupees } from "@/lib/formatters";
import { computeVariantPrice } from "@/lib/variantPricing";
import type { DineInTable, Product, VariantGroup } from "@/types";

interface CartLine {
  qty: number;
  variantLabel?: string;
  unitPrice?: number;
  name: string;
}

function MinusIcon() {
  return (<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /></svg>);
}
function PlusIcon() {
  return (<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
}
function XIcon() {
  return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>);
}

export default function KitchenManualOrderModal({
  shopId,
  tables,
  onClose,
  onPlaced,
}: {
  shopId: string;
  tables: DineInTable[];
  onClose: () => void;
  onPlaced: () => void;
}) {
  const [tableToken, setTableToken] = useState("");
  const [tableName, setTableName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Variant sheet
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [variantSelection, setVariantSelection] = useState<SelectedVariant[]>([]);

  useEffect(() => {
    fetchProductsByShopId(shopId).then((r) => {
      if (r.success) setProducts(r.data.filter((p) => p.is_available));
    });
  }, [shopId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, query]);

  const cartCount = useMemo(() => Object.values(cart).reduce((n, l) => n + l.qty, 0), [cart]);
  const cartTotal = useMemo(
    () => Object.entries(cart).reduce((s, [, l]) => s + (l.unitPrice ?? 0) * l.qty, 0),
    [cart],
  );

  function bump(productId: string, delta: number, name: string, unitPrice: number) {
    setCart((prev) => {
      const next = { ...prev };
      const cur = next[productId]?.qty ?? 0;
      const qty = cur + delta;
      if (qty <= 0) delete next[productId];
      else next[productId] = { ...next[productId], qty, name, unitPrice };
      return next;
    });
  }

  function handleAdd(p: Product) {
    const groups: VariantGroup[] = (p.variants as VariantGroup[] | null) ?? [];
    if (groups.length > 0) {
      setVariantSelection([]);
      setVariantProduct(p);
    } else {
      bump(p.id, 1, p.name, p.price ?? 0);
    }
  }

  function confirmVariantAdd() {
    if (!variantProduct) return;
    const groups: VariantGroup[] = (variantProduct.variants as VariantGroup[] | null) ?? [];
    const missing = groups.filter((g) => !variantSelection.some((s) => s.groupName === g.name));
    if (missing.length > 0) {
      setError(`Please choose: ${missing.map((g) => g.name).join(", ")}.`);
      return;
    }
    const label = variantSelection.map((s) => `${s.groupName}: ${s.optionLabel}`).join(" · ");
    const unit = computeVariantPrice(
      variantProduct.price ?? 0,
      groups,
      label,
    );
    const key = `${variantProduct.id}::${label || "plain"}`;
    setCart((prev) => {
      const existing = prev[key];
      return {
        ...prev,
        [key]: existing
          ? { ...existing, qty: existing.qty + 1 }
          : { qty: 1, name: variantProduct.name, unitPrice: unit, variantLabel: label },
      };
    });
    setVariantProduct(null);
    setError(null);
  }

  async function place() {
    if (!tableToken) {
      setError("Select a table first.");
      return;
    }
    if (cartCount === 0) {
      setError("Add at least one item.");
      return;
    }
    setPlacing(true);
    setError(null);
    const res = await placeDineInOrder({
      tableToken,
      customerName: customerName.trim() || "Walk-in",
      items: Object.entries(cart).map(([key, line]) => ({
        productId: key.split("::")[0]!,
        name: line.name,
        price: line.unitPrice ?? 0,
        quantity: line.qty,
        variant: line.variantLabel,
      })),
      source: "staff",
    });
    setPlacing(false);
    if (res.success) {
      onPlaced();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">New dine-in order</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">
            <XIcon />
          </button>
        </div>

        {/* Table + name */}
        <div className="grid grid-cols-2 gap-2 border-b border-zinc-100 p-3 dark:border-zinc-800">
          <select
            value={tableToken}
            onChange={(e) => {
              setTableToken(e.target.value);
              const t = tables.find((x) => x.qr_token === e.target.value);
              setTableName(t?.name ?? "");
            }}
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">Table…</option>
            {tables.filter((t) => t.is_active).map((t) => (
              <option key={t.id} value={t.qr_token}>{t.name}</option>
            ))}
          </select>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Customer name (optional)"
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* Search */}
        <div className="border-b border-zinc-100 p-3 dark:border-zinc-800">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search menu…"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
            {filtered.map((p) => {
              const qty = Object.entries(cart)
                .filter(([k]) => k === p.id || k.startsWith(`${p.id}::`))
                .reduce((s, [, l]) => s + l.qty, 0);
              const hasVariants = ((p.variants as VariantGroup[] | null) ?? []).length > 0;
              return (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{p.name}</p>
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {formatRupees(p.price)}
                      {hasVariants ? <span className="ml-1 text-[10px] font-normal text-zinc-400">· options</span> : null}
                    </p>
                  </div>
                  {qty === 0 ? (
                    <button type="button" onClick={() => handleAdd(p)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-600 text-emerald-600" aria-label={`Add ${p.name}`}>
                      <PlusIcon />
                    </button>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-white">
                      <button type="button" onClick={() => bump(p.id, -1, p.name, p.price ?? 0)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-emerald-700" aria-label="Remove"><MinusIcon /></button>
                      <span className="w-4 text-center text-sm font-bold">{qty}</span>
                      <button type="button" onClick={() => handleAdd(p)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-emerald-700" aria-label="Add"><PlusIcon /></button>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-zinc-400">No menu items found.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
          {error && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>
          )}
          <button
            type="button"
            disabled={placing}
            onClick={() => void place()}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {placing ? "Sending…" : `Send to kitchen${tableName ? ` · ${tableName}` : ""} · ${formatRupees(cartTotal)}`}
          </button>
        </div>
      </div>

      {/* Variant sheet */}
      {variantProduct && (
        <div className="fixed inset-0 z-[125] flex items-end justify-center bg-black/50" onClick={() => setVariantProduct(null)}>
          <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{variantProduct.name}</h3>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatRupees(computeVariantPrice(variantProduct.price ?? 0, (variantProduct.variants as VariantGroup[] | null) ?? [], variantSelection.map((s) => `${s.groupName}: ${s.optionLabel}`).join(" · ")))}
                </p>
              </div>
              <button type="button" onClick={() => setVariantProduct(null)} className="rounded-full p-1.5 text-zinc-400" aria-label="Close"><XIcon /></button>
            </div>
            <VariantSelector
              variants={(variantProduct.variants as VariantGroup[] | null) ?? []}
              basePrice={variantProduct.price ?? 0}
              compact
              onSelectionChange={setVariantSelection}
            />
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>}
            <button
              type="button"
              onClick={confirmVariantAdd}
              className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700"
            >
              Add to order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
