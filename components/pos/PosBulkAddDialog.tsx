"use client";

/**
 * Restaurant bulk-add: one dialog stays open while you keep tapping / searching items.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { formatRupees } from "@/lib/formatters";
import type { Product } from "@/types";

export interface PosBulkAddDialogProps {
  products: Product[];
  favourites: Product[];
  onTryAdd: (product: Product) => void;
  onClose: () => void;
}

export default function PosBulkAddDialog({
  products,
  favourites,
  onTryAdd,
  onClose,
}: PosBulkAddDialogProps) {
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = products.filter((p) => p.is_available !== false);
    if (needle) {
      rows = rows.filter((p) => p.name.toLowerCase().includes(needle));
    }
    return rows.slice(0, 60);
  }, [products, q]);

  function add(p: Product) {
    onTryAdd(p);
    setFlash(p.name);
    window.setTimeout(() => setFlash(null), 900);
    inputRef.current?.focus();
  }

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bulk add items"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Bulk add</h3>
            <p className="text-[11px] text-zinc-500">
              Keep adding — dialog stays open. Esc / Done when finished.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
          >
            Done
          </button>
        </div>

        {flash ? (
          <p className="bg-emerald-50 px-4 py-1.5 text-center text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            Added · {flash}
          </p>
        ) : null}

        <div className="px-4 py-2">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter menu…"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        {favourites.length > 0 && !q.trim() ? (
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
            {favourites.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p)}
                className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              >
                {p.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-4 sm:grid-cols-3">
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => add(p)}
              className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 text-left transition hover:border-emerald-500 hover:shadow-md active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-800"
            >
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={p.image_url} alt="" className="h-20 w-full object-cover" />
              ) : (
                <div className="flex h-16 items-center justify-center bg-zinc-200/80 text-2xl dark:bg-zinc-700">
                  🍽️
                </div>
              )}
              <div className="p-2">
                <p className="line-clamp-2 text-xs font-bold text-zinc-900 dark:text-zinc-50">
                  {p.name}
                </p>
                <p className="mt-1 text-sm font-black text-emerald-700 dark:text-emerald-400">
                  {formatRupees(p.price)}
                </p>
                {p.variants && p.variants.length > 0 ? (
                  <p className="mt-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                    Variants
                  </p>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
