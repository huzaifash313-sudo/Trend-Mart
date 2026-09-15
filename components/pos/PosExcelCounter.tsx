"use client";

/**
 * Quick-search counter: focused search + Enter to add + bill lines.
 * Mobile uses stacked cards so headers never wrap vertically.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatRupees } from "@/lib/formatters";
import { customerVariantGroups } from "@/lib/variantPricing";
import type { PosCartLine } from "@/lib/pos/types";
import type { Product } from "@/types";

export interface PosExcelCounterHandle {
  focusSearch: () => void;
}

export interface PosExcelCounterProps {
  products: Product[];
  cart: PosCartLine[];
  decimalQty: boolean;
  barcodeEnabled: boolean;
  lowStockThreshold: number;
  onTryAdd: (product: Product) => void;
  onSetQty: (key: string, qty: number) => void;
  onSetUnitPrice: (key: string, price: number) => void;
  onRemove: (key: string) => void;
  onAdded?: (name: string) => void;
  onAddCustom?: () => void;
  onScanCode?: (code: string) => void;
  onOpenCamera?: () => void;
  favourites?: Product[];
  recentProducts?: Product[];
  /** Remove last cart line (Backspace on empty search) */
  onRemoveLast?: () => void;
}

function scoreProduct(p: Product, needle: string): number {
  const name = p.name.toLowerCase();
  const barcode = (p.barcode || "").toLowerCase();
  const short = (p.short_code || "").toLowerCase();
  if (barcode && barcode === needle) return 1000;
  if (short && short === needle) return 950;
  if (name === needle) return 900;
  if (name.startsWith(needle)) return 800;
  if (barcode.startsWith(needle)) return 750;
  if (short.startsWith(needle)) return 740;
  if (name.includes(needle)) return 500;
  if (barcode.includes(needle)) return 400;
  if (short.includes(needle)) return 350;
  return 0;
}

