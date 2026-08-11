"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Supabase Realtime WebSocket Channel Manager                    */
/*                                                                             */
/*  Provides typed subscriptions for:                                          */
/*   - Order inserts/updates (merchant dashboard live feed)                    */
/*   - Customer inquiry inserts (merchant notification)                       */
/*   - Product availability changes (storefront live update)                  */
/*   - Review inserts (storefront social proof)                               */
/*                                                                             */
/*  Handles automatic reconnection, channel cleanup, and error recovery.       */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// ─── Type Definitions ─────────────────────────────────────────────────────────

// Using `type` instead of `interface` ensures compatibility with
// RealtimePostgresChangesPayload generic constraints.
export type OrderPayload = {
  id: string;
  shop_id: string;
  customer_name: string;
  customer_phone: string;
  customer_user_id?: string | null;
  items_json: unknown;
  total_amount: number;
  status: string;
  created_at: string;
};

export type InquiryPayload = {
  id: string;
  shop_id: string;
  product_id: string | null;
  customer_name: string;
  customer_phone: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type ProductPayload = {
  id: string;
  shop_id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
  created_at: string;
};

export type ReviewPayload = {
  id: string;
  shop_id: string;
  customer_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type InventoryVariantPayload = {
  id: string;
  product_id: string;
  shop_id: string;
  variant_group: string;
  variant_label: string;
  sku: string | null;
  stock: number;
  low_stock_threshold: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
};

export type AnalyticsPayload = {
  id: string;
  shop_id: string;
  event_type: string;
  product_id: string | null;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RealtimeCallback<T extends Record<string, any>> = (payload: RealtimePostgresChangesPayload<T>) => void;

// ─── Connection State ─────────────────────────────────────────────────────────

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";
type StateChangeCallback = (state: ConnectionState, channelKey: string) => void;

const stateListeners = new Set<StateChangeCallback>();
let globalConnectionState: ConnectionState = "disconnected";

/**
 * Register a listener for real-time connection state changes across all channels.
 * Useful for showing connection status indicators in the UI.
 */
export function onConnectionStateChange(callback: StateChangeCallback): () => void {
  stateListeners.add(callback);
  return () => { stateListeners.delete(callback); };
}

function notifyStateChange(state: ConnectionState, channelKey: string): void {
  globalConnectionState = state;
  for (const listener of stateListeners) {
    try { listener(state, channelKey); } catch { /* swallow */ }
  }
}

/** Returns the current global connection state. */
export function getConnectionState(): ConnectionState {
  return globalConnectionState;
}

// ─── Channel Manager ──────────────────────────────────────────────────────────

const activeChannels = new Map<string, RealtimeChannel>();

/**
 * Subscribe to real-time INSERT/UPDATE events on the orders table for a specific shop.
 * The merchant dashboard uses this to see new orders appear instantly.
 */
export function subscribeToOrders(
  shopId: string,
  onInsert: RealtimeCallback<OrderPayload>,
  onUpdate?: RealtimeCallback<OrderPayload>,
): () => void {
  const supabase = createClient();
  const channelKey = `orders-${shopId}`;

  // Clean up any existing subscription for this shop
  unsubscribe(channelKey);

  const channel = supabase
    .channel(channelKey)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "orders",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onInsert(payload as RealtimePostgresChangesPayload<OrderPayload>);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onUpdate?.(payload as RealtimePostgresChangesPayload<OrderPayload>);
      },
    )
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log(`[Realtime] ✅ Subscribed to orders for shop: ${shopId}`);
        notifyStateChange("connected", channelKey);
      } else if (status === "CHANNEL_ERROR") {
        console.error(`[Realtime] ❌ Channel error for orders:${shopId}`, err);
        notifyStateChange("error", channelKey);
      } else if (status === "TIMED_OUT") {
        console.warn(`[Realtime] ⏱️ Timeout for orders:${shopId} — will retry`);
        notifyStateChange("connecting", channelKey);
      }
    });

  activeChannels.set(channelKey, channel);
  return () => unsubscribe(channelKey);
}

/**
 * Subscribe to real-time INSERT/UPDATE events on the customer_inquiries table
 * for a specific shop. Dashboard shows new inquiries instantly.
 */
