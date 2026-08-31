/* -------------------------------------------------------------------------- */
/*  TrendsMart — Analytics Service (Real-Time Tracking Pipeline)                 */
/*                                                                             */
/*  Overhauled with:                                                           */
/*   - Real-time Supabase Realtime channel subscriptions for live metrics     */
/*   - Batch-insert for high-traffic events (reduces DB roundtrips)          */
/*   - Client-side event queue with debounce to avoid flooding                */
/*   - Push updates to merchant dashboard via WebSocket channels              */
/*   - Page view duration tracking                                            */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { AnalyticsSummary } from "@/types";
import { logError } from "@/services/errorService";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

// ─── Real-Time Metrics Callback ───────────────────────────────────────────────

export interface LiveMetrics {
  total_views: number;
  views_today: number;
  total_product_clicks: number;
  clicks_today: number;
  /** Timestamp of the latest event */
  lastEventAt?: string;
  /** The raw event that triggered this update */
  latestEvent?: "shop_view" | "product_click";
}

/** Callback type for live metrics subscribers. */
export type MetricsCallback = (metrics: LiveMetrics) => void;

// ─── Event Queue (Client-Side Batching) ───────────────────────────────────────

interface QueuedEvent {
  shop_id: string;
  event_type: "shop_view" | "product_click";
  product_id?: string | null;
  timestamp: string;
}

let eventQueue: QueuedEvent[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 2000; // Flush every 2 seconds
const MAX_QUEUE_SIZE = 25; // Flush immediately if queue exceeds this

/** Flush queued events to Supabase in a batch insert. */
async function flushEventQueue(): Promise<void> {
  if (eventQueue.length === 0) return;

  const batch = [...eventQueue];
  eventQueue = [];

  const supabase = createClient();
  try {
    const { error } = await supabase.from("analytics_logs").insert(
      batch.map((e) => ({
        shop_id: e.shop_id,
        event_type: e.event_type,
        product_id: e.product_id ?? null,
      })),
    );

    if (error) {
      // Re-queue on failure (simple retry — next flush will pick them up)
      eventQueue = [...batch, ...eventQueue];
      logError(error, {
        module: "analyticsService.flushEventQueue",
        meta: { batchSize: batch.length },
      });
    }
  } catch (err) {
    // Re-queue on failure
    eventQueue = [...batch, ...eventQueue];
    logError(err, {
      module: "analyticsService.flushEventQueue",
      meta: { batchSize: batch.length },
    });
  }
}

/** Schedule a queue flush or flush immediately if threshold reached. */
function scheduleFlush(): void {
  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    // Flush immediately
    if (flushTimeout) clearTimeout(flushTimeout);
    flushTimeout = null;
    flushEventQueue();
    return;
  }

  if (flushTimeout) return; // Already scheduled

  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    flushEventQueue();
  }, FLUSH_INTERVAL_MS);
}

// ─── Page View Duration Tracking ─────────────────────────────────────────────

const pageEntryTimes = new Map<string, number>(); // key: `${shopId}:${sessionId}`

/** Start tracking page view duration for a shop. */
export function startPageViewTimer(shopId: string): void {
  const key = `${shopId}:${getSessionId()}`;
  pageEntryTimes.set(key, Date.now());
}

/** End tracking and return the duration in seconds. */
export function endPageViewTimer(shopId: string): number {
  const key = `${shopId}:${getSessionId()}`;
  const entry = pageEntryTimes.get(key);
  if (!entry) return 0;
  pageEntryTimes.delete(key);
  return Math.round((Date.now() - entry) / 1000);
}

/** Simple session ID (persisted in sessionStorage for the tab lifetime). */
function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  let sid = sessionStorage.getItem("trendsmart_session_id");
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem("trendsmart_session_id", sid);
  }
  return sid;
}

// ─── Event Logging (Public — Fire-and-Forget) ─────────────────────────────────

const SHOP_VIEW_DEDUPE_MS = 45 * 60 * 1000; // 45 minutes per visitor per shop
const SHOP_VIEW_STORAGE_PREFIX = "trendsmart_shop_view_at_";

function recentlyLoggedShopView(shopId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(`${SHOP_VIEW_STORAGE_PREFIX}${shopId}`);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < SHOP_VIEW_DEDUPE_MS;
  } catch {
    return false;
  }
}

