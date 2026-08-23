"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Kitchen Board (/dashboard/kitchen)                             */
/*                                                                             */
/*  Merchant side of dine-in ordering: every QR-table order lands here in      */
/*  real time, grouped by table. One tap Accept → Preparing → Ready → Served.  */
/*  The merchant is the human gatekeeper, so a stray/fake order is simply      */
/*  cancelled — zero cost.                                                    */
/* -------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchMyShop } from "@/services/shopService";
import {
  fetchKitchenOrders,
  fetchTablesByShopId,
  fetchTodayDineStats,
  updateDineStatus,
} from "@/services/dineInService";
import { subscribeToOrders } from "@/lib/supabase/realtime";
import { useToast } from "@/components/Toast";
import KitchenManualOrderModal from "@/components/KitchenManualOrderModal";
import { isDineInCategory } from "@/types";
import type { DineInTable, DineStatus, Order, Shop } from "@/types";

type BoardFilter = "active" | "all";

function statusTone(dine: DineStatus | null): string {
  switch (dine) {
    case "Pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "Preparing":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "Ready":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300";
    case "Served":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "Cancelled":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function elapsedLabel(createdAt: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export default function KitchenBoardPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<BoardFilter>("active");
  const [clock, setClock] = useState(Date.now());
  const [showManual, setShowManual] = useState(false);
  const [tables, setTables] = useState<DineInTable[]>([]);
  const [todayStats, setTodayStats] = useState<{ orders: number; revenue: number } | null>(null);

  const load = useCallback(async (shopId: string) => {
    const result = await fetchKitchenOrders(shopId);
    if (result.success) setOrders(result.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.replace("/login?redirect=/dashboard/kitchen");
          return;
        }
        const shopResult = await fetchMyShop();
        if (!shopResult.success || !shopResult.data) {
          if (!cancelled) {
            addToast("Register a store first to open the kitchen board.", "info");
            window.location.replace("/account/become-merchant");
          }
          return;
        }
        if (cancelled) return;
        const shopId = shopResult.data.id;
        setShop(shopResult.data);
        await load(shopId);
        fetchTodayDineStats(shopId).then((r) => {
          if (!cancelled && r.success) setTodayStats(r.data);
        });
        fetchTablesByShopId(shopId).then((r) => {
          if (!cancelled && r.success) setTables(r.data);
        });

        unsub = subscribeToOrders(
          shopId,
          (payload) => {
            const row = payload.new as Order | undefined;
            if (!row?.id || row.order_type !== "dine_in") return;
            setOrders((prev) => [row, ...prev.filter((o) => o.id !== row.id)]);
            fetchTodayDineStats(shopId).then((r) => {
              if (!cancelled && r.success) setTodayStats(r.data);
            });
            try {
              const audio = new Audio("/sounds/notify.mp3");
              void audio.play().catch(() => undefined);
            } catch {
              /* optional sound */
            }
            addToast(`New dine-in order — ${row.table_code ?? "table"}`, "success");
          },
          (payload) => {
            const row = payload.new as Order | undefined;
            if (!row?.id || row.order_type !== "dine_in") return;
            setOrders((prev) => prev.map((o) => (o.id === row.id ? { ...o, ...row } : o)));
          },
        );
      } catch {
        /* handled by empty state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => {
      cancelled = true;
      unsub?.();
      clearInterval(timer);
    };
  }, [addToast, load]);

  const visible = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) =>
      o.dine_status === "Pending" || o.dine_status === "Preparing" || o.dine_status === "Ready",
    );
  }, [orders, filter]);

  const stats = useMemo(
    () => ({
      pending: orders.filter((o) => o.dine_status === "Pending").length,
      preparing: orders.filter((o) => o.dine_status === "Preparing").length,
      ready: orders.filter((o) => o.dine_status === "Ready").length,
    }),
    [orders],
  );

  async function advance(order: Order, next: DineStatus) {
    const res = await updateDineStatus(order.id, next);
    if (res.success) {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? res.data : o)));
      if (next === "Cancelled") addToast("Order cancelled.", "info");
    } else {
      addToast(res.error, "error");
    }
  }

  const actionsFor = useCallback((dine: DineStatus | null) => {
    switch (dine) {
      case "Pending":
        return [
          { label: "Accept", next: "Preparing" as DineStatus, tone: "bg-emerald-600 hover:bg-emerald-700 text-white" },
          { label: "Cancel", next: "Cancelled" as DineStatus, tone: "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300" },
        ];
      case "Preparing":
        return [
          { label: "Ready", next: "Ready" as DineStatus, tone: "bg-violet-600 hover:bg-violet-700 text-white" },
          { label: "Cancel", next: "Cancelled" as DineStatus, tone: "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300" },
        ];
      case "Ready":
        return [
          { label: "Served", next: "Served" as DineStatus, tone: "bg-emerald-600 hover:bg-emerald-700 text-white" },
        ];
      default:
        return [];
    }
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <p className="text-sm text-zinc-500">No store found.</p>
      </div>
    );
  }

  if (!isDineInCategory(shop.category)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-[color:var(--tm-surface)]">
        <div className="max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Kitchen Board is for restaurants & cafes
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            This feature is available for{" "}
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Fast Food & Restaurants</span> and{" "}
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Bakery & Sweets</span>{" "}
            shops.
          </p>
          <Link
            href="/dashboard/tables"
            className="mt-4 inline-block text-xs font-semibold text-emerald-600 underline"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Kitchen Board</h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              Live dine-in orders from your QR tables.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Today's dine-in stats */}
            {todayStats && (
              <div className="hidden items-center gap-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold dark:bg-[color:var(--tm-surface)] md:flex">
                <span className="text-zinc-500 dark:text-zinc-400">Today</span>
                <span className="text-zinc-900 dark:text-zinc-100">{todayStats.orders} orders</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  Rs. {Math.round(todayStats.revenue).toLocaleString()}
                </span>
              </div>
            )}
            <div className="hidden items-center gap-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold dark:bg-[color:var(--tm-surface)] sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> New {stats.pending}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> Cooking {stats.preparing}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-500" /> Ready {stats.ready}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              + New Order
            </button>
            <Link
              href="/dashboard/tables"
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Manage tables
            </Link>
          </div>
        </div>

        {showManual && shop && (
          <KitchenManualOrderModal
            shopId={shop.id}
            tables={tables}
            onClose={() => setShowManual(false)}
            onPlaced={() => {
              setShowManual(false);
              addToast("Order sent to kitchen.", "success");
              void load(shop.id);
            }}
          />
        )}

        <div className="mb-4 flex rounded-xl bg-white p-1 dark:bg-[color:var(--tm-surface)]">
          {(["active", "all"] as BoardFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                filter === f
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {f === "active" ? "Active orders" : "All orders"}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 py-20 text-center dark:border-zinc-700">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              No dine-in orders
            </p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-500 dark:text-zinc-400">
              When a customer scans a table QR and orders, it appears here in real time.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((order) => {
              const dine = order.dine_status ?? "Pending";
              const actions = actionsFor(dine);
              return (
                <div
                  key={order.id}
                  className={`flex flex-col overflow-hidden rounded-2xl border bg-white dark:bg-[color:var(--tm-surface)] ${
                    dine === "Pending"
                      ? "border-amber-200 ring-2 ring-amber-100 dark:border-amber-800 dark:ring-amber-900/30"
                      : "border-zinc-100 dark:border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-zinc-900 px-2 py-1 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                        {order.table_code ?? "Table"}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {elapsedLabel(order.created_at, clock)}
                      </span>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusTone(dine)}`}>
                      {dine}
                    </span>
                  </div>

                  <div className="flex-1 px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        {order.customer_name || "Guest"}
                      </p>
                      {order.customer_phone && (
                        <a
                          href={`tel:${order.customer_phone}`}
                          className="text-xs font-medium text-emerald-600 underline"
                        >
                          Call
                        </a>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {order.items_json.map((item, idx) => (
                        <li key={idx} className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="text-zinc-700 dark:text-zinc-300">
                            <span className="font-bold">{item.quantity ?? 1}×</span> {item.name}
                            {item.variant ? <span className="text-zinc-400"> ({item.variant})</span> : null}
                            {item.notes ? (
                              <span className="block text-xs text-amber-600 dark:text-amber-400">
                                Note: {item.notes}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                            {formatPrice((item.price ?? 0) * (item.quantity ?? 1))}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {order.notes && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                        Order note: {order.notes}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between border-t border-dashed border-zinc-100 pt-2 dark:border-zinc-800">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">Total</span>
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {formatPrice(order.total_amount)}
                      </span>
                    </div>
                  </div>

                  {actions.length > 0 && (
                    <div className="flex gap-2 border-t border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
                      {actions.map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          onClick={() => void advance(order, a.next)}
                          className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${a.tone}`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatPrice(n: number): string {
  return `Rs. ${Number(n || 0).toLocaleString()}`;
}