export function subscribeToInquiries(
  shopId: string,
  onInsert: RealtimeCallback<InquiryPayload>,
  onUpdate?: RealtimeCallback<InquiryPayload>,
): () => void {
  const supabase = createClient();
  const channelKey = `inquiries-${shopId}`;

  unsubscribe(channelKey);

  const channel = supabase
    .channel(channelKey)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "customer_inquiries",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onInsert(payload as RealtimePostgresChangesPayload<InquiryPayload>);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "customer_inquiries",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onUpdate?.(payload as RealtimePostgresChangesPayload<InquiryPayload>);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[Realtime] ✅ Subscribed to inquiries for shop: ${shopId}`);
        notifyStateChange("connected", channelKey);
      }
    });

  activeChannels.set(channelKey, channel);
  return () => unsubscribe(channelKey);
}

/**
 * Subscribe to order status updates for a logged-in customer.
 */
export function subscribeToCustomerOrders(
  userId: string,
  onUpdate: RealtimeCallback<OrderPayload>,
): () => void {
  const supabase = createClient();
  const channelKey = `customer-orders-${userId}`;

  unsubscribe(channelKey);

  const channel = supabase
    .channel(channelKey)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `customer_user_id=eq.${userId}`,
      },
      (payload) => {
        onUpdate(payload as RealtimePostgresChangesPayload<OrderPayload>);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        notifyStateChange("connected", channelKey);
      } else if (status === "CHANNEL_ERROR") {
        notifyStateChange("error", channelKey);
      }
    });

  activeChannels.set(channelKey, channel);
  return () => unsubscribe(channelKey);
}

/**
 * Subscribe to product changes (INSERT/UPDATE/DELETE) for a specific shop.
 * The public storefront uses this to reflect availability changes in real-time.
 */
export function subscribeToProducts(
  shopId: string,
  onUpdate: RealtimeCallback<ProductPayload>,
  onInsert?: RealtimeCallback<ProductPayload>,
  onDelete?: RealtimeCallback<ProductPayload>,
): () => void {
  const supabase = createClient();
  const channelKey = `products-${shopId}`;

  unsubscribe(channelKey);

  const channel = supabase
    .channel(channelKey)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "products",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onUpdate(payload as RealtimePostgresChangesPayload<ProductPayload>);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "products",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onInsert?.(payload as RealtimePostgresChangesPayload<ProductPayload>);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "products",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onDelete?.(payload as RealtimePostgresChangesPayload<ProductPayload>);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[Realtime] ✅ Subscribed to products for shop: ${shopId}`);
        notifyStateChange("connected", channelKey);
      }
    });

  activeChannels.set(channelKey, channel);
  return () => unsubscribe(channelKey);
}

/**
 * Subscribe to new reviews for a specific shop.
 * The storefront page updates the review list in real-time.
 */
export function subscribeToReviews(
  shopId: string,
  onInsert: RealtimeCallback<ReviewPayload>,
): () => void {
  const supabase = createClient();
  const channelKey = `reviews-${shopId}`;

  unsubscribe(channelKey);

  const channel = supabase
    .channel(channelKey)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "reviews",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onInsert(payload as RealtimePostgresChangesPayload<ReviewPayload>);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[Realtime] ✅ Subscribed to reviews for shop: ${shopId}`);
        notifyStateChange("connected", channelKey);
      }
    });

  activeChannels.set(channelKey, channel);
  return () => unsubscribe(channelKey);
}

/**
 * Subscribe to inventory_variants changes for a specific shop.
 * Live inventory deduction updates and low-stock alerts.
 * Both merchant dashboard and public storefront benefit from this.
 */
export function subscribeToInventory(
  shopId: string,
  onUpdate: RealtimeCallback<InventoryVariantPayload>,
  onInsert?: RealtimeCallback<InventoryVariantPayload>,
  onDelete?: RealtimeCallback<InventoryVariantPayload>,
): () => void {
  const supabase = createClient();
  const channelKey = `inventory-${shopId}`;

  unsubscribe(channelKey);

  const channel = supabase
    .channel(channelKey)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "inventory_variants",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onUpdate(payload as RealtimePostgresChangesPayload<InventoryVariantPayload>);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "inventory_variants",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onInsert?.(payload as RealtimePostgresChangesPayload<InventoryVariantPayload>);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "inventory_variants",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onDelete?.(payload as RealtimePostgresChangesPayload<InventoryVariantPayload>);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[Realtime] ✅ Subscribed to inventory for shop: ${shopId}`);
        notifyStateChange("connected", channelKey);
      }
    });

  activeChannels.set(channelKey, channel);
  return () => unsubscribe(channelKey);
}

/**
 * Subscribe to analytics_logs INSERT events for a specific shop.
 * Pushes live analytics log updates to the merchant dashboard
 * (e.g., "Someone clicked on Product X just now").
 */
export function subscribeToAnalytics(
  shopId: string,
  onInsert: RealtimeCallback<AnalyticsPayload>,
): () => void {
  const supabase = createClient();
  const channelKey = `analytics-${shopId}`;

  unsubscribe(channelKey);

  const channel = supabase
    .channel(channelKey)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "analytics_logs",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onInsert(payload as RealtimePostgresChangesPayload<AnalyticsPayload>);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[Realtime] ✅ Subscribed to analytics for shop: ${shopId}`);
        notifyStateChange("connected", channelKey);
      }
    });

  activeChannels.set(channelKey, channel);
  return () => unsubscribe(channelKey);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Unsubscribe and remove a specific channel. */
export function unsubscribe(channelKey: string): void {
  const existing = activeChannels.get(channelKey);
  if (existing) {
    existing.unsubscribe();
    activeChannels.delete(channelKey);
    console.log(`[Realtime] 🔌 Unsubscribed from: ${channelKey}`);
    notifyStateChange("disconnected", channelKey);
  }
}

/** Unsubscribe from ALL active real-time channels. */
export function unsubscribeAll(): void {
  for (const [key, channel] of activeChannels) {
    channel.unsubscribe();
    console.log(`[Realtime] 🔌 Unsubscribed from: ${key}`);
    notifyStateChange("disconnected", key);
  }
  activeChannels.clear();
}
