"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchMyShop } from "@/services/shopService";
import { fetchOrdersByShopId, confirmOrderWhatsAppAsMerchant } from "@/services/orderService";
import { getOrCreateConversationForOrder } from "@/services/messagingService";
import {
  getStatusLabel,
  getValidTransitions,
  transitionOrderStatus,
} from "@/services/notificationService";
import { subscribeToOrders } from "@/lib/supabase/realtime";
import { useToast } from "@/components/Toast";
import CustomSelect from "@/components/CustomSelect";
import OrderBillModal from "@/components/OrderBillModal";
import type { Order, OrderStatus, Shop } from "@/types";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  buildCustomerStatusWhatsAppUrl,
  buildCustomerVerifyWhatsAppUrl,
  buildOrderMapsUrl,
  isAwaitingWhatsApp,
  orderPinAccuracyNote as pinNoteFor,
  VERIFY_BADGE_LABEL,
  VERIFY_NOTICE_LONG,
  VERIFY_NOTICE_TEXT,
} from "@/lib/orderWhatsApp";

type StatusFilter = "all" | OrderStatus;

const PAGE_SIZE = 20;

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
  const { confirm } = useConfirm();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [billOrder, setBillOrder] = useState<Order | null>(null);

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
            addToast(
              row.whatsapp_sent_at
                ? "Naya order aa gaya"
                : "Naya order — pack karne se pehle customer se confirm karein",
              row.whatsapp_sent_at ? "success" : "info",
            );
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [filter, query]);

  const awaitingCount = useMemo(
    () => orders.filter((o) => isAwaitingWhatsApp(o)).length,
    [orders],
  );

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: orders.length };
    for (const o of orders) {
      base[o.status] = (base[o.status] ?? 0) + 1;
    }
    return base;
  }, [orders]);

  const handleUpdateStatus = useCallback(
    async (order: Order, status: OrderStatus) => {
      // Guard: never let an unverified order silently move into fulfilment.
      if (isAwaitingWhatsApp(order) && status !== "Cancelled") {
        const proceed = await confirm({
          title: "Pehle WhatsApp confirm?",
          message: `${VERIFY_NOTICE_LONG}\n\nAgar WhatsApp / call pe order mil gaya hai to Confirm dabao.`,
          confirmLabel: "Haan, WhatsApp mil gaya",
          cancelLabel: "Pehle check karta hoon",
          variant: "warning",
        });
        if (!proceed) return;
        const confirmed = await confirmOrderWhatsAppAsMerchant(order.id);
        if (!confirmed.success) {
          addToast(confirmed.error ?? "WhatsApp confirm nahi hua.", "error");
          return;
        }
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? { ...o, whatsapp_sent_at: confirmed.data.whatsappSentAt ?? new Date().toISOString() }
              : o,
          ),
        );
      }
      const result = await transitionOrderStatus(order.id, status);
      if (result.success) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? result.data : o)));
        addToast(`Order "${getStatusLabel(status)}" mark ho gaya.`, "success");
      } else {
        addToast(result.error ?? "Status update nahi ho saka.", "error");
      }
    },
    [addToast, confirm],
  );

  const markWhatsAppReceived = useCallback(
    async (order: Order) => {
      const result = await confirmOrderWhatsAppAsMerchant(order.id);
      if (result.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? { ...o, whatsapp_sent_at: result.data.whatsappSentAt ?? new Date().toISOString() }
              : o,
          ),
        );
        addToast("WhatsApp confirm ho gaya — ab pack kar sakte ho.", "success");
      } else {
        addToast(result.error ?? "Confirm nahi hua.", "error");
      }
    },
    [addToast],
  );

  const openCustomerWhatsApp = (order: Order) => {
    const phone = order.customer_phone ?? "";
    const url = isAwaitingWhatsApp(order)
      ? buildCustomerVerifyWhatsAppUrl(phone, order.id, order.customer_name, shop?.name)
      : buildCustomerStatusWhatsAppUrl(
          phone,
          order.id,
          getStatusLabel(order.status),
          order.customer_name,
          shop?.name,
        );
    if (!url) {
      addToast("Is order par customer ka valid phone number nahi hai.", "error");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openInAppChat = useCallback(
    async (order: Order) => {
      if (!shop) return;
      const result = await getOrCreateConversationForOrder(shop.id, order);
      if (result.success) {
        router.push(`/dashboard/inquiries?c=${result.data.id}`);
      } else {
        addToast(result.error, "error");
      }
    },
    [addToast, router, shop],
  );

  const quickCancelOrder = useCallback(
    async (order: Order) => {
      const result = await transitionOrderStatus(order.id, "Cancelled");
      if (result.success) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? result.data : o)));
        addToast("Order cancelled.", "success");
      } else {
        addToast(result.error ?? "Could not cancel.", "error");
      }
    },
    [addToast],
  );

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
          <h1 className="tm-font-display text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
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

      {awaitingCount > 0 && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-orange-300 bg-orange-50 p-4 dark:border-orange-900/60 dark:bg-orange-950/30"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ⚠️
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-orange-900 dark:text-orange-200">
              {awaitingCount} order {awaitingCount === 1 ? "abhi" : "abhi tak"} confirm nahi hua
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-orange-800 dark:text-orange-300">
              {VERIFY_NOTICE_LONG}
            </p>
            {filter !== "Pending" && (
              <button
                type="button"
                onClick={() => setFilter("Pending")}
                className="mt-2 rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
              >
                Pending orders dekhein
              </button>
            )}
          </div>
        </div>
      )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search orders"
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:max-w-xs"
        />
        <div className="tm-chip-scroll flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["all", "Pending", "Processing", "Dispatched", "Delivered", "Cancelled"] as StatusFilter[]).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
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
            <div className="tm-panel rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">No orders here yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            New WhatsApp checkout orders will appear here in real time.
          </p>
        </div>
      ) : (
        <>
        <div className="space-y-3">
          {paged.map((order) => {
            const itemCount = order.items_json?.length ?? 0;
            return (
              <article
                key={order.id}
                className="tm-panel p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {order.customer_name || "Customer"}
                      </h2>
                      {order.order_type && order.order_type !== "delivery" && (
                        <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
                          order.order_type === "dine_in"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                            : "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                        }`}>
                          {order.order_type === "dine_in" ? "🍽️ Dine-in" : "🛍️ Pickup"}
                        </span>
                      )}
                      {order.table_code && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.65rem] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {order.table_code}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${statusTone(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                      {isAwaitingWhatsApp(order) && (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[0.65rem] font-bold text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                          ⚠️ {VERIFY_BADGE_LABEL}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {formatMoney(order.total_amount)} · {new Date(order.created_at).toLocaleString()}
                      {order.customer_phone ? ` · ${order.customer_phone}` : ""}
                    </p>
                    {isAwaitingWhatsApp(order) && (
                      <p className="mt-1 text-xs font-medium text-orange-700 dark:text-orange-300">
                        {VERIFY_NOTICE_TEXT}
                      </p>
                    )}
                    {pinNoteFor(order) ? (
                      <p className="mt-1 text-[0.65rem] text-amber-700 dark:text-amber-400">
                        📍 {pinNoteFor(order)}
                      </p>
                    ) : null}
                    {order.notes ? (
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                        Note: {order.notes}
                      </p>
                    ) : null}
                    {(order.delivery_fee != null && order.delivery_fee > 0) || order.discount_amount ? (
                      <p className="mt-0.5 text-[0.65rem] text-zinc-400">
                        {order.delivery_fee != null && order.delivery_fee > 0
                          ? `Delivery ${formatMoney(order.delivery_fee)}`
                          : null}
                        {order.delivery_fee != null && order.delivery_fee > 0 && order.discount_amount
                          ? " · "
                          : null}
                        {order.discount_amount
                          ? `Discount −${formatMoney(order.discount_amount)}`
                          : null}
                      </p>
                    ) : null}
                    <p className="mt-0.5 font-mono text-[0.65rem] text-zinc-400">#{order.id.slice(0, 8)}</p>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                    {buildOrderMapsUrl(order) ? (
                      <a
                        href={buildOrderMapsUrl(order)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-900/50 dark:text-sky-300 dark:hover:bg-sky-900/20"
                        title="Customer ki delivery location Maps par kholein"
                      >
                        <span aria-hidden="true">📍</span>
                        Location
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setBillOrder(order)}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      🧾 Bill
                    </button>
                    <button
                      type="button"
                      onClick={() => void openInAppChat(order)}
                      disabled={!order.customer_user_id}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                      title={order.customer_user_id ? "Message customer in-app" : "Customer has no app account"}
                    >
                      <span aria-hidden="true">💬</span>
                      Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => openCustomerWhatsApp(order)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      title={isAwaitingWhatsApp(order) ? "Customer se WhatsApp par order confirm karein" : "Customer ko WhatsApp par message karein"}
                    >
                      <span aria-hidden="true">💬</span>
                      {isAwaitingWhatsApp(order) ? "WhatsApp" : "WhatsApp"}
                    </button>
                    {isAwaitingWhatsApp(order) && (
                      <button
                        type="button"
                        onClick={() => void markWhatsAppReceived(order)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
                        title="WhatsApp pe order mil gaya — confirm karein"
                      >
                        <span aria-hidden="true">✓</span>
                        WhatsApp mil gaya
                      </button>
                    )}
                    {isAwaitingWhatsApp(order) && order.status === "Pending" && (
                      <button
                        type="button"
                        onClick={() => void quickCancelOrder(order)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        Cancel
                      </button>
                    )}
                    <CustomSelect
                      value={order.status}
                      onChange={(val) => void handleUpdateStatus(order, val as OrderStatus)}
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

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Page {safePage} of {totalPages} · {filtered.length} orders
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition enabled:hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition enabled:hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800"
              >
                Next →
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {billOrder && shop && (
        <OrderBillModal
          order={billOrder}
          shop={shop}
          onClose={() => setBillOrder(null)}
        />
      )}
    </div>
  );
}
