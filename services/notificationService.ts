/* -------------------------------------------------------------------------- */
/*  TrendMart — Notification & Order Status Lifecycle Service (Prompt 4)       */
/*                                                                             */
/*  Features:                                                                  */
/*   - Strict order lifecycle: Pending->Processing->Dispatched->Delivered     */
/*     or Cancelled at Pending/Processing/Dispatched stages                    */
/*   - Supabase Realtime channels for instant customer tracking page updates   */
/*   - Multi-channel notification dispatch (realtime, push, toast)            */
/*   - Order status transition validation                                     */
/*   - Live tracking subscription management                                  */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  Order,
  OrderStatus,
  OrderStatusNotification,
  NotificationChannel,
} from "@/types";
import { isValidOrderTransition, ORDER_STATUS_FLOW } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

// ─── Notification Callback Types ─────────────────────────────────────────────

export type OrderUpdateCallback = (notification: OrderStatusNotification) => void;
export type StatusTransitionCallback = (
  orderId: string,
  previous: OrderStatus,
  next: OrderStatus,
) => void;

// ─── Realtime Channel Registry ───────────────────────────────────────────────

/** Active Supabase Realtime channels keyed by channel name for cleanup. */
const activeChannels = new Map<string, RealtimeChannel>();

/** Map of orderId -> set of callbacks for tracking page live updates. */
const orderSubscribers = new Map<string, Set<OrderUpdateCallback>>();

/** Global listeners for any order status transition (admin/merchant dashboards). */
const globalTransitionListeners = new Set<StatusTransitionCallback>();

// ─── Notification Channel Configuration ─────────────────────────────────────

/** Available notification channels that can be toggled per merchant. */
export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  {
    id: "realtime",
    name: "Real-Time Push",
    type: "realtime",
    description: "Instant browser notifications via Supabase Realtime WebSockets",
    is_active: true,
  },
  {
    id: "toast",
    name: "In-App Toast",
    type: "push",
    description: "Toast notifications within the merchant dashboard",
    is_active: true,
  },
  {
    id: "email",
    name: "Email Alerts",
    type: "email",
    description: "Order status update emails to customers (future: Resend integration)",
    is_active: false,
  },
  {
    id: "sms",
    name: "SMS Alerts",
    type: "sms",
    description: "SMS notifications via Twilio/Vonage (future integration)",
    is_active: false,
  },
];

// ─── Order Lifecycle Engine ─────────────────────────────────────────────────

/**
 * Transition an order through the strict lifecycle.
 * Validates the transition, updates Supabase, and broadcasts via all active channels.
 *
 * Lifecycle:
 *   Pending   -> Processing | Cancelled
 *   Processing -> Dispatched | Cancelled
 *   Dispatched -> Delivered | Cancelled
 *   Delivered  -> (terminal)
 *   Cancelled  -> (terminal)
 */
