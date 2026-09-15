"use client";

import { useEffect, useState } from "react";
import { addPosExpense, deletePosExpense, listPosExpenses } from "@/services/posService";
import type { PosExpense } from "@/lib/pos/types";
import { formatRupees } from "@/lib/formatters";
import { useToast } from "@/components/Toast";

const CATEGORIES = [
  "general",
  "rent",
  "utilities",
  "salary",
  "supplies",
  "transport",
  "marketing",
  "other",
];

export default function PosExpensesPanel({ shopId }: { shopId: string }) {
  const { addToast } = useToast();
  const [rows, setRows] = useState<PosExpense[]>([]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("general");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const res = await listPosExpenses(shopId, { limit: 60 });
    if (res.success) setRows(res.data);
  }

  useEffect(() => {
    void reload();
  }, [shopId]);

  async function onAdd() {
    setBusy(true);
    const res = await addPosExpense(shopId, {
      title,
      amount: Number(amount),
      category,
      notes,
    });
    setBusy(false);
    if (!res.success) {
      addToast(res.error, "error");
      return;
    }
    setTitle("");
    setAmount("");
    setNotes("");
    addToast("Expense saved", "success");
    await reload();
  }

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <section className="mx-auto max-w-lg space-y-2">
      <div>
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Expenses</h2>
        <p className="text-[11px] text-zinc-500">
          Rent, bills, salary — shows in profit reports when cost prices are set.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Electricity)"
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount Rs."
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note (optional)"
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAdd()}
          className="mt-2 w-full rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Add expense
        </button>
      </div>

      <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        Listed total: {formatRupees(total)}
      </p>

      <ul className="space-y-1.5">
        {rows.length === 0 ? (
          <li className="rounded-xl border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-500 dark:border-zinc-700">
            No expenses yet
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.title}</p>
                <p className="text-[10px] uppercase text-zinc-400">
                  {r.category} · {new Date(r.spent_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-bold tabular-nums">{formatRupees(r.amount)}</span>
                <button
                  type="button"
                  className="text-[10px] font-bold text-rose-500"
                  onClick={() =>
                    void deletePosExpense(shopId, r.id).then(() => reload())
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
