"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Supabase Realtime WebSocket Channel Manager                    */
/*                                                                             */
/*  Free-tier aware: ONE physical channel per logical key with ref-counted     */
/*  fan-out (dashboard + kitchen + orders no longer open 3 sockets).           */
/*  Public storefront product/review live updates are optional — prefer soft   */
/*  refresh there; merchant / chat / notifications stay fully live.            */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// ─── Type Definitions ─────────────────────────────────────────────────────────

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

export type NotificationPayload = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link_url: string;
  entity_id: string;
  read: boolean;
  created_at: string;
};

export type SupportTicketPayload = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
};

export type AnalyticsPayload = {
  id: string;
  shop_id: string;
  event_type: string;
  product_id: string | null;
  created_at: string;
};

export type ConversationPayload = {
  id: string;
  shop_id: string;
  customer_user_id: string | null;
  customer_name: string;
  last_message_at: string;
  last_message_preview: string;
  merchant_unread_count: number;
  customer_unread_count: number;
  updated_at: string;
};

export type ChatMessagePayload = {
  id: string;
  conversation_id: string;
  sender_role: "customer" | "merchant";
  sender_user_id: string | null;
  body: string;
  is_deleted: boolean;
  created_at: string;
  read_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RealtimeCallback<T extends Record<string, any>> = (payload: RealtimePostgresChangesPayload<T>) => void;

// ─── Connection State ─────────────────────────────────────────────────────────

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";
type StateChangeCallback = (state: ConnectionState, channelKey: string) => void;

const stateListeners = new Set<StateChangeCallback>();
let globalConnectionState: ConnectionState = "disconnected";

export function onConnectionStateChange(callback: StateChangeCallback): () => void {
  stateListeners.add(callback);
  return () => {
    stateListeners.delete(callback);
  };
}

function notifyStateChange(state: ConnectionState, channelKey: string): void {
  globalConnectionState = state;
  for (const listener of stateListeners) {
    try {
      listener(state, channelKey);
    } catch {
      /* swallow */
    }
  }
}

export function getConnectionState(): ConnectionState {
  return globalConnectionState;
}

// ─── Shared (ref-counted) channel manager ─────────────────────────────────────

const activeChannels = new Map<string, RealtimeChannel>();

type SharedBucket = {
  channel: RealtimeChannel;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listeners: Set<any>;
};

const sharedBuckets = new Map<string, SharedBucket>();

/**
 * One physical Realtime channel per logical key. Multiple UI surfaces
 * (dashboard + kitchen + orders) share the socket; last unsubscriber tears it down.
 */
function acquireShared<TListener>(
  logicalKey: string,
  listener: TListener,
  createChannel: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fanout: (invoke: (listener: TListener) => void) => void,
  ) => RealtimeChannel,
): () => void {
  let bucket = sharedBuckets.get(logicalKey);
  if (!bucket) {
    const listeners = new Set<TListener>();
    const channel = createChannel((invoke) => {
      for (const l of listeners) {
        try {
          invoke(l);
        } catch {
          /* swallow per-listener errors */
        }
      }
    });
    bucket = { channel, listeners };
    sharedBuckets.set(logicalKey, bucket);
    activeChannels.set(logicalKey, channel);
  }
  bucket.listeners.add(listener);
  return () => {
    const b = sharedBuckets.get(logicalKey);
    if (!b) return;
    b.listeners.delete(listener);
    if (b.listeners.size === 0) {
      unsubscribe(logicalKey);
      sharedBuckets.delete(logicalKey);
    }
  };
}

function bindStatus(channel: RealtimeChannel, channelKey: string, label: string): RealtimeChannel {
  return channel.subscribe((status, err) => {
    if (status === "SUBSCRIBED") {
      if (process.env.NODE_ENV === "development") {
        console.log(`[Realtime] ✅ ${label}`);
      }
      notifyStateChange("connected", channelKey);
    } else if (status === "CHANNEL_ERROR") {
      console.error(`[Realtime] ❌ ${label}`, err);
      notifyStateChange("error", channelKey);
    } else if (status === "TIMED_OUT") {
      notifyStateChange("connecting", channelKey);
    }
  });
}