export async function transitionOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  trackingNumber?: string,
): Promise<ServiceResult<Order>> {
  const supabase = createClient();

  try {
    // 1. Fetch the current order to validate transition
    const { data: currentOrder, error: fetchErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchErr || !currentOrder) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const previousStatus = (currentOrder as Record<string, unknown>).status as OrderStatus;
    const shopId = (currentOrder as Record<string, unknown>).shop_id as string;
    const customerName = (currentOrder as Record<string, unknown>).customer_name as string;
    const customerPhone = (currentOrder as Record<string, unknown>).customer_phone as string;
    const totalAmount = Number((currentOrder as Record<string, unknown>).total_amount) || 0;

    // 2. Validate the transition
    if (!isValidOrderTransition(previousStatus, newStatus)) {
      throw new Error(
        `Invalid order status transition: ${previousStatus} -> ${newStatus}. ` +
        `Allowed transitions: ${ORDER_STATUS_FLOW[previousStatus].join(", ") || "none (terminal state)"}`,
      );
    }

    // 3. Update the order in Supabase
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (trackingNumber && newStatus === "Dispatched") {
      updatePayload.tracking_number = trackingNumber;
    }

    const { data: updatedOrder, error: updateErr } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // 4. Fetch shop name for notification context
    let shopName = "Unknown Shop";
    try {
      const { data: shop } = await supabase
        .from("shops")
        .select("name")
        .eq("id", shopId)
        .single();
      if (shop) shopName = (shop as { name: string }).name;
    } catch {
      // Non-critical — continue with default shop name
    }

    // 5. Build and broadcast the notification
    const notification: OrderStatusNotification = {
      orderId,
      shopId,
      shopName,
      previousStatus,
      newStatus,
      customerName,
      customerPhone,
      totalAmount,
      timestamp: new Date().toISOString(),
      trackingNumber: trackingNumber ?? (currentOrder as Record<string, unknown>).tracking_number as string | undefined,
    };

    await broadcastOrderUpdate(notification);

    // Best-effort OS push for merchant + customer.
    if (typeof window !== "undefined") {
      void import("@/lib/pushClient")
        .then(({ notifyOrderPush }) =>
          notifyOrderPush({
            orderId,
            shopId,
            status: newStatus,
            event: "status",
          }),
        )
        .catch(() => undefined);
    }

    // 6. Notify global transition listeners
    for (const listener of globalTransitionListeners) {
      try {
        listener(orderId, previousStatus, newStatus);
      } catch (err) {
        logError(err, { module: "notificationService.transitionOrderStatus.globalListener" });
      }
    }

    // 7. Parse and return the updated order
    let items_json = [];
    try {
      const raw = (updatedOrder as Record<string, unknown>).items_json;
      items_json = Array.isArray(raw) ? raw : [];
    } catch {
      items_json = [];
    }

    const order: Order = {
      id: (updatedOrder as Record<string, unknown>).id as string,
      shop_id: (updatedOrder as Record<string, unknown>).shop_id as string,
      customer_name: ((updatedOrder as Record<string, unknown>).customer_name as string) ?? "",
      customer_phone: ((updatedOrder as Record<string, unknown>).customer_phone as string) ?? "",
      items_json,
      total_amount: Number((updatedOrder as Record<string, unknown>).total_amount) || 0,
      status: newStatus,
      created_at: (updatedOrder as Record<string, unknown>).created_at as string,
      updated_at: (updatedOrder as Record<string, unknown>).updated_at as string,
      tracking_number: (updatedOrder as Record<string, unknown>).tracking_number as string | null,
    };

    return { success: true, data: order };
  } catch (err) {
    logError(err, {
      module: "notificationService.transitionOrderStatus",
      meta: { orderId, newStatus, trackingNumber },
    });
    return { success: false, error: toError(err) };
  }
}

// ─── Broadcast Engine ────────────────────────────────────────────────────────

/**
 * Broadcast an order status update across all active notification channels.
 * Currently dispatches to:
 *   1. In-app toast (via CustomEvent)
 *   2. Realtime subscribers (callback-based)
 *   3. Supabase Realtime channel (database-driven push)
 */
async function broadcastOrderUpdate(
  notification: OrderStatusNotification,
): Promise<void> {
  // Channel 1: Toast notification for dashboard users
  if (typeof window !== "undefined") {
    const statusEmoji: Record<OrderStatus, string> = {
      Pending: "🆕",
      Processing: "⚙️",
      Dispatched: "🚚",
      Delivered: "✅",
      Cancelled: "❌",
    };

    window.dispatchEvent(
      new CustomEvent("trendmart:toast", {
        detail: {
          type: notification.newStatus === "Cancelled" ? "warning" : "success",
          message: `${statusEmoji[notification.newStatus]} Order #${notification.orderId.slice(0, 8)}: ${notification.previousStatus} → ${notification.newStatus} (${notification.shopName})`,
          duration: 5000,
        },
      }),
    );

    // Also dispatch as a dedicated order-update event for components to hook into
    window.dispatchEvent(
      new CustomEvent("trendmart:order-update", {
        detail: notification,
      }),
    );
  }

  // Channel 2: Direct callback subscribers (customer tracking pages)
  const subscribers = orderSubscribers.get(notification.orderId);
  if (subscribers) {
    for (const callback of subscribers) {
      try {
        callback(notification);
      } catch (err) {
        logError(err, {
          module: "notificationService.broadcastOrderUpdate.callback",
          meta: { orderId: notification.orderId },
        });
      }
    }
  }

  // Channel 3: Supabase Realtime — database INSERT/UPDATE events
  // are automatically pushed to any subscribed channels (see subscribeToOrderUpdates)
  // The actual DB update already happened in transitionOrderStatus above.
}