function markShopViewLogged(shopId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${SHOP_VIEW_STORAGE_PREFIX}${shopId}`, String(Date.now()));
  } catch {
    /* ignore quota */
  }
}

async function isCurrentUserShopOwner(shopId: string): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("shops")
      .select("id")
      .eq("id", shopId)
      .eq("owner_id", user.id)
      .maybeSingle();
    return Boolean(data?.id);
  } catch {
    return false;
  }
}

/**
 * Log a shop view event.
 * Skips the shop owner and repeat visits from the same browser within 45 minutes.
 * Product clicks stay separate so genuine browsing still counts.
 */
export async function logShopView(shopId: string): Promise<void> {
  if (!shopId) return;
  if (recentlyLoggedShopView(shopId)) return;
  if (await isCurrentUserShopOwner(shopId)) return;

  markShopViewLogged(shopId);
  eventQueue.push({
    shop_id: shopId,
    event_type: "shop_view",
    timestamp: new Date().toISOString(),
  });
  scheduleFlush();

  notifyMetricsSubscribers(shopId, "shop_view");
}

/**
 * Log a product click event.
 * Uses batched queue for performance under high traffic.
 */
export async function logProductClick(
  shopId: string,
  productId: string,
): Promise<void> {
  eventQueue.push({
    shop_id: shopId,
    event_type: "product_click",
    product_id: productId,
    timestamp: new Date().toISOString(),
  });
  scheduleFlush();

  // Trigger real-time push
  notifyMetricsSubscribers(shopId, "product_click");
}

/** Force-flush any pending events (call on page unload). */
export function flushPendingEvents(): void {
  if (eventQueue.length > 0) {
    // Attempt to use sendBeacon for reliability during page unload
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // Note: Supabase client uses fetch which may not work reliably during unload.
      // The regular flushEventQueue handles the primary path; sendBeacon is a best-effort fallback.
      // sendBeacon to a Supabase Edge Function would be ideal; for now just flush normally
    }
    flushEventQueue();
  }
}

// ─── Real-Time Metrics Subscriptions ─────────────────────────────────────────

const metricsSubscribers = new Map<string, Set<MetricsCallback>>();
const metricsCache = new Map<string, LiveMetrics>();

/** Notify all subscribers for a given shop about new metrics. */
async function notifyMetricsSubscribers(
  shopId: string,
  eventType: "shop_view" | "product_click",
): Promise<void> {
  const subscribers = metricsSubscribers.get(shopId);
  if (!subscribers || subscribers.size === 0) return;

  // Fetch latest metrics for this shop
  const result = await fetchAnalyticsSummary(shopId);
  if (result.success) {
    const metrics: LiveMetrics = {
      ...result.data,
      lastEventAt: new Date().toISOString(),
      latestEvent: eventType,
    };
    metricsCache.set(shopId, metrics);

    // Notify all subscribers
    for (const callback of subscribers) {
      try {
        callback(metrics);
      } catch (err) {
        logError(err, {
          module: "analyticsService.notifyMetricsSubscribers",
          meta: { shopId },
        });
      }
    }
  }
}

/**
 * Subscribe to real-time analytics metrics for a specific shop.
 * The callback is invoked whenever a new event is logged for this shop.
 *
 * @returns Unsubscribe function.
 */
export function subscribeToLiveMetrics(
  shopId: string,
  callback: MetricsCallback,
): () => void {
  if (!metricsSubscribers.has(shopId)) {
    metricsSubscribers.set(shopId, new Set());
  }

  const subscribers = metricsSubscribers.get(shopId)!;
  subscribers.add(callback);

  // Immediately push cached metrics if available
  const cached = metricsCache.get(shopId);
  if (cached) {
    setTimeout(() => callback(cached), 0);
  }

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) {
      metricsSubscribers.delete(shopId);
    }
  };
}

/**
 * Subscribe to real-time analytics via Supabase Realtime channel.
 * This provides server-pushed updates when new analytics_logs rows are inserted.
 *
 * @returns Unsubscribe function.
 */
export function subscribeToRealtimeAnalytics(
  shopId: string,
): () => void {
  const supabase = createClient();
  const channelKey = `analytics-metrics-${shopId}`;

  const channel: RealtimeChannel = supabase
    .channel(channelKey)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "analytics_logs",
        filter: `shop_id=eq.${shopId}`,
      },
      () => {
        // New analytics event — re-fetch and notify
        notifyMetricsSubscribers(shopId, "shop_view");
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[Analytics] ✅ Realtime channel active for shop: ${shopId}`);
      }
    });

  return () => {
    channel.unsubscribe();
    console.log(`[Analytics] 🔌 Unsubscribed from analytics for shop: ${shopId}`);
  };
}

// ─── Analytics Summary Fetch ──────────────────────────────────────────────────

/**
 * Fetch aggregated analytics for a specific shop.
 * Returns total views, total clicks, and today's counts.
 */
export async function fetchAnalyticsSummary(
  shopId: string,
): Promise<ServiceResult<AnalyticsSummary>> {
  const supabase = createClient();

  try {
    // Server-side COUNT (head: true) instead of streaming every log row to the
    // browser and counting client-side — O(1) transfer regardless of how many
    // analytics events a shop has accumulated.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const buildCount = (eventType: string, from?: string) => {
      let q = supabase
        .from("analytics_logs")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("event_type", eventType);
      if (from) q = q.gte("created_at", from);
      return q;
    };

    const [viewsRes, clicksRes, viewsTodayRes, clicksTodayRes] =
      await Promise.all([
        buildCount("shop_view"),
        buildCount("product_click"),
        buildCount("shop_view", todayISO),
        buildCount("product_click", todayISO),
      ]);

    const err =
      viewsRes.error ||
      clicksRes.error ||
      viewsTodayRes.error ||
      clicksTodayRes.error;
    if (err) throw err;

    const summary = {
      total_views: viewsRes.count ?? 0,
      total_product_clicks: clicksRes.count ?? 0,
      views_today: viewsTodayRes.count ?? 0,
      clicks_today: clicksTodayRes.count ?? 0,
    };

    // Cache the summary
    metricsCache.set(shopId, {
      ...summary,
      lastEventAt: new Date().toISOString(),
    });

    return { success: true, data: summary };
  } catch (err) {
    logError(err, {
      module: "analyticsService.fetchAnalyticsSummary",
      meta: { shopId },
    });
    return { success: false, error: toError(err) };
  }
}

// ─── Page Visibility & Unload Handlers ───────────────────────────────────────

if (typeof window !== "undefined") {
  // Flush queue when the page is hidden/closed
  window.addEventListener("beforeunload", () => {
    flushPendingEvents();
  });

  // Also flush on page hide (mobile Safari, etc.)
  window.addEventListener("pagehide", () => {
    flushPendingEvents();
  });

  // Flush when tab becomes hidden (user switches tabs)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingEvents();
    }
  });
}