/* -------------------------------------------------------------------------- */
/*  TrendMart — Real-Time Customer Order Status Tracking Service               */
/*                                                                             */
/*  Allows customers to query orders by phone number or order reference ID.    */
/*  Returns color-coded status with full lifecycle timelines.                  */
/* -------------------------------------------------------------------------- */

import { normalizePkPhoneDigits } from "@/lib/sanitization";
import type { OrderStatus } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackedOrder {
  id: string;
  shopId: string;
  shopName: string;
  shopWhatsapp?: string | null;
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
  orderType?: "delivery" | "pickup" | "dine_in";
  tableCode?: string | null;
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
  const rawType = (row.order_type as string | null | undefined) ?? "delivery";

  return {
    id: row.id as string,
    shopId: (row.shop_id as string) ?? "",
    shopName: (row.shops && typeof row.shops === "object"
      ? (row.shops as Record<string, unknown>).name as string
      : row.shop_name as string) ?? "Unknown Shop",
    shopWhatsapp:
      (row.shops && typeof row.shops === "object"
        ? (row.shops as Record<string, unknown>).whatsapp_number as string
        : (row.shop_whatsapp as string) ?? (row.whatsapp_number as string)) ?? null,
    customerName: (row.customer_name as string) ?? "",
    customerPhone: (row.customer_phone as string) ?? "",
    items,
    totalAmount: Number(row.total_amount) || 0,
    status,
    orderType:
      rawType === "pickup" || rawType === "dine_in"
        ? (rawType as "pickup" | "dine_in")
        : "delivery",
    tableCode: (row.table_code as string | null | undefined) ?? null,
    statusHistory: buildStatusTimeline(status, createdAt, updatedAt),
    trackingNumber: (row.tracking_number as string) ?? null,
    createdAt,
    updatedAt,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Raw order row returned by the server-side tracking API (`/api/orders/track`). */
interface TrackedOrderRow {
  id: string;
  shop_id: string;
  shop_name?: string | null;
  shop_whatsapp?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_user_id?: string | null;
  items_json?: unknown;
  total_amount?: number | null;
  status?: string | null;
  tracking_number?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

/**
 * Server-side "Trace Order" lookup.
 *
 * Calls the strict `/api/orders/track` route instead of the SECURITY DEFINER
 * RPCs directly. The route re-verifies on every request that the order belongs
 * to the current session's auth.uid() (direct buyer, owning merchant, or admin)
 * even when the phone number matches — so a phone number can never be used to
 * read another user's order history.
 */
async function fetchTrackedOrders(params: {
  phone?: string;
  orderId?: string;
}): Promise<ServiceResult<TrackedOrderRow[]>> {
  const query = new URLSearchParams();
  if (params.phone) query.set("phone", params.phone);
  if (params.orderId) query.set("orderId", params.orderId);

  try {
    const res = await fetch(`/api/orders/track?${query.toString()}`);
    const json = (await res.json()) as {
      success?: boolean;
      orders?: TrackedOrderRow[];
      error?: string;
    };
    if (!res.ok || !json.success) {
      return {
        success: false,
        error: json.error || "Could not track your order. Please try again.",
      };
    }
    return { success: true, data: json.orders ?? [] };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

/**
 * Track orders by phone number.
 * Searches orders where customer_phone contains the given phone digits.
 *
 * Strict ownership: the server route only ever returns orders whose
 * `customer_user_id` matches the signed-in user, or shops the caller owns
 * (merchant/admin) — even when the phone number matches.
 */
export async function trackOrdersByPhone(
  phone: string,
): Promise<ServiceResult<TrackingResult>> {
  const cleaned =
    normalizePkPhoneDigits(phone) || phone.replace(/\D/g, "");

  if (cleaned.length < 10) {
    return {
      success: false,
      error: "Please enter a valid phone number (min 10 digits).",
    };
  }

  const result = await fetchTrackedOrders({ phone: cleaned });
  if (!result.success) return result;

  const orders = result.data.map(parseTrackedOrder);

  return {
    success: true,
    data: {
      orders,
      query: phone,
      found: orders.length > 0,
    },
  };
}

/**
 * Track a single order by its reference/order ID.
 *
 * Strict ownership: the server route only returns the order when the signed-in
 * user placed it (customer_user_id), owns the shop, or is a platform admin.
 */
export async function trackOrderById(
  orderId: string,
): Promise<ServiceResult<TrackedOrder>> {
  const trimmed = orderId.trim();

  if (!trimmed) {
    return { success: false, error: "Please enter a valid order reference ID." };
  }

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(trimmed)) {
    return {
      success: false,
      error: "Please enter a valid order reference ID.",
    };
  }

  const result = await fetchTrackedOrders({ orderId: trimmed });
  if (!result.success) return result;
  if (result.data.length === 0) {
    return {
      success: false,
      error: "No order found with that reference ID. Please double-check and try again.",
    };
  }

  const order = parseTrackedOrder(result.data[0]);
  return { success: true, data: order };
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