/** Merchant dashboard — live new orders + status changes. */
export function subscribeToOrders(
  shopId: string,
  onInsert: RealtimeCallback<OrderPayload>,
  onUpdate?: RealtimeCallback<OrderPayload>,
): () => void {
  const logicalKey = `orders-${shopId}`;
  type L = { onInsert: RealtimeCallback<OrderPayload>; onUpdate?: RealtimeCallback<OrderPayload> };
  return acquireShared<L>(logicalKey, { onInsert, onUpdate }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase
        .channel(logicalKey)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders", filter: `shop_id=eq.${shopId}` },
          (payload) =>
            fanout((l) => l.onInsert(payload as RealtimePostgresChangesPayload<OrderPayload>)),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: `shop_id=eq.${shopId}` },
          (payload) =>
            fanout((l) =>
              l.onUpdate?.(payload as RealtimePostgresChangesPayload<OrderPayload>),
            ),
        ),
      logicalKey,
      `orders:${shopId}`,
    );
  });
}

export function subscribeToInquiries(
  shopId: string,
  onInsert: RealtimeCallback<InquiryPayload>,
  onUpdate?: RealtimeCallback<InquiryPayload>,
): () => void {
  const logicalKey = `inquiries-${shopId}`;
  type L = {
    onInsert: RealtimeCallback<InquiryPayload>;
    onUpdate?: RealtimeCallback<InquiryPayload>;
  };
  return acquireShared<L>(logicalKey, { onInsert, onUpdate }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase
        .channel(logicalKey)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "customer_inquiries",
            filter: `shop_id=eq.${shopId}`,
          },
          (payload) =>
            fanout((l) => l.onInsert(payload as RealtimePostgresChangesPayload<InquiryPayload>)),
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "customer_inquiries",
            filter: `shop_id=eq.${shopId}`,
          },
          (payload) =>
            fanout((l) =>
              l.onUpdate?.(payload as RealtimePostgresChangesPayload<InquiryPayload>),
            ),
        ),
      logicalKey,
      `inquiries:${shopId}`,
    );
  });
}

export function subscribeToShopConversations(
  shopId: string,
  onChange: RealtimeCallback<ConversationPayload>,
): () => void {
  const logicalKey = `conversations-${shopId}`;
  type L = { onChange: RealtimeCallback<ConversationPayload> };
  return acquireShared<L>(logicalKey, { onChange }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase.channel(logicalKey).on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `shop_id=eq.${shopId}` },
        (payload) =>
          fanout((l) =>
            l.onChange(payload as RealtimePostgresChangesPayload<ConversationPayload>),
          ),
      ),
      logicalKey,
      `conversations:${shopId}`,
    );
  });
}

export function subscribeToMyConversations(
  userId: string,
  onChange: RealtimeCallback<ConversationPayload>,
): () => void {
  const logicalKey = `my-conversations-${userId}`;
  type L = { onChange: RealtimeCallback<ConversationPayload> };
  return acquireShared<L>(logicalKey, { onChange }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase.channel(logicalKey).on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `customer_user_id=eq.${userId}`,
        },
        (payload) =>
          fanout((l) =>
            l.onChange(payload as RealtimePostgresChangesPayload<ConversationPayload>),
          ),
      ),
      logicalKey,
      `my-conversations:${userId}`,
    );
  });
}

export function subscribeToConversationMessages(
  conversationId: string,
  onInsert: RealtimeCallback<ChatMessagePayload>,
  onUpdate?: RealtimeCallback<ChatMessagePayload>,
): () => void {
  const logicalKey = `chat-messages-${conversationId}`;
  type L = {
    onInsert: RealtimeCallback<ChatMessagePayload>;
    onUpdate?: RealtimeCallback<ChatMessagePayload>;
  };
  return acquireShared<L>(logicalKey, { onInsert, onUpdate }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase
        .channel(logicalKey)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "conversation_messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) =>
            fanout((l) =>
              l.onInsert(payload as RealtimePostgresChangesPayload<ChatMessagePayload>),
            ),
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "conversation_messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) =>
            fanout((l) =>
              l.onUpdate?.(payload as RealtimePostgresChangesPayload<ChatMessagePayload>),
            ),
        ),
      logicalKey,
      `chat:${conversationId}`,
    );
  });
}