// ─── Realtime Subscription Management ────────────────────────────────────────

/**
 * Subscribe to real-time updates for a specific order.
 * This is used by the customer tracking page to receive instant status updates
 * without manual page refreshes whenever a merchant changes the order status.
 *
 * Uses Supabase Realtime Postgres Changes to listen for UPDATE events
 * on the orders table filtered by the specific order ID.
 *
 * @returns An unsubscribe function to clean up the subscription.
 */
export function subscribeToOrderUpdates(
  orderId: string,
  callback: OrderUpdateCallback,
): () => void {
  // Register the callback in the local subscriber registry
  if (!orderSubscribers.has(orderId)) {
    orderSubscribers.set(orderId, new Set());
  }
  orderSubscribers.get(orderId)!.add(callback);

  // Set up Supabase Realtime channel for database-driven updates
  const supabase = createClient();
  const channelKey = `order-updates-${orderId}`;

  // Avoid duplicate channels for the same order
  if (!activeChannels.has(channelKey)) {
    const channel: RealtimeChannel = supabase
      .channel(channelKey)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const newRecord = payload.new as Record<string, unknown>;
          const oldRecord = payload.old as Record<string, unknown>;

          if (!newRecord || !oldRecord) return;

          const previousStatus = oldRecord.status as OrderStatus;
          const newStatus = newRecord.status as OrderStatus;

          // Build notification from the DB change event
          const notification: OrderStatusNotification = {
            orderId,
            shopId: (newRecord.shop_id as string) ?? "",
            shopName: "", // Will be filled by the broadcast if needed
            previousStatus,
            newStatus,
            customerName: (newRecord.customer_name as string) ?? "",
            customerPhone: (newRecord.customer_phone as string) ?? "",
            totalAmount: Number(newRecord.total_amount) || 0,
            timestamp: new Date().toISOString(),
            trackingNumber: newRecord.tracking_number as string | undefined,
          };

          // Notify all local subscribers for this order
          const subs = orderSubscribers.get(orderId);
          if (subs) {
            for (const cb of subs) {
              try {
                cb(notification);
              } catch (err) {
                logError(err, {
                  module: "notificationService.RealtimeChannel.callback",
                  meta: { orderId },
                });
              }
            }
          }

          // Also dispatch global event
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("trendmart:order-update", {
                detail: notification,
              }),
            );
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(
            `[Notification] ✅ Realtime channel active for order: ${orderId}`,
          );
        }
      });

    activeChannels.set(channelKey, channel);
  }

  // Return cleanup function
  return () => {
    const subs = orderSubscribers.get(orderId);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) {
        orderSubscribers.delete(orderId);
        // Clean up the Supabase channel if no more subscribers
        const channel = activeChannels.get(channelKey);
        if (channel) {
          channel.unsubscribe();
          activeChannels.delete(channelKey);
          console.log(
            `[Notification] 🔌 Unsubscribed from order: ${orderId}`,
          );
        }
      }
    }
  };
}

// ─── Shop-Wide Order Monitoring (Merchant Dashboard) ─────────────────────────

/**
 * Subscribe to all order updates for a specific shop.
 * Used by the merchant dashboard to show real-time order activity.
 *
 * @returns An unsubscribe function.
 */
