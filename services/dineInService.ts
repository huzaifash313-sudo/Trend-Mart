/* -------------------------------------------------------------------------- */
/*  TrendMart — Dine-In Ordering Service (QR Table Ordering, Phase 1)          */
/*                                                                             */
/*  Thin, RLS-aware helpers used by the customer scan page, the kitchen        */
/*  board and the merchant tables dashboard. Order creation itself runs on     */
/*  the server (POST /api/dinein/orders) so prices stay authoritative.        */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { normalizePkPhoneDigits } from "@/lib/sanitization";
import type { DineInTable, DineStatus, Order, OrderItem } from "@/types";
import { dineStatusToLegacy } from "@/types";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/* -------------------------------------------------------------------------- */
/*  Table lookup (anonymous-safe via SECURITY DEFINER RPC)                     */
/* -------------------------------------------------------------------------- */

export interface DineTableLookup {
  table_id: string;
  table_name: string;
  table_code: string;
  shop_id: string;
  shop_name: string;
  shop_logo_url: string | null;
  shop_banner_url: string | null;
  shop_is_live: boolean;
  shop_accent_color: string | null;
  shop_whatsapp: string | null;
  shop_location: string | null;
}

/** Resolve a QR token to the table + shop. Returns null when invalid/inactive. */
export async function lookupTableByToken(
  token: string,
): Promise<ServiceResult<DineTableLookup | null>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase.rpc("lookup_dine_table", {
      p_token: token.trim(),
    });
    if (error) throw error;
    const row = (data as Record<string, unknown>[] | null)?.[0];
    if (!row) return { success: true, data: null };
    return {
      success: true,
      data: {
        table_id: String(row.table_id),
        table_name: String(row.table_name ?? ""),
        table_code: String(row.table_code ?? row.table_name ?? ""),
        shop_id: String(row.shop_id),
        shop_name: String(row.shop_name ?? ""),
        shop_logo_url: row.shop_logo_url ? String(row.shop_logo_url) : null,
        shop_banner_url: row.shop_banner_url ? String(row.shop_banner_url) : null,
        shop_is_live: row.shop_is_live !== false,
        shop_accent_color: row.shop_accent_color ? String(row.shop_accent_color) : null,
        shop_whatsapp: row.shop_whatsapp ? String(row.shop_whatsapp) : null,
        shop_location: row.shop_location ? String(row.shop_location) : null,
      },
    };
  } catch (err) {
    logError(err, { module: "dineInService.lookupTableByToken", meta: { token } });
    return { success: false, error: toError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Place a dine-in order (server-authoritative)                               */
/* -------------------------------------------------------------------------- */

export interface DineInOrderLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  variant?: string;
  notes?: string;
}

export interface PlaceDineInOrderParams {
  tableToken: string;
  customerName: string;
  customerPhone?: string;
  items: DineInOrderLine[];
  notes?: string;
  /** "staff" = placed by the merchant from the kitchen (skips cooldown). */
  source?: "staff";
}

export interface DineInPlacedOrder {
  id: string;
  shop_id: string;
  table_code: string;
  customer_name: string;
  items_json: OrderItem[];
  total_amount: number;
  dine_status: DineStatus;
  created_at: string;
}

/** POST to the server-side dine-in checkout route (no sign-in required). */
export async function placeDineInOrder(
  params: PlaceDineInOrderParams,
): Promise<ServiceResult<DineInPlacedOrder>> {
  try {
    const res = await fetch("/api/dinein/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, ...(params.source ? { source: params.source } : {}) }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      order?: DineInPlacedOrder;
    };
    if (!res.ok || !json.success || !json.order) {
      return {
        success: false,
        error: json.error || "Could not place your order. Please try again.",
      };
    }
    return { success: true, data: json.order };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Could not reach the server.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Kitchen board — read active dine-in orders + advance status                */
/* -------------------------------------------------------------------------- */

function parseOrder(row: Record<string, unknown>): Order {
  let items: OrderItem[] = [];
  try {
    items = Array.isArray(row.items_json) ? (row.items_json as OrderItem[]) : [];
  } catch {
    items = [];
  }
  return {
    id: row.id as string,
    shop_id: row.shop_id as string,
    customer_name: (row.customer_name as string) ?? "",
    customer_phone: (row.customer_phone as string) ?? "",
    items_json: items,
    total_amount: Number(row.total_amount) || 0,
    status: (row.status as Order["status"]) ?? "Pending",
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string) ?? undefined,
    notes: row.notes ? String(row.notes) : undefined,
    order_type: (row.order_type as Order["order_type"]) ?? "delivery",
    table_id: row.table_id ? (row.table_id as string) : null,
    table_code: row.table_code ? (row.table_code as string) : null,
    dine_status: (row.dine_status as DineStatus) ?? null,
  };
}

/** Recent dine-in orders for a shop (kitchen board). */
export async function fetchKitchenOrders(
  shopId: string,
): Promise<ServiceResult<Order[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("shop_id", shopId)
      .eq("order_type", "dine_in")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return { success: true, data: ((data as Record<string, unknown>[]) ?? []).map(parseOrder) };
  } catch (err) {
    logError(err, { module: "dineInService.fetchKitchenOrders", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/** Today's dine-in stats for a shop (orders placed + revenue, minus cancelled). */
export async function fetchTodayDineStats(
  shopId: string,
): Promise<ServiceResult<{ orders: number; revenue: number }>> {
  const supabase = createClient();
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("orders")
      .select("total_amount, dine_status")
      .eq("shop_id", shopId)
      .eq("order_type", "dine_in")
      .gte("created_at", start.toISOString());
    if (error) throw error;
    const rows = (data as { total_amount: number; dine_status: string | null }[]) ?? [];
    const active = rows.filter((r) => r.dine_status !== "Cancelled");
    return {
      success: true,
      data: {
        orders: active.length,
        revenue: active.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0),
      },
    };
  } catch (err) {
    logError(err, { module: "dineInService.fetchTodayDineStats", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/** Merchant advances a dine-in order (keeps legacy `status` in sync). */
export async function updateDineStatus(
  orderId: string,
  dineStatus: DineStatus,
): Promise<ServiceResult<Order>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("orders")
      .update({
        dine_status: dineStatus,
        status: dineStatusToLegacy(dineStatus),
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select()
      .single();
    if (error) throw error;
    return { success: true, data: parseOrder(data as Record<string, unknown>) };
  } catch (err) {
    logError(err, { module: "dineInService.updateDineStatus", meta: { orderId, dineStatus } });
    return { success: false, error: toError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Customer live tracker (anonymous-safe via SECURITY DEFINER RPC)            */
/* -------------------------------------------------------------------------- */

export interface DineTrackedOrder {
  id: string;
  shop_id: string;
  shop_name: string;
  table_code: string;
  customer_name: string;
  items_json: OrderItem[];
  total_amount: number;
  order_type: Order["order_type"];
  dine_status: DineStatus | null;
  status: Order["status"];
  created_at: string;
  updated_at: string | null;
}

/** Read the live state of a dine-in order using the table token as proof. */
export async function trackDineOrder(
  orderId: string,
  tableToken: string,
): Promise<ServiceResult<DineTrackedOrder | null>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase.rpc("track_dine_order", {
      p_order_id: orderId,
      p_table_token: tableToken.trim(),
    });
    if (error) throw error;
    const row = (data as Record<string, unknown>[] | null)?.[0];
    if (!row) return { success: true, data: null };
    return {
      success: true,
      data: {
        id: String(row.id),
        shop_id: String(row.shop_id),
        shop_name: String(row.shop_name ?? ""),
        table_code: String(row.table_code ?? ""),
        customer_name: String(row.customer_name ?? ""),
        items_json: (row.items_json as OrderItem[]) ?? [],
        total_amount: Number(row.total_amount) || 0,
        order_type: (row.order_type as Order["order_type"]) ?? "dine_in",
        dine_status: (row.dine_status as DineStatus) ?? null,
        status: (row.status as Order["status"]) ?? "Pending",
        created_at: String(row.created_at ?? new Date().toISOString()),
        updated_at: row.updated_at ? String(row.updated_at) : null,
      },
    };
  } catch (err) {
    logError(err, { module: "dineInService.trackDineOrder", meta: { orderId } });
    return { success: false, error: toError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Merchant table management (client-side, RLS-scoped to owner)               */
/* -------------------------------------------------------------------------- */

export async function fetchTablesByShopId(
  shopId: string,
): Promise<ServiceResult<DineInTable[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("dine_in_tables")
      .select("*")
      .eq("shop_id", shopId)
      .order("name", { ascending: true });
    if (error) throw error;
    return { success: true, data: (data as DineInTable[]) ?? [] };
  } catch (err) {
    logError(err, { module: "dineInService.fetchTablesByShopId", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/** Create one or more tables in a single insert (bulk QR setup). */
export async function createTables(
  shopId: string,
  names: string[],
): Promise<ServiceResult<DineInTable[]>> {
  const supabase = createClient();
  const clean = names
    .map((n) => n.trim().slice(0, 40))
    .filter((n) => n.length > 0);
  if (clean.length === 0) return { success: false, error: "Enter at least one table name." };

  const rows = clean.map((name) => ({
    shop_id: shopId,
    name,
    qr_token: generateQrToken(),
  }));
  try {
    const { data, error } = await supabase
      .from("dine_in_tables")
      .insert(rows)
      .select();
    if (error) throw error;
    return { success: true, data: (data as DineInTable[]) ?? [] };
  } catch (err) {
    logError(err, { module: "dineInService.createTables", meta: { shopId, count: clean.length } });
    return { success: false, error: toError(err) };
  }
}

export async function setTableActive(
  tableId: string,
  isActive: boolean,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("dine_in_tables")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", tableId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "dineInService.setTableActive", meta: { tableId } });
    return { success: false, error: toError(err) };
  }
}

export async function deleteTable(tableId: string): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase.from("dine_in_tables").delete().eq("id", tableId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "dineInService.deleteTable", meta: { tableId } });
    return { success: false, error: toError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Token helpers                                                              */
/* -------------------------------------------------------------------------- */

/** 24-char URL-safe token; 128 bits of entropy via crypto.getRandomValues. */
export function generateQrToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    let s = "";
    for (const b of bytes) s += b.toString(36).padStart(2, "0");
    return s.slice(0, 24);
  }
  // Fallback (older browsers) — still unique enough for a table token.
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

/** Normalize a Pakistani mobile number to digits (0300… / 92300… both work). */
export function normalizeDinePhone(phone?: string): string {
  if (!phone?.trim()) return "";
  return normalizePkPhoneDigits(phone.trim()) || phone.replace(/\D/g, "");
}