export function subscribeToMyInquiries(
  userId: string,
  onUpdate: RealtimeCallback<InquiryPayload>,
): () => void {
  const logicalKey = `my-inquiries-${userId}`;
  type L = { onUpdate: RealtimeCallback<InquiryPayload> };
  return acquireShared<L>(logicalKey, { onUpdate }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase.channel(logicalKey).on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customer_inquiries",
          filter: `customer_user_id=eq.${userId}`,
        },
        (payload) =>
          fanout((l) =>
            l.onUpdate(payload as RealtimePostgresChangesPayload<InquiryPayload>),
          ),
      ),
      logicalKey,
      `my-inquiries:${userId}`,
    );
  });
}

/** Customer order status (tracking / review reminder when intentionally wired). */
export function subscribeToCustomerOrders(
  userId: string,
  onUpdate: RealtimeCallback<OrderPayload>,
): () => void {
  const logicalKey = `customer-orders-${userId}`;
  type L = { onUpdate: RealtimeCallback<OrderPayload> };
  return acquireShared<L>(logicalKey, { onUpdate }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase.channel(logicalKey).on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `customer_user_id=eq.${userId}`,
        },
        (payload) =>
          fanout((l) => l.onUpdate(payload as RealtimePostgresChangesPayload<OrderPayload>)),
      ),
      logicalKey,
      `customer-orders:${userId}`,
    );
  });
}

export function subscribeToNotifications(
  userId: string,
  onInsert: RealtimeCallback<NotificationPayload>,
): () => void {
  const logicalKey = `notifications-${userId}`;
  type L = { onInsert: RealtimeCallback<NotificationPayload> };
  return acquireShared<L>(logicalKey, { onInsert }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase.channel(logicalKey).on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) =>
          fanout((l) =>
            l.onInsert(payload as RealtimePostgresChangesPayload<NotificationPayload>),
          ),
      ),
      logicalKey,
      `notifications:${userId}`,
    );
  });
}

export function subscribeToSupportTickets(
  onInsert: RealtimeCallback<SupportTicketPayload>,
): () => void {
  const logicalKey = `support-tickets`;
  type L = { onInsert: RealtimeCallback<SupportTicketPayload> };
  return acquireShared<L>(logicalKey, { onInsert }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase.channel(logicalKey).on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_tickets" },
        (payload) =>
          fanout((l) =>
            l.onInsert(payload as RealtimePostgresChangesPayload<SupportTicketPayload>),
          ),
      ),
      logicalKey,
      "support-tickets",
    );
  });
}

/** Optional storefront live catalog — prefer soft refresh for guests on Free tier. */
export function subscribeToProducts(
  shopId: string,
  onUpdate: RealtimeCallback<ProductPayload>,
  onInsert?: RealtimeCallback<ProductPayload>,
  onDelete?: RealtimeCallback<ProductPayload>,
): () => void {
  const logicalKey = `products-${shopId}`;
  type L = {
    onUpdate: RealtimeCallback<ProductPayload>;
    onInsert?: RealtimeCallback<ProductPayload>;
    onDelete?: RealtimeCallback<ProductPayload>;
  };
  return acquireShared<L>(logicalKey, { onUpdate, onInsert, onDelete }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase
        .channel(logicalKey)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "products", filter: `shop_id=eq.${shopId}` },
          (payload) =>
            fanout((l) =>
              l.onUpdate(payload as RealtimePostgresChangesPayload<ProductPayload>),
            ),
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "products", filter: `shop_id=eq.${shopId}` },
          (payload) =>
            fanout((l) =>
              l.onInsert?.(payload as RealtimePostgresChangesPayload<ProductPayload>),
            ),
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "products", filter: `shop_id=eq.${shopId}` },
          (payload) =>
            fanout((l) =>
              l.onDelete?.(payload as RealtimePostgresChangesPayload<ProductPayload>),
            ),
        ),
      logicalKey,
      `products:${shopId}`,
    );
  });
}