export function subscribeToShopOrderUpdates(
  shopId: string,
  callback: OrderUpdateCallback,
): () => void {
  const supabase = createClient();
  const channelKey = `shop-orders-${shopId}`;

  // Avoid duplicate channels
  if (activeChannels.has(channelKey)) {
    activeChannels.get(channelKey)!.unsubscribe();
  }

  const channel: RealtimeChannel = supabase
    .channel(channelKey)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        const newRecord = payload.new as Record<string, unknown>;
        const oldRecord = payload.old as Record<string, unknown>;

        if (!newRecord || !oldRecord) return;

        const notification: OrderStatusNotification = {
          orderId: newRecord.id as string,
          shopId,
          shopName: "", // Shop name can be resolved by the consumer
          previousStatus: oldRecord.status as OrderStatus,
          newStatus: newRecord.status as OrderStatus,
          customerName: (newRecord.customer_name as string) ?? "",
          customerPhone: (newRecord.customer_phone as string) ?? "",
          totalAmount: Number(newRecord.total_amount) || 0,
          timestamp: new Date().toISOString(),
          trackingNumber: newRecord.tracking_number as string | undefined,
        };

        try {
          callback(notification);
        } catch (err) {
          logError(err, {
            module: "notificationService.shopOrderChannel.callback",
            meta: { shopId },
          });
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "orders",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        const newRecord = payload.new as Record<string, unknown>;
        if (!newRecord) return;

        const notification: OrderStatusNotification = {
          orderId: newRecord.id as string,
          shopId,
          shopName: "",
          previousStatus: "Pending" as OrderStatus,
          newStatus: (newRecord.status as OrderStatus) ?? "Pending",
          customerName: (newRecord.customer_name as string) ?? "",
          customerPhone: (newRecord.customer_phone as string) ?? "",
          totalAmount: Number(newRecord.total_amount) || 0,
          timestamp: new Date().toISOString(),
          trackingNumber: newRecord.tracking_number as string | undefined,
        };

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("trendmart:toast", {
              detail: {
                type: "info",
                message: `🆕 New order from ${notification.customerName} — #${notification.orderId.slice(0, 8)}`,
                duration: 6000,
              },
            }),
          );
        }

        try {
          callback(notification);
        } catch (err) {
          logError(err, {
            module: "notificationService.shopOrderChannel.newOrder",
            meta: { shopId },
          });
        }
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(
          `[Notification] ✅ Shop order monitoring active for: ${shopId}`,
        );
      }
    });

  activeChannels.set(channelKey, channel);

  return () => {
    channel.unsubscribe();
    activeChannels.delete(channelKey);
    console.log(
      `[Notification] 🔌 Stopped shop order monitoring: ${shopId}`,
    );
  };
}

// ─── Platform-Wide Transaction Monitoring (Admin Dashboard) ──────────────────

/**
 * Subscribe to ALL order events across the entire platform.
 * Used exclusively by the super-admin dashboard for live transaction monitoring.
 *
 * ⚠️ Use sparingly — this subscribes to all orders table changes.
 *
 * @returns An unsubscribe function.
 */
export function subscribeToPlatformTransactions(
  callback: OrderUpdateCallback,
): () => void {
  const supabase = createClient();
  const channelKey = "platform-transactions";

  if (activeChannels.has(channelKey)) {
    activeChannels.get(channelKey)!.unsubscribe();
  }

  const channel: RealtimeChannel = supabase
    .channel(channelKey)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "orders",
      },
      (payload) => {
        const newRecord = payload.new as Record<string, unknown>;
        if (!newRecord) return;

        const notification: OrderStatusNotification = {
          orderId: newRecord.id as string,
          shopId: (newRecord.shop_id as string) ?? "",
          shopName: "",
          previousStatus: "Pending" as OrderStatus,
          newStatus: (newRecord.status as OrderStatus) ?? "Pending",
          customerName: (newRecord.customer_name as string) ?? "",
          customerPhone: (newRecord.customer_phone as string) ?? "",
          totalAmount: Number(newRecord.total_amount) || 0,
          timestamp: new Date().toISOString(),
          trackingNumber: newRecord.tracking_number as string | undefined,
        };

        try {
          callback(notification);
        } catch (err) {
          logError(err, {
            module: "notificationService.platformTransactions.insert",
          });
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
      },
      (payload) => {
        const newRecord = payload.new as Record<string, unknown>;
        const oldRecord = payload.old as Record<string, unknown>;
        if (!newRecord || !oldRecord) return;

        const notification: OrderStatusNotification = {
          orderId: newRecord.id as string,
          shopId: (newRecord.shop_id as string) ?? "",
          shopName: "",
          previousStatus: oldRecord.status as OrderStatus,
          newStatus: newRecord.status as OrderStatus,
          customerName: (newRecord.customer_name as string) ?? "",
          customerPhone: (newRecord.customer_phone as string) ?? "",
          totalAmount: Number(newRecord.total_amount) || 0,
          timestamp: new Date().toISOString(),
          trackingNumber: newRecord.tracking_number as string | undefined,
        };

        try {
          callback(notification);
        } catch (err) {
          logError(err, {
            module: "notificationService.platformTransactions.update",
          });
        }
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(
          "[Notification] ✅ Platform-wide transaction monitoring active",
        );
      }
    });

  activeChannels.set(channelKey, channel);

  return () => {
    channel.unsubscribe();
    activeChannels.delete(channelKey);
    console.log("[Notification] 🔌 Stopped platform transaction monitoring");
  };
}

