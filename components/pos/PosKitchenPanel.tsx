"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchKitchenOrders,
  updateDineStatus,
} from "@/services/dineInService";
import { subscribeToOrders } from "@/lib/supabase/realtime";
import { useToast } from "@/components/Toast";
import OrderBillModal from "@/components/OrderBillModal";
import { formatRupees } from "@/lib/formatters";
import { playPosNotify } from "@/lib/pos/notifySound";
import { DINE_STATUS_FLOW, type DineStatus, type Order, type Shop } from "@/types";

function tone(dine: DineStatus | null | undefined) {
  switch (dine) {
    case "Pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "Preparing":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
    case "Ready":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200";
    case "Served":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

export default function PosKitchenPanel({
  shop,
  soundEnabled,
}: {
  shop: Shop;
  soundEnabled?: boolean;
}) {
  const { addToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [bill, setBill] = useState<Order | null>(null);
  const [prevPending, setPrevPending] = useState(0);

  const load = useCallback(async () => {
    const res = await fetchKitchenOrders(shop.id);
    if (res.success) setOrders(res.data);
    setLoading(false);
  }, [shop.id]);

  useEffect(() => {
    void load();
    const unsub = subscribeToOrders(
      shop.id,
      () => void load(),
      () => void load(),
    );
    return () => unsub?.();
  }, [load, shop.id]);

  const active = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.dine_status === "Pending" ||
          o.dine_status === "Preparing" ||
          o.dine_status === "Ready",
      ),
    [orders],
  );

  useEffect(() => {
    const pending = active.filter((o) => o.dine_status === "Pending").length;
    if (soundEnabled && pending > prevPending && prevPending >= 0) {
      playPosNotify();
    }
    setPrevPending(pending);
  }, [active, prevPending, soundEnabled]);

  async function advance(order: Order, next: DineStatus) {
    const cur = order.dine_status || "Pending";
    if (!DINE_STATUS_FLOW[cur]?.includes(next)) {
      addToast("Invalid kitchen step", "info");
      return;
    }
    const res = await updateDineStatus(order.id, next);
    if (!res.success) {
      addToast(res.error || "Update failed", "error");
      return;
    }
    addToast(next, "success");
    await load();
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading kitchen…</p>;
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Kitchen KOT · {active.length} active
          </h2>
          <p className="text-[11px] text-zinc-500">
            Dine-in QR + staff tickets — same board as /dashboard/kitchen
          </p>
        </div>
        <Link
          href="/dashboard/kitchen"
          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold dark:border-zinc-700"
        >
          Full kitchen
        </Link>
      </div>

      {active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No kitchen tickets. Table QR orders appear here live.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((o) => {
            const dine = (o.dine_status || "Pending") as DineStatus;
            const nexts = DINE_STATUS_FLOW[dine] || [];
            return (
              <li
                key={o.id}
                className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{o.table_code || "Table"}</p>
                    <p className="text-[11px] text-zinc-500">{o.customer_name}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone(dine)}`}>
                    {dine}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-3 text-[11px] text-zinc-600 dark:text-zinc-400">
                  {(o.items_json || [])
                    .map((i) => `${i.quantity ?? 1}× ${i.name}`)
                    .join(", ")}
                </p>
                <p className="mt-1 text-sm font-bold text-emerald-700">
                  {formatRupees(o.total_amount)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {nexts
                    .filter((n) => n !== "Cancelled")
                    .map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => void advance(o, n)}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                      >
                        → {n}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => setBill(o)}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold dark:border-zinc-700"
                  >
                    Bill
                  </button>
                  {nexts.includes("Cancelled") ? (
                    <button
                      type="button"
                      onClick={() => void advance(o, "Cancelled")}
                      className="rounded-lg bg-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {bill ? <OrderBillModal order={bill} shop={shop} onClose={() => setBill(null)} /> : null}
    </section>
  );
}
