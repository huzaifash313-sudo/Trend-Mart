"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchMyShop } from "@/services/shopService";
import { fetchOrdersByShopId } from "@/services/orderService";
import {
  getStatusLabel,
  getValidTransitions,
  transitionOrderStatus,
} from "@/services/notificationService";
import { subscribeToOrders } from "@/lib/supabase/realtime";
import { useToast } from "@/components/Toast";
import CustomSelect from "@/components/CustomSelect";
import type { Order, OrderStatus, Shop } from "@/types";
import { toPkWhatsAppDigits } from "@/lib/phoneFormat";

type StatusFilter = "all" | OrderStatus;

function formatMoney(n: number) {
  return `Rs. ${Number(n || 0).toLocaleString()}`;
}

function statusTone(status: OrderStatus): string {
  switch (status) {
    case "Pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "Processing":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "Dispatched":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300";
    case "Delivered":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "Cancelled":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

export default function MerchantOrdersPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.replace("/login?redirect=/dashboard/orders");
          return;
        }

        const shopResult = await fetchMyShop();
        if (!shopResult.success || !shopResult.data) {
          if (!cancelled) {
            addToast("Register a store first to manage orders.", "info");
            window.location.replace("/account/become-merchant");
          }
          return;
        }

        if (cancelled) return;
        setShop(shopResult.data);

        const ordersResult = await fetchOrdersByShopId(shopResult.data.id);
        if (!cancelled && ordersResult.success) {
          setOrders(ordersResult.data);
        }

        unsub = subscribeToOrders(
          shopResult.data.id,
          (payload) => {
            const row = payload.new as Order | undefined;
            if (!row?.id) return;
            setOrders((prev) => [row, ...prev.filter((o) => o.id !== row.id)]);
            try {
              const audio = new Audio("/sounds/notify.mp3");
              void audio.play().catch(() => undefined);
            } catch {
              /* optional sound */
            }
            addToast("New order received", "success");
          },
          (payload) => {
            const row = payload.new as Order | undefined;
            if (!row?.id) return;
            setOrders((prev) => prev.map((o) => (o.id === row.id ? { ...o, ...row } : o)));
          },
        );
      } catch {
        if (!cancelled) addToast("Could not load orders.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [addToast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (!q) return true;
      const hay = `${o.customer_name ?? ""} ${o.customer_phone ?? ""} ${o.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, filter, query]);

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: orders.length };
    for (const o of orders) {
      base[o.status] = (base[o.status] ?? 0) + 1;
    }
    return base;
  }, [orders]);

  const handleUpdateStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      const result = await transitionOrderStatus(orderId, status);
      if (result.success) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? result.data : o)));
        addToast(`Order marked as "${getStatusLabel(status)}".`, "success");
      } else {
        addToast(result.error ?? "Could not update status.", "error");
      }
    },
    [addToast],
  );

  const openWhatsApp = (order: Order) => {
    const digits = toPkWhatsAppDigits(order.customer_phone ?? "");
    if (!digits) {
      addToast("No valid customer phone on this order.", "error");
      return;
    }
    const msg = encodeURIComponent(
      `Salam ${order.customer_name || ""}! Your TrendMart order (${order.id.slice(0, 8)}) is ${order.status}.`,
    );
    window.open(`https://wa.me/${digits}?text=${msg}`, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 pb-safe-nav">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Order Desk
          </p>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {shop?.name ?? "Your store"} — Orders
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Update status, reply on WhatsApp, and keep fulfillment moving.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search orders"
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          {(["all", "Pending", "Processing", "Dispatched", "Delivered", "Cancelled"] as StatusFilter[]).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  filter === s
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {s === "all" ? "All" : getStatusLabel(s)} ({counts[s] ?? 0})
              </button>
            ),
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">No orders here yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            New WhatsApp checkout orders will appear here in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const itemCount = order.items_json?.length ?? 0;
            return (
              <article
                key={order.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {order.customer_name || "Customer"}
                      </h2>
                      <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${statusTone(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {formatMoney(order.total_amount)} · {new Date(order.created_at).toLocaleString()}
                      {order.customer_phone ? ` · ${order.customer_phone}` : ""}
                    </p>
                    <p className="mt-0.5 font-mono text-[0.65rem] text-zinc-400">#{order.id.slice(0, 8)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openWhatsApp(order)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      WhatsApp
                    </button>
                    <CustomSelect
                      value={order.status}
                      onChange={(val) => handleUpdateStatus(order.id, val as OrderStatus)}
                      disabled={getValidTransitions(order.status).length === 0}
                      options={[
                        { value: order.status, label: getStatusLabel(order.status) },
                        ...getValidTransitions(order.status).map((next) => ({
                          value: next,
                          label: `→ ${getStatusLabel(next)}`,
                        })),
                      ]}
                      size="sm"
                      fullWidth={false}
                    />
                  </div>
                </div>

                {itemCount > 0 && (
                  <div className="mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                    {order.items_json!.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {item.name}
                          {item.variant ? ` (${item.variant})` : ""}
                          {item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ""}
                        </span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-200">
                          {formatMoney(item.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