// ─── Global Transition Listeners ─────────────────────────────────────────────

/** Register a listener for any order status change across the platform. */
export function onOrderTransition(callback: StatusTransitionCallback): () => void {
  globalTransitionListeners.add(callback);
  return () => {
    globalTransitionListeners.delete(callback);
  };
}

// ─── Order Lifecycle Helpers ─────────────────────────────────────────────────

/** Get the list of valid next statuses for a given order. */
export function getValidTransitions(currentStatus: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_FLOW[currentStatus] ?? [];
}

/** Check if an order is in a terminal state (no further transitions). */
export function isTerminalStatus(status: OrderStatus): boolean {
  return status === "Delivered" || status === "Cancelled";
}

/** Get a human-readable label for an order status. */
export function getStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    Pending: "Pending",
    Processing: "Processing",
    Dispatched: "Dispatched",
    Delivered: "Delivered",
    Cancelled: "Cancelled",
  };
  return labels[status];
}

/** Get a color class for status badge rendering. */
export function getStatusColor(status: OrderStatus): string {
  switch (status) {
    case "Pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    case "Processing":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "Dispatched":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "Delivered":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "Cancelled":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  }
}

/** Get an icon/emoji for a status. */
export function getStatusIcon(status: OrderStatus): string {
  switch (status) {
    case "Pending":
      return "🕐";
    case "Processing":
      return "⚙️";
    case "Dispatched":
      return "🚚";
    case "Delivered":
      return "✅";
    case "Cancelled":
      return "❌";
  }
}

// ─── Bulk Status Update (Merchant Batch Operations) ──────────────────────────

/**
 * Update multiple orders to the same status.
 * Validates each transition individually and reports failures per-order.
 */
export async function bulkTransitionOrders(
  orderIds: string[],
  newStatus: OrderStatus,
): Promise<
  ServiceResult<{
    succeeded: string[];
    failed: { orderId: string; error: string }[];
  }>
> {
  const results = {
    succeeded: [] as string[],
    failed: [] as { orderId: string; error: string }[],
  };

  for (const orderId of orderIds) {
    const result = await transitionOrderStatus(orderId, newStatus);
    if (result.success) {
      results.succeeded.push(orderId);
    } else {
      results.failed.push({ orderId, error: result.error });
    }
  }

  if (results.failed.length > 0) {
    return { success: false, error: `${results.failed.length} of ${orderIds.length} orders failed to transition.` };
  }
  return { success: true, data: results };
}

// ─── Cleanup Utility ─────────────────────────────────────────────────────────

/** Unsubscribe from all active Realtime channels and clear all subscribers. */
export function cleanupAllSubscriptions(): void {
  for (const [key, channel] of activeChannels) {
    channel.unsubscribe();
    console.log(`[Notification] 🔌 Cleaned up channel: ${key}`);
  }
  activeChannels.clear();
  orderSubscribers.clear();
  globalTransitionListeners.clear();
}

// ─── Page Visibility Handler ─────────────────────────────────────────────────

if (typeof window !== "undefined") {
  // When the page is about to be unloaded, clean up channels
  window.addEventListener("beforeunload", () => {
    // We don't fully clean up here because the page is being destroyed,
    // but we log that connections were active
    console.log(
      `[Notification] Page unloading with ${activeChannels.size} active channels`,
    );
  });

  // Re-subscribe to channels when the page becomes visible again
  // (Supabase Realtime handles reconnection internally, but we log it)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      console.log(
        `[Notification] Page visible — ${activeChannels.size} channels should be reconnected by Supabase`,
      );
    }
  });
}