export function subscribeToReviews(
  shopId: string,
  onInsert: RealtimeCallback<ReviewPayload>,
): () => void {
  const logicalKey = `reviews-${shopId}`;
  type L = { onInsert: RealtimeCallback<ReviewPayload> };
  return acquireShared<L>(logicalKey, { onInsert }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase.channel(logicalKey).on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reviews", filter: `shop_id=eq.${shopId}` },
        (payload) =>
          fanout((l) => l.onInsert(payload as RealtimePostgresChangesPayload<ReviewPayload>)),
      ),
      logicalKey,
      `reviews:${shopId}`,
    );
  });
}

export function subscribeToInventory(
  shopId: string,
  onUpdate: RealtimeCallback<InventoryVariantPayload>,
  onInsert?: RealtimeCallback<InventoryVariantPayload>,
  onDelete?: RealtimeCallback<InventoryVariantPayload>,
): () => void {
  const logicalKey = `inventory-${shopId}`;
  type L = {
    onUpdate: RealtimeCallback<InventoryVariantPayload>;
    onInsert?: RealtimeCallback<InventoryVariantPayload>;
    onDelete?: RealtimeCallback<InventoryVariantPayload>;
  };
  return acquireShared<L>(logicalKey, { onUpdate, onInsert, onDelete }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase
        .channel(logicalKey)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "inventory_variants",
            filter: `shop_id=eq.${shopId}`,
          },
          (payload) =>
            fanout((l) =>
              l.onUpdate(payload as RealtimePostgresChangesPayload<InventoryVariantPayload>),
            ),
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "inventory_variants",
            filter: `shop_id=eq.${shopId}`,
          },
          (payload) =>
            fanout((l) =>
              l.onInsert?.(payload as RealtimePostgresChangesPayload<InventoryVariantPayload>),
            ),
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "inventory_variants",
            filter: `shop_id=eq.${shopId}`,
          },
          (payload) =>
            fanout((l) =>
              l.onDelete?.(payload as RealtimePostgresChangesPayload<InventoryVariantPayload>),
            ),
        ),
      logicalKey,
      `inventory:${shopId}`,
    );
  });
}

/** Unused on soft-launch — kept for API stability; prefer summary polling. */
export function subscribeToAnalytics(
  shopId: string,
  onInsert: RealtimeCallback<AnalyticsPayload>,
): () => void {
  const logicalKey = `analytics-${shopId}`;
  type L = { onInsert: RealtimeCallback<AnalyticsPayload> };
  return acquireShared<L>(logicalKey, { onInsert }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase.channel(logicalKey).on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "analytics_logs",
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) =>
          fanout((l) =>
            l.onInsert(payload as RealtimePostgresChangesPayload<AnalyticsPayload>),
          ),
      ),
      logicalKey,
      `analytics:${shopId}`,
    );
  });
}

export function subscribeToShopAds(
  shopId: string,
  onChange: RealtimeCallback<Record<string, unknown>>,
): () => void {
  const logicalKey = `shop-ads-${shopId}`;
  type L = { onChange: RealtimeCallback<Record<string, unknown>> };
  return acquireShared<L>(logicalKey, { onChange }, (fanout) => {
    const supabase = createClient();
    return bindStatus(
      supabase.channel(logicalKey).on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "promotional_ads",
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) =>
          fanout((l) =>
            l.onChange(payload as RealtimePostgresChangesPayload<Record<string, unknown>>),
          ),
      ),
      logicalKey,
      `shop-ads:${shopId}`,
    );
  });
}

export function unsubscribe(channelKey: string): void {
  const existing = activeChannels.get(channelKey);
  if (existing) {
    existing.unsubscribe();
    activeChannels.delete(channelKey);
    sharedBuckets.delete(channelKey);
    notifyStateChange("disconnected", channelKey);
  }
}

export function unsubscribeAll(): void {
  for (const [key, channel] of activeChannels) {
    channel.unsubscribe();
    notifyStateChange("disconnected", key);
  }
  activeChannels.clear();
  sharedBuckets.clear();
}
