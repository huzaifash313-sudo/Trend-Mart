/* -------------------------------------------------------------------------- */
/*  TrendsMart — order push notification copy                                  */
/*                                                                            */
/*  Single source of truth so every trigger (checkout API, status transition,  */
/*  dine-in) sends identically worded, correctly tagged alerts.                */
/* -------------------------------------------------------------------------- */

import type { PushPayload } from "@/lib/webPush";

export interface OrderPushContext {
  event: "new" | "status";
  status: string;
  /** Pre-formatted money string, e.g. "Rs. 2,400". Empty when unknown. */
  amount: string;
  orderId: string;
  customerName?: string | null;
  shopName?: string | null;
  /** Customer has not confirmed the WhatsApp hand-off yet. */
  awaitingWhatsApp?: boolean;
}

const STATUS_URDU: Record<string, string> = {
  Pending: "Pending",
  Processing: "tayyar ho raha hai",
  Dispatched: "raste mein hai",
  Delivered: "deliver ho gaya",
  Cancelled: "cancel ho gaya",
};

function statusPhrase(status: string): string {
  return STATUS_URDU[status] ?? status;
}

function shortRef(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

/** Alert for the shop owner. */
export function buildMerchantOrderPush(ctx: OrderPushContext): PushPayload {
  const customer = ctx.customerName?.trim() || "Customer";
  const ref = shortRef(ctx.orderId);

  if (ctx.event === "new") {
    return {
      title: ctx.awaitingWhatsApp
        ? "🛒 Naya order — pehle confirm karein"
        : "🛒 Naya order aa gaya",
      body: ctx.awaitingWhatsApp
        ? `${customer}${ctx.amount ? ` · ${ctx.amount}` : ""} · #${ref}\nPack karne se pehle customer se WhatsApp par confirm karein.`
        : `${customer}${ctx.amount ? ` · ${ctx.amount}` : ""} · #${ref}`,
      url: "/dashboard/orders",
      tag: `order-${ctx.orderId}-new`,
      kind: "order",
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: "open", title: "Order kholein" },
        { action: "dismiss", title: "Baad mein" },
      ],
    };
  }

  return {
    title: `Order #${ref} — ${ctx.status}`,
    body: `${customer} ka order ${statusPhrase(ctx.status)}.`,
    url: "/dashboard/orders",
    tag: `order-${ctx.orderId}-${ctx.status}`,
    kind: "order",
    renotify: true,
  };
}

/** Alert for the customer who placed the order. */
export function buildCustomerOrderPush(ctx: OrderPushContext): PushPayload {
  const shop = ctx.shopName?.trim() || "shop";
  const ref = shortRef(ctx.orderId);
  const trackingUrl = `/orders/tracking?orderId=${encodeURIComponent(ctx.orderId)}`;

  if (ctx.event === "new") {
    return {
      title: "✅ Order mil gaya",
      body: `${shop} ko aap ka order #${ref}${ctx.amount ? ` (${ctx.amount})` : ""} pahunch gaya hai.`,
      url: trackingUrl,
      tag: `order-${ctx.orderId}-customer-new`,
      kind: "order",
      renotify: true,
    };
  }

  if (ctx.status === "Delivered") {
    return {
      title: "🎉 Order deliver ho gaya",
      body: `${shop} se aap ka order pahunch gaya. Apna experience rate karein.`,
      url: "/account",
      tag: `order-${ctx.orderId}-customer-Delivered`,
      kind: "order",
      renotify: true,
      actions: [{ action: "open", title: "Rate karein" }],
    };
  }

  return {
    title: `Order #${ref} — ${ctx.status}`,
    body: `${shop} se aap ka order ${statusPhrase(ctx.status)}.`,
    url: trackingUrl,
    tag: `order-${ctx.orderId}-customer-${ctx.status}`,
    kind: "order",
    renotify: true,
  };
}
