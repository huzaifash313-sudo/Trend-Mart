"use client";

import { useEffect, useState } from "react";
import {
  closeCashSession,
  expectedCashInDrawer,
  getOpenCashSession,
  openCashSession,
} from "@/services/posService";
import { formatRupees } from "@/lib/formatters";
import { useToast } from "@/components/Toast";
import type { PosCashSession } from "@/lib/pos/types";
import type { Order } from "@/types";

export default function PosCashPanel({
  shopId,
  orders,
}: {
  shopId: string;
  orders: Order[];
}) {
  const { addToast } = useToast();
  const [session, setSession] = useState<PosCashSession | null>(null);
  const [opening, setOpening] = useState("0");
  const [closing, setClosing] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [cashier, setCashier] = useState("Owner");

  useEffect(() => {
    void (async () => {
      const res = await getOpenCashSession(shopId);
      if (res.success) setSession(res.data);
    })();
  }, [shopId]);

  const expected = session ? expectedCashInDrawer(session, orders) : 0;
  const counted = Number(closing) || 0;
  const variance = session ? counted - expected : 0;

  async function openDrawer() {
    setBusy(true);
    const res = await openCashSession(shopId, Number(opening) || 0, cashier);
    setBusy(false);
    if (!res.success) {
      addToast(res.error, "error");
      return;
    }
    setSession(res.data);
    addToast("Cash drawer opened", "success");
  }

  async function closeDrawer() {
    if (!session) return;
    setBusy(true);
    const res = await closeCashSession(
      shopId,
      session.id,
      counted,
      expected,
      notes,
    );
    setBusy(false);
    if (!res.success) {
      addToast(res.error, "error");
      return;
    }
    setSession(null);
    setClosing("");
    setNotes("");
    addToast(
      `Day closed · variance ${variance >= 0 ? "+" : ""}${formatRupees(variance)}`,
      "success",
    );
  }

  return (
    <section className="mx-auto max-w-lg space-y-4">
      <div>
        <h2 className="text-sm font-bold">Cash drawer / day close</h2>
        <p className="text-[11px] text-zinc-500">
          Open with float → sell → count cash → close with variance report.
        </p>
      </div>

      {!session ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <label className="block text-xs font-semibold text-zinc-600">
            Opening cash (float)
            <input
              type="number"
              min={0}
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
          <label className="block text-xs font-semibold text-zinc-600">
            Cashier
            <input
              value={cashier}
              onChange={(e) => setCashier(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void openDrawer()}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            Open cash session
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            Session open · {session.cashier_label} · since{" "}
            {new Date(session.opened_at).toLocaleTimeString()}
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-white p-3 dark:bg-zinc-900">
              <p className="text-[10px] uppercase text-zinc-500">Opening</p>
              <p className="font-bold">{formatRupees(session.opening_cash)}</p>
            </div>
            <div className="rounded-xl bg-white p-3 dark:bg-zinc-900">
              <p className="text-[10px] uppercase text-zinc-500">Expected now</p>
              <p className="font-bold text-emerald-700">{formatRupees(expected)}</p>
            </div>
          </div>
          <label className="block text-xs font-semibold text-zinc-600">
            Counted cash in drawer
            <input
              type="number"
              min={0}
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          {closing !== "" ? (
            <p
              className={`text-xs font-bold ${
                variance === 0
                  ? "text-emerald-700"
                  : variance > 0
                    ? "text-blue-700"
                    : "text-rose-700"
              }`}
            >
              Variance: {variance >= 0 ? "+" : ""}
              {formatRupees(variance)}
            </p>
          ) : null}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Close notes (optional)"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            disabled={busy || closing === ""}
            onClick={() => void closeDrawer()}
            className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Close day / drawer
          </button>
        </div>
      )}
    </section>
  );
}
