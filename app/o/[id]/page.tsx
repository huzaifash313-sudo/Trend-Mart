"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Single-Link Order Summary (/o/[id])                           */
/*                                                                            */
/*  The one clean link inside a WhatsApp order message. Groups every item     */
/*  (name, variant, qty, price) plus shop identity and the running total so   */
/*  the merchant sees the whole order at a glance — no more one link per      */
/*  product in the chat.                                                      */
/*                                                                            */
/*  Public by design: only safe fields are shown (items + shop + totals).     */
/*  No customer name, phone, or address ever leaves the server.               */
/* -------------------------------------------------------------------------- */

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatRupees } from "@/lib/formatters";
import { getSafeImageUrl } from "@/services/storageService";
import { getShopPath } from "@/lib/shopSlug";
import { ErrorState } from "@/components/ErrorState";
import type { OrderItem } from "@/types";

/* ─── Icons ─────────────────────────────────────────────────────────────────── */

function StoreIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.12-5.6A1 1 0 0 1 5.1 3h13.8a1 1 0 0 1 .98.8L21 9" /><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /><path d="M9 21V9h6v12" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
      <path d="M8 7h8" /><path d="M8 11h8" /><path d="M8 15h5" />
    </svg>
  );
}

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface PublicOrderSummary {
  id: string;
  shop_id: string;
  shop_name: string;
  shop_logo_url: string | null;
  shop_location: string | null;
  items_json: OrderItem[];
  total_amount: number;
  subtotal_amount: number;
  discount_amount: number;
  delivery_fee: number;
  order_type: "delivery" | "pickup" | "dine_in";
  table_code: string | null;
  status: string;
  created_at: string;
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

function OrderSummaryInner({ id }: { id: string }) {
  const [order, setOrder] = useState<PublicOrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("get_public_order_summary", {
          p_order_id: id,
        });
        if (cancelled) return;
        if (error || !data || (Array.isArray(data) ? data.length === 0 : !data)) {
          setError("This order could not be found or is no longer available.");
          setLoading(false);
          return;
        }
        const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
        setOrder({
          id: String(row.id ?? id),
          shop_id: String(row.shop_id ?? ""),
          shop_name: String(row.shop_name ?? "Shop"),
          shop_logo_url: (row.shop_logo_url as string | null) ?? null,
          shop_location: (row.shop_location as string | null) ?? null,
          items_json: Array.isArray(row.items_json)
            ? (row.items_json as OrderItem[])
            : [],
          total_amount: Number(row.total_amount) || 0,
          subtotal_amount: Number(row.subtotal_amount) || 0,
          discount_amount: Number(row.discount_amount) || 0,
          delivery_fee: Number(row.delivery_fee) || 0,
          order_type:
            row.order_type === "pickup" || row.order_type === "dine_in"
              ? (row.order_type as "pickup" | "dine_in")
              : "delivery",
          table_code: (row.table_code as string | null) ?? null,
          status: String(row.status ?? "Pending"),
          created_at: String(row.created_at ?? new Date().toISOString()),
        });
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Could not load this order. Please try again.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const subtotal = useMemo(() => {
    // Prefer the server-stored subtotal (pack/quantity-tier accurate); fall
    // back to summing items_json on older rows.
    if (order?.subtotal_amount) return order.subtotal_amount;
    return (order?.items_json ?? []).reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity ?? 1),
      0,
    );
  }, [order]);

  // Legacy / fallback rows stored the delivery charge inside total_amount but
  // left delivery_fee empty — recover it so the summary never shows FREE while
  // actually charging. Pickup / dine-in always stay Rs 0.
  const recoveredDeliveryFee = useMemo(() => {
    if (!order) return 0;
    const isDelivery =
      order.order_type !== "pickup" && order.order_type !== "dine_in";
    if (!isDelivery) return 0;
    if (order.delivery_fee > 0) return order.delivery_fee;
    const diff = order.total_amount - subtotal + order.discount_amount;
    return diff > 0 ? Math.round(diff) : 0;
  }, [order, subtotal]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-10">
        <ErrorState
          title="Order not found"
          message={error ?? "This order could not be found."}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  const isPickup = order.order_type === "pickup";
  const isDineIn = order.order_type === "dine_in";
  const shopPath = getShopPath({ id: order.shop_id, name: order.shop_name });

  return (
    <div className="min-h-screen bg-zinc-50 pb-10 dark:bg-[color:var(--tm-surface)]">
      {/* Brand strip */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 py-1.5 text-center">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-white">
          TrendsMart · Order Summary
        </span>
      </div>

      <div className="mx-auto w-full max-w-lg px-4 pt-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Order Summary</h1>
            <p className="mt-0.5 font-mono text-xs text-zinc-400">
              #{order.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {isDineIn
              ? `🍽️ Dine-in${order.table_code ? ` · ${order.table_code}` : ""}`
              : isPickup
                ? "🛍️ Pickup"
                : "🚚 Delivery"}
          </span>
        </div>

        {/* Shop card */}
        <Link
          href={shopPath}
          className="mt-4 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm transition hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-700"
        >
          {order.shop_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getSafeImageUrl(order.shop_logo_url, "shop")}
              alt={order.shop_name}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-emerald-100 dark:ring-emerald-900/40"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <StoreIcon />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {order.shop_name}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              📍 {order.shop_location || "TrendsMart shop"}
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            View store →
          </span>
        </Link>

        {/* Items */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-1.5 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <ReceiptIcon />
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {order.items_json.length} Item{order.items_json.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {order.items_json.map((item, idx) => {
              const qty = item.quantity ?? 1;
              return (
                <div key={`${item.name}-${idx}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 text-base font-bold text-emerald-600 dark:from-emerald-950/40 dark:to-teal-950/40 dark:text-emerald-400">
                    {item.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.name}
                    </p>
                    {item.variant && (
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {item.variant}
                      </p>
                    )}
                    {item.notes && (
                      <p className="truncate text-[0.65rem] text-amber-600 dark:text-amber-400">
                        📝 {item.notes}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {formatRupees(item.price * qty)}
                    </p>
                    {item.original_price != null && item.original_price > item.price && (
                      <p className="text-[0.65rem] text-zinc-400 line-through">
                        was {formatRupees(item.original_price * qty)}
                      </p>
                    )}
                    {qty > 1 && (
                      <p className="text-[0.65rem] text-zinc-400">
                        {qty} × {formatRupees(item.price)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Subtotal</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {formatRupees(subtotal)}
              </span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-600 dark:text-emerald-400">Coupon discount</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  -{formatRupees(order.discount_amount)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">
                {isDineIn ? "Dine-in" : isPickup ? "Pickup" : "Delivery"}
              </span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {isDineIn || isPickup
                  ? "—"
                  : recoveredDeliveryFee > 0
                    ? formatRupees(recoveredDeliveryFee)
                    : "FREE"}
              </span>
            </div>
            <div className="flex justify-between border-t border-zinc-100 pt-2 text-base font-bold dark:border-zinc-800">
              <span className="text-zinc-900 dark:text-zinc-100">Total</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {formatRupees(order.total_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* Status note */}
        <p className="mt-4 text-center text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
          Order placed on {new Date(order.created_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}
          {" · "}Status: <span className="font-semibold text-zinc-600 dark:text-zinc-300">{order.status}</span>
        </p>

        {/* Track + browse */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/orders/tracking?orderId=${order.id}`}
            className="flex-1 rounded-full bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Track this order →
          </Link>
          <Link
            href="/"
            className="flex-1 rounded-full border border-zinc-200 py-2.5 text-center text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Continue shopping
          </Link>
        </div>

        {/* Safety note */}
        <p className="mt-6 text-center text-[0.65rem] leading-relaxed text-zinc-400 dark:text-zinc-500">
          This page shows order items only — customer contact details are never shared here.
          <br />
          Sent via <span className="font-semibold text-emerald-600 dark:text-emerald-400">TrendsMart</span> — Your Local Shopping Hub
        </p>
      </div>
    </div>
  );
}

export default function OrderSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <OrderSummaryInner id={id} />;
}
