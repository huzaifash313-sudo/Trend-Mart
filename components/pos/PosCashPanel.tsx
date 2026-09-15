"use client";

import { useEffect, useMemo, useState } from "react";
import {
  closeCashSession,
  expectedCashInDrawer,
  getOpenCashSession,
  openCashSession,
  orderPaymentMethod,
  orderSource,
} from "@/services/posService";
import { formatRupees } from "@/lib/formatters";
import { useToast } from "@/components/Toast";
import type { PosCashSession } from "@/lib/pos/types";
import type { Order } from "@/types";

function sessionPosOrders(session: PosCashSession, orders: Order[]) {
  const openMs = Date.parse(session.opened_at);
  return orders.filter((o) => {
    const t = Date.parse(o.created_at);
    if (!Number.isFinite(t) || t < openMs) return false;
    if (orderSource(o) !== "pos") return false;
    if (o.voided_at || o.status === "Cancelled") return false;
    return true;
  });
}

function paymentBreakdown(sessionOrders: Order[]) {
  const totals = {
    cash: 0,
    card: 0,
    jazzcash: 0,
    easypaisa: 0,
    credit: 0,
    other: 0,
  };
  for (const o of sessionOrders) {
    const net = Math.max(
      0,
      (Number(o.total_amount) || 0) - (Number(o.refunded_amount) || 0),
    );
    const split = o.payment_split;
    if (split && typeof split === "object") {
      let used = false;
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
        const v = Number(split[key]) || 0;
        if (v > 0) {
          totals[key] += v;
          used = true;
        }
      }
      if (used) continue;
    }
    const method = (orderPaymentMethod(o) || "cash").toLowerCase();
    if (method in totals) {
      totals[method as keyof typeof totals] += net;
    } else {
      totals.other += net;
    }
  }
  return totals;
}

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

  const sessionStats = useMemo(() => {
    if (!session) return null;
    const sessionOrders = sessionPosOrders(session, orders);
    return {
      count: sessionOrders.length,
      pay: paymentBreakdown(sessionOrders),
    };
  }, [session, orders]);

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
    <section className="mx-auto max-w-lg space-y-2">
      <div>
        <h2 className="text-sm font-extrabold">Cash drawer</h2>
        <p className="text-[11px] text-zinc-500">
          Subah float open → din bhar bill → raat ko cash count → close
        </p>
      </div>

      {!session ? (
        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <label className="block text-xs font-semibold text-zinc-600">
            Starting cash in drawer (float)
            <input
              type="number"
              min={0}
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="e.g. 2000"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
          <label className="block text-xs font-semibold text-zinc-600">
            Who is on counter?
            <input
              value={cashier}
              onChange={(e) => setCashier(e.target.value)}
              placeholder="Name"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void openDrawer()}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            Open drawer for today
          </button>
        </div>
      ) : (
        <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            Open now · {session.cashier_label} · since{" "}
            {new Date(session.opened_at).toLocaleTimeString()}
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-white p-2 dark:bg-zinc-900">
              <p className="text-[10px] uppercase text-zinc-500">Started with</p>
              <p className="font-bold">{formatRupees(session.opening_cash)}</p>
            </div>
            <div className="rounded-xl bg-white p-2 dark:bg-zinc-900">
              <p className="text-[10px] uppercase text-zinc-500">Should have now</p>
              <p className="font-bold text-emerald-700">{formatRupees(expected)}</p>
            </div>
          </div>

          {sessionStats ? (
            <div className="rounded-xl border border-emerald-100 bg-white/80 px-2.5 py-2 dark:border-emerald-900/40 dark:bg-zinc-900/80">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                Since open · {sessionStats.count} POS order
                {sessionStats.count === 1 ? "" : "s"}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-3">
                <span className="tabular-nums">
                  Cash{" "}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {formatRupees(sessionStats.pay.cash)}
                  </strong>
                </span>
                <span className="tabular-nums">
                  Card{" "}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {formatRupees(sessionStats.pay.card)}
                  </strong>
                </span>
                <span className="tabular-nums">
                  JazzCash{" "}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {formatRupees(sessionStats.pay.jazzcash)}
                  </strong>
                </span>
                <span className="tabular-nums">
                  Easypaisa{" "}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {formatRupees(sessionStats.pay.easypaisa)}
                  </strong>
                </span>
                <span className="tabular-nums">
                  Udhaar{" "}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {formatRupees(sessionStats.pay.credit)}
                  </strong>
                </span>
                {(sessionStats.pay.other || 0) > 0 ? (
                  <span className="tabular-nums">
                    Other{" "}
                    <strong className="text-zinc-900 dark:text-zinc-100">
                      {formatRupees(sessionStats.pay.other)}
                    </strong>
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <label className="block text-xs font-semibold text-zinc-600">
            Cash you counted in drawer (actual)
            <input
              type="number"
              min={0}
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
              placeholder="Count notes & coins"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
              {variance === 0
                ? "Perfect match ✓"
                : variance > 0
                  ? `Extra in drawer: +${formatRupees(variance)}`
                  : `Shortage: ${formatRupees(variance)}`}
            </p>
          ) : null}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Note (optional) — e.g. why shortage"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            disabled={busy || closing === ""}
            onClick={() => void closeDrawer()}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Close drawer for today
          </button>
        </div>
      )}
    </section>
  );
}
