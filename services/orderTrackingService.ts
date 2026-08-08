/* -------------------------------------------------------------------------- */
/*  TrendMart — Real-Time Customer Order Status Tracking Service               */
/*                                                                             */
/*  Allows customers to query orders by phone number or order reference ID.    */
/*  Returns color-coded status with full lifecycle timelines.                  */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import type { Order, OrderStatus } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackedOrder {
  id: string;
  shopId: string;
  shopName: string;
  customerName: string;
  customerPhone: string;
  items: Array<{
    name: string;
    price: number;
    quantity?: number;
    variant?: string;
  }>;
  totalAmount: number;
  status: OrderStatus;
  statusHistory: StatusTimelineEntry[];
  trackingNumber?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface StatusTimelineEntry {
  status: OrderStatus;
  label: string;
  timestamp: string;
  completed: boolean;
  active: boolean;
  color: string;
  icon: string;
}

export interface TrackingResult {
  orders: TrackedOrder[];
  query: string;
  found: boolean;
}

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Order Status Lifecycle Timeline ──────────────────────────────────────────

const STATUS_TIMELINE: Array<{
  status: OrderStatus;
  label: string;
  color: string;
  icon: string;
}> = [
  { status: "Pending", label: "Order Placed", color: "#f59e0b", icon: "📋" },
  { status: "Processing", label: "Processing", color: "#3b82f6", icon: "⚙️" },
  { status: "Dispatched", label: "Dispatched", color: "#8b5cf6", icon: "🚚" },
  { status: "Delivered", label: "Delivered", color: "#10b981", icon: "✅" },
  { status: "Cancelled", label: "Cancelled", color: "#ef4444", icon: "❌" },
];

const STATUS_ORDER: OrderStatus[] = [
  "Pending",
  "Processing",
  "Dispatched",
  "Delivered",
];

/**
 * Build a full timeline for an order given its current status.
 * Shows all steps up to current, marking completed/active/future.
 * Exported so the live tracking page can rebuild the timeline in-place
 * whenever a realtime status-change notification arrives.
 */
export function buildStatusTimeline(
  currentStatus: OrderStatus,
  createdAt: string,
  updatedAt?: string,
): StatusTimelineEntry[] {
  const timeline: StatusTimelineEntry[] = [];

  // For cancelled orders, show Pending as completed, Cancelled as active (red)
  if (currentStatus === "Cancelled") {
    timeline.push({
      status: "Pending",
      label: "Order Placed",
      timestamp: createdAt,
      completed: true,
      active: false,
      color: "#6b7280",
      icon: "📋",
    });
    timeline.push({
      status: "Cancelled",
      label: "Cancelled",
      timestamp: updatedAt ?? createdAt,
      completed: true,
      active: true,
      color: "#ef4444",
      icon: "❌",
    });
    return timeline;
  }

  const currentIndex = STATUS_ORDER.indexOf(currentStatus);

  for (let i = 0; i < STATUS_ORDER.length; i++) {
    const entry = STATUS_TIMELINE.find(
      (s) => s.status === STATUS_ORDER[i],
    )!;
    const isCompleted = i < currentIndex;
    const isActive = i === currentIndex;

    timeline.push({
      status: entry.status,
      label: entry.label,
      timestamp: isActive && updatedAt ? updatedAt : isCompleted ? updatedAt ?? createdAt : "",
      completed: isCompleted,
      active: isActive,
      color: isCompleted ? "#10b981" : isActive ? entry.color : "#d1d5db",
      icon: isCompleted ? "✅" : isActive ? entry.icon : "⏳",
    });
  }

  return timeline;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/**
 * Parse a raw Supabase order row into a TrackedOrder.
 */
function parseTrackedOrder(row: Record<string, unknown>): TrackedOrder {
  let items: Array<{ name: string; price: number; quantity?: number; variant?: string }> = [];
  try {
    const raw = row.items_json;
    if (Array.isArray(raw)) {
      items = raw.map((it: Record<string, unknown>) => ({
        name: (it.name as string) ?? "Unknown Item",
        price: Number(it.price) || 0,
        quantity: it.quantity != null ? Number(it.quantity) : undefined,
        variant: it.variant as string | undefined,
      }));
    }
  } catch {
    items = [];
  }

  const status = (row.status as OrderStatus) ?? "Pending";
  const createdAt = (row.created_at as string) ?? new Date().toISOString();
  const updatedAt = (row.updated_at as string) ?? undefined;

  return {
    id: row.id as string,
    shopId: (row.shop_id as string) ?? "",
    shopName: (row.shops && typeof row.shops === "object"
      ? (row.shops as Record<string, unknown>).name as string
      : row.shop_name as string) ?? "Unknown Shop",
    customerName: (row.customer_name as string) ?? "",
    customerPhone: (row.customer_phone as string) ?? "",
    items,
    totalAmount: Number(row.total_amount) || 0,
    status,
    statusHistory: buildStatusTimeline(status, createdAt, updatedAt),
    trackingNumber: (row.tracking_number as string) ?? null,
    createdAt,
    updatedAt,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Track orders by phone number.
 * Searches orders where customer_phone contains the given phone digits.
 */
export async function trackOrdersByPhone(
  phone: string,
): Promise<ServiceResult<TrackingResult>> {
  const supabase = createClient();
  const cleaned = phone.replace(/\D/g, "");

  if (cleaned.length < 10) {
    return {
      success: false,
      error: "Please enter a valid phone number (min 10 digits).",
    };
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*, shops!inner(name)")
      .ilike("customer_phone", `%${cleaned}%`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const orders = ((data as Record<string, unknown>[]) ?? []).map(
      parseTrackedOrder,
    );

    return {
      success: true,
      data: {
        orders,
        query: phone,
        found: orders.length > 0,
      },
    };
  } catch (err) {
    logError(err, {
      module: "orderTrackingService.trackOrdersByPhone",
      meta: { phone: cleaned },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Track a single order by its reference/order ID.
 */
export async function trackOrderById(
  orderId: string,
): Promise<ServiceResult<TrackedOrder>> {
  const supabase = createClient();
  const trimmed = orderId.trim();

  if (!trimmed) {
    return { success: false, error: "Please enter a valid order reference ID." };
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*, shops!inner(name)")
      .eq("id", trimmed)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return {
          success: false,
          error: "No order found with that reference ID. Please double-check and try again.",
        };
      }
      throw error;
    }

    const order = parseTrackedOrder(data as Record<string, unknown>);
    return { success: true, data: order };
  } catch (err) {
    logError(err, {
      module: "orderTrackingService.trackOrderById",
      meta: { orderId: trimmed },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Track orders by both phone AND order ID (combined search).
 * Returns all orders matching the phone, but also highlights the specific order if found.
 */
export async function trackOrdersByPhoneAndId(
  phone: string,
  orderId?: string,
): Promise<ServiceResult<TrackingResult & { highlightedOrderId?: string }>> {
  // First, get orders by phone
  const phoneResult = await trackOrdersByPhone(phone);

  if (!phoneResult.success) {
    return phoneResult;
  }

  const result = phoneResult.data;

  // If orderId provided, try to find it specifically
  if (orderId && orderId.trim()) {
    const idResult = await trackOrderById(orderId);
    if (idResult.success) {
      // Check if this order is already in the list
      const exists = result.orders.some((o) => o.id === idResult.data.id);
      if (!exists) {
        result.orders.unshift(idResult.data);
      }
      return {
        success: true,
        data: { ...result, highlightedOrderId: idResult.data.id },
      };
    }
  }

  return { success: true, data: result };
}