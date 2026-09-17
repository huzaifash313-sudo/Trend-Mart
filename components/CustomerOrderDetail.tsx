"use client";

/**
 * Authenticated customer WhatsApp / pickup / delivery order detail.
 * Dine-in QR tracking stays on /orders/[id]?table=…
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  trackOrderById,
  type TrackedOrder,
  type StatusTimelineEntry,
} from "@/services/orderTrackingService";
import { subscribeToOrderUpdates } from "@/services/notificationService";
import { formatRupees, formatDate, formatRelativeTime } from "@/lib/formatters";
import { toWhatsAppDigits } from "@/lib/sanitization";
import CustomerOrderActions from "@/components/CustomerOrderActions";
import type { Order } from "@/types";

function Timeline({ entries }: { entries: StatusTimelineEntry[] }) {
  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={`${e.status}-${e.label}`} className="flex gap-3">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs"
            style={{
              background: e.active || e.completed ? `${e.color}22` : "#f4f4f5",
              color: e.active || e.completed ? e.color : "#a1a1aa",
            }}
            aria-hidden
          >
            {e.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-semibold ${
                e.active
                  ? "text-zinc-900 dark:text-zinc-50"
                  : e.completed
                    ? "text-zinc-700 dark:text-zinc-300"
                    : "text-zinc-400"
              }`}
            >
              {e.label}
            </p>
            {e.timestamp ? (
              <p className="text-[11px] text-zinc-500">
                {formatRelativeTime(e.timestamp)} · {formatDate(e.timestamp)}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function CustomerOrderDetail({ orderId }: { orderId: string }) {
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then((result: { data: { user: { id: string } | null } }) => {
      const { data } = result;
      setUserId(data.user?.id ?? null);
      setAuthReady(true);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await trackOrderById(orderId);
    if (result.success) {
      setOrder(result.data);
    } else {
      setOrder(null);
      setError(result.error);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    if (!authReady) return;
    if (!userId) {
      setLoading(false);
      return;
    }
    void load();
  }, [authReady, userId, load]);

  useEffect(() => {
    if (!order?.id) return;
    return subscribeToOrderUpdates(order.id, (notification) => {
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: notification.newStatus,
              trackingNumber: notification.trackingNumber ?? prev.trackingNumber,
              updatedAt: notification.timestamp,
              statusHistory: prev.statusHistory.map((e) => e), // rebuilt below
            }
          : prev,
      );
      void load();
    });
  }, [order?.id, load]);

  const loginHref = `/login?next=${encodeURIComponent(`/orders/${orderId}`)}`;

  if (!authReady || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-sm text-zinc-500">Loading order…</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900/40 dark:bg-amber-950/30">
        <h1 className="text-base font-bold text-amber-950 dark:text-amber-100">
          Sign in to view this order
        </h1>
        <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">
          Order details are private to the account used at checkout.
        </p>
        <Link
          href={loginHref}
          className="mt-4 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
          Order not found
        </h1>
        <p className="mt-2 text-xs text-zinc-500">
          {error || "This order is not linked to your account."}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link
            href={`/orders/tracking?orderId=${encodeURIComponent(orderId)}`}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold dark:border-zinc-700"
          >
            Try tracking search
          </Link>
          <Link
            href="/orders"
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
          >
            My orders
          </Link>
        </div>
      </div>
    );
  }

  const wa = order.shopWhatsapp ? toWhatsAppDigits(order.shopWhatsapp) : "";
  const typeLabel =
    order.orderType === "pickup"
      ? "Pickup"
      : order.orderType === "dine_in"
        ? "Dine-in"
        : "Delivery";

  const asOrder = {
    id: order.id,
    shop_id: order.shopId,
    customer_name: order.customerName,
    customer_phone: order.customerPhone,
    customer_user_id: order.customerUserId,
    status: order.status,
    total_amount: order.totalAmount,
    items_json: order.items,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    whatsapp_sent_at: order.whatsappSentAt,
    whatsapp_message: order.whatsappMessage,
    tracking_number: order.trackingNumber,
    order_type: order.orderType,
  } as Order;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              {typeLabel}
            </p>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              {order.shopName}
            </h1>
            <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
              {order.id.slice(0, 8).toUpperCase()}…
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {order.status}
          </span>
        </div>

        <div className="mt-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">
            Status
          </h2>
          <Timeline entries={order.statusHistory} />
        </div>

        <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
            Items
          </h2>
          <ul className="space-y-1.5">
            {order.items.map((it, i) => (
              <li
                key={`${it.name}-${i}`}
                className="flex justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <span className="min-w-0 truncate">
                  {it.name}
                  {it.variant ? ` (${it.variant})` : ""} ×{it.quantity ?? 1}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatRupees(it.price * (it.quantity ?? 1))}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-dashed border-zinc-200 pt-2 text-sm font-bold dark:border-zinc-700">
            <span>Total</span>
            <span>{formatRupees(order.totalAmount)}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {wa ? (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white"
            >
              WhatsApp shop
            </a>
          ) : null}
          <Link
            href={`/shop/${order.shopId}`}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-zinc-200 px-3 py-2.5 text-xs font-bold dark:border-zinc-700"
          >
            View store
          </Link>
        </div>

        <div className="mt-4">
          <CustomerOrderActions
            order={asOrder}
            shopWhatsapp={order.shopWhatsapp}
            shopId={order.shopId}
            userId={userId}
            onUpdated={() => void load()}
          />
        </div>
      </div>

      <p className="text-center text-[11px] text-zinc-500">
        <Link href="/orders" className="font-semibold text-emerald-700 dark:text-emerald-400">
          ← All my orders
        </Link>
      </p>
    </div>
  );
}