const PosExcelCounter = forwardRef<PosExcelCounterHandle, PosExcelCounterProps>(
  function PosExcelCounter(
    {
      products,
      cart,
      decimalQty,
      barcodeEnabled,
      lowStockThreshold,
      onTryAdd,
      onSetQty,
      onSetUnitPrice,
      onRemove,
      onAdded,
      onAddCustom,
      onScanCode,
      onOpenCamera,
      favourites = [],
      recentProducts = [],
      onRemoveLast,
    },
    ref,
  ) {
    const [q, setQ] = useState("");
    const [hi, setHi] = useState(0);
    const [open, setOpen] = useState(false);
    const [flashKey, setFlashKey] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const cartLenRef = useRef(cart.length);

    useImperativeHandle(ref, () => ({
      focusSearch: () => {
        inputRef.current?.focus();
        inputRef.current?.select();
      },
    }));

    useEffect(() => {
      inputRef.current?.focus();
    }, []);

    useEffect(() => {
      if (cart.length > cartLenRef.current) {
        const last = cart[cart.length - 1];
        if (last) {
          setFlashKey(last.key);
          const t = window.setTimeout(() => setFlashKey(null), 900);
          cartLenRef.current = cart.length;
          return () => window.clearTimeout(t);
        }
      }
      cartLenRef.current = cart.length;
    }, [cart]);

    const cartQtyByProduct = useMemo(() => {
      const m = new Map<string, number>();
      for (const l of cart) {
        if (l.custom) continue;
        m.set(l.productId, (m.get(l.productId) || 0) + l.qty);
      }
      return m;
    }, [cart]);

    const matches = useMemo(() => {
      const needle = q.trim().toLowerCase();
      if (needle.length < 1) return [];
      return products
        .filter((p) => p.is_available !== false)
        .map((p) => ({ p, score: scoreProduct(p, needle) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
        .slice(0, 14)
        .map((x) => x.p);
    }, [products, q]);

    const quickPick = useMemo(() => {
      const seen = new Set<string>();
      const out: Product[] = [];
      for (const p of [...favourites, ...recentProducts]) {
        if (p.is_available === false || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
        if (out.length >= 16) break;
      }
      if (out.length < 8) {
        for (const p of products) {
          if (p.is_available === false || seen.has(p.id)) continue;
          seen.add(p.id);
          out.push(p);
          if (out.length >= 12) break;
        }
      }
      return out;
    }, [favourites, recentProducts, products]);

    useEffect(() => {
      setHi(0);
      setOpen(q.trim().length > 0 && matches.length > 0);
    }, [q, matches.length]);

    function pick(p: Product) {
      onTryAdd(p);
      onAdded?.(p.name);
      setQ("");
      setOpen(false);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHi((h) => Math.min(h + 1, Math.max(0, matches.length - 1)));
        setOpen(true);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHi((h) => Math.max(0, h - 1));
        return;
      }
      if (e.key === "Escape") {
        setQ("");
        setOpen(false);
        return;
      }
      if (
        (e.key === "Backspace" || e.key === "Delete") &&
        !q &&
        cart.length > 0 &&
        onRemoveLast
      ) {
        e.preventDefault();
        onRemoveLast();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (matches[hi]) {
          pick(matches[hi]);
          return;
        }
        if (matches.length === 1) {
          pick(matches[0]);
          return;
        }
        const code = q.trim();
        if (barcodeEnabled && code && onScanCode) {
          onScanCode(code);
          setQ("");
          setOpen(false);
          window.setTimeout(() => inputRef.current?.focus(), 30);
        }
      }
    }

    const step = decimalQty ? 0.25 : 1;

    function bumpQty(line: PosCartLine, delta: number) {
      const next = Math.round((line.qty + delta) * 100) / 100;
      if (next <= 0) {
        onRemove(line.key);
        window.setTimeout(() => inputRef.current?.focus(), 30);
        return;
      }
      onSetQty(line.key, next);
    }

    function QtyControls({ line }: { line: PosCartLine }) {
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-base font-bold hover:bg-red-50 hover:text-red-600 dark:bg-zinc-800 dark:hover:bg-red-950/40 sm:h-8 sm:w-8 sm:text-sm"
            onClick={() => bumpQty(line, -step)}
            aria-label={line.qty <= step ? "Remove item" : "Decrease quantity"}
            title={line.qty <= step ? "Remove" : "−1"}
          >
            {line.qty <= step ? "✕" : "−"}
          </button>
          <input
            type="number"
            min={0}
            step={step}
            value={line.qty}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v) || v <= 0) {
                onRemove(line.key);
                return;
              }
              onSetQty(line.key, v);
            }}
            className="h-9 w-12 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-1 text-center text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900 sm:h-8 sm:w-11 sm:text-xs"
            aria-label="Quantity"
          />
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-base font-bold text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 sm:h-8 sm:w-8 sm:text-sm"
            onClick={() => bumpQty(line, step)}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="relative">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Search · add · remove
            </label>
            <div className="flex items-center gap-3">
              {barcodeEnabled && onOpenCamera ? (
                <button
                  type="button"
                  onClick={onOpenCamera}
                  className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-400"
                >
                  Scan
                </button>
              ) : null}
              {onAddCustom ? (
                <button
                  type="button"
                  onClick={onAddCustom}
                  className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  + Custom
                </button>
              ) : null}
            </div>
          </div>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(q.trim().length > 0 && matches.length > 0)}
            placeholder={
              barcodeEnabled
                ? "Name / barcode — Enter add · ⌫ remove last"
                : "Name / SKU — Enter add · ⌫ remove last"
            }
            autoComplete="off"
            className="w-full rounded-xl border-2 border-emerald-500/70 bg-white px-3 py-3 text-base font-medium shadow-sm outline-none focus:border-emerald-600 dark:border-emerald-700 dark:bg-zinc-900 sm:text-sm"
          />
          {open && matches.length > 0 ? (
            <ul className="absolute z-40 mt-1 max-h-[50vh] w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
              {matches.map((p, i) => {
                const inCart = cartQtyByProduct.get(p.id) || 0;
                const hasVar =
                  customerVariantGroups(p.variants as never).length > 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHi(i)}
                      onClick={() => pick(p)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm sm:py-2.5 ${
                        i === hi
                          ? "bg-emerald-600 text-white"
                          : "text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="block truncate font-semibold">
                            {p.name}
                          </span>
                          {inCart > 0 ? (
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                                i === hi
                                  ? "bg-white/20 text-white"
                                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                              }`}
                            >
                              ×{inCart} in bill
                            </span>
                          ) : null}
                        </span>
                        {hasVar ? (
                          <span
                            className={`text-[10px] font-semibold ${i === hi ? "text-amber-100" : "text-amber-600"}`}
                          >
                            Variants — tap to choose
                          </span>
                        ) : p.barcode ? (
                          <span
                            className={`font-mono text-[10px] ${i === hi ? "text-emerald-100" : "text-zinc-400"}`}
                          >
                            {p.barcode}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-bold">
                          {formatRupees(p.price)}
                        </span>
                        {p.stock_qty != null ? (
                          <span
                            className={`text-[10px] ${
                              i === hi
                                ? "text-emerald-100"
                                : p.stock_qty <= lowStockThreshold
                                  ? "text-amber-600"
                                  : "text-zinc-400"
                            }`}
                          >
                            Stock {p.stock_qty}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : q.trim().length > 0 && matches.length === 0 ? (
            <div className="absolute z-40 mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
              No match — check spelling, or add as{" "}
              {onAddCustom ? (
                <button
                  type="button"
                  className="font-semibold text-emerald-700 underline dark:text-emerald-400"
                  onClick={onAddCustom}
                >
                  custom item
                </button>
              ) : (
                "custom item"
              )}
              .
            </div>
          ) : null}
        </div>

        {!q.trim() && quickPick.length > 0 ? (
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Quick add
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {quickPick.map((p) => {
                const inCart = cartQtyByProduct.get(p.id) || 0;
                return (
                  <button
                    key={`qp-${p.id}`}
                    type="button"
                    onClick={() => pick(p)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                      inCart > 0
                        ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    }`}
                  >
                    {p.name}
                    {inCart > 0 ? ` · ${inCart}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {cart.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm leading-relaxed text-zinc-500">
              Tap Quick add, search + Enter, or scan.
              <br />
              <span className="text-[11px]">
                − pe last unit = remove · empty search + Backspace = last line hatao
              </span>
            </p>
          ) : (
            <>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-900 sm:hidden">
                {cart.map((l, idx) => (
                  <li
                    key={l.key}
                    className={`space-y-2.5 px-3 py-3 transition-colors ${
                      flashKey === l.key
                        ? "bg-emerald-50 dark:bg-emerald-950/30"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium tabular-nums text-zinc-400">
                          #{idx + 1}
                        </p>
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {l.name}
                          {l.custom ? (
                            <span className="ml-1 text-[10px] font-bold text-amber-600">
                              CUSTOM
                            </span>
                          ) : null}
                        </p>
                        {l.variant ? (
                          <p className="truncate text-xs text-zinc-500">
                            {l.variant}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(l.key)}
                        className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-red-50 px-2.5 text-[11px] font-bold text-red-600 dark:bg-red-950/40 dark:text-red-300"
                        aria-label="Remove item"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <label className="block text-[11px] font-medium text-zinc-500">
                          Rate
                          <input
                            type="number"
                            min={0}
                            value={l.unitPrice}
                            onChange={(e) =>
                              onSetUnitPrice(
                                l.key,
                                Math.max(0, Number(e.target.value) || 0),
                              )
                            }
                            className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                          />
                        </label>
                        <div>
                          <span className="mb-0.5 block text-[11px] font-medium text-zinc-500">
                            Qty
                          </span>
                          <QtyControls line={l} />
                        </div>
                      </div>
                      <div className="pb-1 text-right">
                        <p className="text-[11px] font-medium text-zinc-500">
                          Amount
                        </p>
                        <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                          {formatRupees(l.unitPrice * l.qty)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden min-w-0 sm:block">
                <div className="sticky top-0 z-10 grid grid-cols-[2.25rem_minmax(8rem,1fr)_4.5rem_7.5rem_5rem_4.5rem] gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                  <span className="whitespace-nowrap">#</span>
                  <span className="whitespace-nowrap">Product</span>
                  <span className="whitespace-nowrap text-right">Rate</span>
                  <span className="whitespace-nowrap text-center">Qty</span>
                  <span className="whitespace-nowrap text-right">Amount</span>
                  <span className="whitespace-nowrap text-center"> </span>
                </div>
                <ul>
                  {cart.map((l, idx) => (
                    <li
                      key={l.key}
                      className={`grid grid-cols-[2.25rem_minmax(8rem,1fr)_4.5rem_7.5rem_5rem_4.5rem] items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs transition-colors dark:border-zinc-900 ${
                        flashKey === l.key
                          ? "bg-emerald-50 dark:bg-emerald-950/30"
                          : ""
                      }`}
                    >
                      <span className="tabular-nums text-zinc-400">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50">
                          {l.name}
                          {l.custom ? (
                            <span className="ml-1 text-[9px] font-bold text-amber-600">
                              CUSTOM
                            </span>
                          ) : null}
                        </p>
                        {l.variant ? (
                          <p className="truncate text-[10px] text-zinc-500">
                            {l.variant}
                          </p>
                        ) : null}
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={l.unitPrice}
                        onChange={(e) =>
                          onSetUnitPrice(
                            l.key,
                            Math.max(0, Number(e.target.value) || 0),
                          )
                        }
                        className="w-full rounded border border-zinc-200 bg-zinc-50 px-1 py-1 text-right tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                        aria-label="Rate"
                      />
                      <div className="flex justify-center">
                        <QtyControls line={l} />
                      </div>
                      <span className="whitespace-nowrap text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                        {formatRupees(l.unitPrice * l.qty)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(l.key)}
                        className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                        aria-label="Remove item"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <p className="hidden text-[11px] text-zinc-500 md:block">
          <kbd className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">Enter</kbd>{" "}
          add ·{" "}
          <kbd className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">⌫</kbd>{" "}
          remove last ·{" "}
          <kbd className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">Alt+Z</kbd>{" "}
          undo ·{" "}
          <kbd className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">Alt+C</kbd>{" "}
          clear
        </p>
      </div>
    );
  },
);

export default PosExcelCounter;
