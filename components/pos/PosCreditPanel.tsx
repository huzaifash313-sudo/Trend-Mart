"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listCreditLedger,
  listPosCustomers,
  recordCreditPayment,
} from "@/services/posService";
import type { PosCustomer } from "@/lib/pos/types";
import { formatRupees } from "@/lib/formatters";
import { useToast } from "@/components/Toast";

export default function PosCreditPanel({
  shopId,
  onPickCustomer,
}: {
  shopId: string;
  onPickCustomer?: (c: PosCustomer) => void;
}) {
  const { addToast } = useToast();
  const [customers, setCustomers] = useState<PosCustomer[]>([]);
  const [ledger, setLedger] = useState<
    {
      id: string;
      customer_phone: string;
      customer_name: string;
      delta: number;
      reason: string;
      note: string | null;
      created_at: string;
    }[]
  >([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [c, l] = await Promise.all([
      listPosCustomers(shopId),
      listCreditLedger(shopId, 30),
    ]);
    if (c.success) setCustomers(c.data);
    if (l.success) setLedger(l.data);
  }

  useEffect(() => {
    void reload();
  }, [shopId]);

  const owing = useMemo(
    () =>
      customers
        .filter((c) => (Number(c.credit_balance) || 0) > 0)
        .sort((a, b) => (Number(b.credit_balance) || 0) - (Number(a.credit_balance) || 0)),
    [customers],
  );

  const totalOwed = owing.reduce((s, c) => s + (Number(c.credit_balance) || 0), 0);

  async function collect() {
    setBusy(true);
    const res = await recordCreditPayment(shopId, {
      phone,
      name,
      amount: Number(amount),
      note,
    });
    setBusy(false);
    if (!res.success) {
      addToast(res.error, "error");
      return;
    }
    addToast("Udhaar collected", "success");
    setAmount("");
    setNote("");
    await reload();
  }

  return (
    <section className="mx-auto max-w-lg space-y-2">
      <div>
        <h2 className="text-sm font-bold">Credit / Udhaar</h2>
        <p className="text-[11px] text-zinc-500">
          Counter pe pay method &quot;Credit&quot; choose karo — yahan recover karo. Phone zaroori
          sirf udhaar ke liye.
        </p>
        <p className="mt-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
          Outstanding: {formatRupees(totalOwed)}
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          Collect payment
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone *"
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount collected"
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note"
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void collect()}
          className="mt-2 w-full rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          Record collection
        </button>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase text-zinc-500">Who owes</p>
        <ul className="space-y-1.5">
          {owing.length === 0 ? (
            <li className="rounded-xl border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-500 dark:border-zinc-700">
              No open udhaar
            </li>
          ) : (
            owing.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => {
                    setPhone(c.phone.startsWith("name:") ? "" : c.phone);
                    setName(c.name);
                    onPickCustomer?.(c);
                  }}
                >
                  <p className="truncate text-sm font-semibold">{c.name || "Customer"}</p>
                  <p className="truncate text-[10px] text-zinc-400">{c.phone}</p>
                </button>
                <span className="shrink-0 text-sm font-bold tabular-nums text-amber-600">
                  {formatRupees(Number(c.credit_balance) || 0)}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase text-zinc-500">Recent ledger</p>
        <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {ledger.map((r) => (
            <li
              key={r.id}
              className="flex justify-between gap-2 rounded-lg bg-zinc-50 px-2 py-1.5 text-[11px] dark:bg-zinc-900/80"
            >
              <span className="truncate">
                {r.customer_name || r.customer_phone} · {r.reason}
              </span>
              <span
                className={`shrink-0 font-bold tabular-nums ${
                  r.delta >= 0 ? "text-amber-600" : "text-emerald-600"
                }`}
              >
                {r.delta >= 0 ? "+" : ""}
                {formatRupees(r.delta)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
