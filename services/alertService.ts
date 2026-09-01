/* -------------------------------------------------------------------------- */
/*  TrendsMart — Automated Low-Stock Alert & Notification Service               */
/*                                                                             */
/*  Continuously evaluates product inventory thresholds against active stock   */
/*  counts across all variants. Powers real-time notification badges in the    */
/*  merchant dashboard header.                                                 */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface AlertCounts {
  /** Number of unique product variants below or at threshold. */
  lowStock: number;
  /** Number of pending orders that require the merchant's attention. */
  pendingOrders: number;
  /** Number of unread / unresolved urgent customer inquiries. */
  urgentInquiries: number;
  /** Total alerts (sum of the three counts above). */
  total: number;
}

export interface LowStockItem {
  product_id: string;
  product_name: string;
  variant_label: string;
  variant_group: string;
  current_stock: number;
  low_stock_threshold: number;
  severity: "critical" | "warning"; // critical = 0 stock, warning = ≤ threshold
}

export type AlertFetchResult =
  | { success: true; data: AlertCounts }
  | { success: false; error: string };

export type LowStockListResult =
  | { success: true; data: LowStockItem[] }
  | { success: false; error: string };

/* -------------------------------------------------------------------------- */
/*  Internal Helpers                                                           */
/* -------------------------------------------------------------------------- */

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

interface InventoryVariantRow {
  id: string;
  product_id: string;
  variant_group: string;
  variant_label: string;
  stock: number;
  low_stock_threshold: number;
  is_available: boolean;
  products?: { name: string } | null;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fetch aggregated alert counts for a specific shop.
 *
 * Queries all three alert sources in parallel:
 *  1. inventory_variants — count rows where stock <= low_stock_threshold
 *  2. orders             — count where status = 'Pending'
 *  3. customer_inquiries — count where is_read = false OR is_urgent = true
 *
 * @param shopId The merchant's shop UUID.
 * @returns       Aggregated counts suitable for rendering dashboard badges.
 */
export async function fetchAlertCounts(
  shopId: string,
): Promise<AlertFetchResult> {
  const supabase = createClient();

  try {
    const [lowStockResult, pendingOrdersResult, inquiriesResult] =
      await Promise.all([
        // 1. Fetch all available inventory variants (stock comparison done client-side)
        supabase
          .from("inventory_variants")
          .select("id, stock, low_stock_threshold, is_available")
          .eq("shop_id", shopId),

        // 2. Pending orders
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", shopId)
          .eq("status", "Pending"),

        // 3. Urgent / unread customer inquiries
        supabase
          .from("customer_inquiries")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", shopId)
          .eq("is_read", false),
      ]);

    if (lowStockResult.error) throw lowStockResult.error;
    if (pendingOrdersResult.error) throw pendingOrdersResult.error;
    if (inquiriesResult.error) throw inquiriesResult.error;

    // Client-side filtering for low-stock: stock <= threshold AND is_available AND stock >= 0
    const variants = (lowStockResult.data ?? []) as {
      stock: number;
      low_stock_threshold: number;
      is_available: boolean;
    }[];
    const lowStock = variants.filter(
      (v) =>
        v.is_available &&
        v.stock >= 0 &&
        v.stock <= v.low_stock_threshold,
    ).length;

    const pendingOrders = pendingOrdersResult.count ?? 0;
    const urgentInquiries = inquiriesResult.count ?? 0;

    const data: AlertCounts = {
      lowStock,
      pendingOrders,
      urgentInquiries,
      total: lowStock + pendingOrders + urgentInquiries,
    };

    return { success: true, data };
  } catch (err) {
    logError(err, {
      module: "alertService.fetchAlertCounts",
      meta: { shopId },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Fetch the detailed list of low-stock items for a shop.
 *
 * Each item includes product name, variant label, current stock,
 * threshold, and severity (critical = 0 stock, warning = ≤ threshold).
 *
 * @param shopId           The merchant's shop UUID.
 * @param severityFilter   Optional — return only "critical" or "warning" items.
 * @returns                 Sorted: critical first, then by stock ascending.
 */
export async function fetchLowStockItems(
  shopId: string,
  severityFilter?: "critical" | "warning",
): Promise<LowStockListResult> {
  const supabase = createClient();

  try {
    // Fetch all available variants with their associated product name (inner join)
    const { data, error } = await supabase
      .from("inventory_variants")
      .select(
        `id, product_id, variant_group, variant_label, stock, low_stock_threshold, is_available, products!inner(name)`,
      )
      .eq("shop_id", shopId)
      .order("stock", { ascending: true })
      .limit(200);

    if (error) throw error;

    const rows = (data ?? []) as unknown as InventoryVariantRow[];

    // Client-side filtering: stock <= threshold, available, stock >= 0
    let filtered = rows.filter(
      (v) =>
        v.is_available &&
        v.stock >= 0 &&
        v.stock <= v.low_stock_threshold,
    );

    if (severityFilter === "critical") {
      filtered = filtered.filter((v) => v.stock === 0);
    } else if (severityFilter === "warning") {
      filtered = filtered.filter((v) => v.stock > 0);
    }

    const items: LowStockItem[] = filtered.map((row) => ({
      product_id: row.product_id,
      product_name: row.products?.name ?? "Unknown",
      variant_label: row.variant_label,
      variant_group: row.variant_group,
      current_stock: row.stock,
      low_stock_threshold: row.low_stock_threshold,
      severity: row.stock === 0 ? "critical" : "warning",
    }));

    return { success: true, data: items };
  } catch (err) {
    logError(err, {
      module: "alertService.fetchLowStockItems",
      meta: { shopId, severityFilter },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Build a human-readable summary string for alert badges
 * (e.g. "3 low stock, 5 pending").
 */
export function formatAlertSummary(counts: AlertCounts): string {
  const parts: string[] = [];
  if (counts.lowStock > 0) parts.push(`${counts.lowStock} low stock`);
  if (counts.pendingOrders > 0) parts.push(`${counts.pendingOrders} pending`);
  if (counts.urgentInquiries > 0)
    parts.push(`${counts.urgentInquiries} inquiries`);
  return parts.length > 0 ? parts.join(", ") : "No alerts";
}

/**
 * Subscribe to real-time inventory / order / inquiry changes for a shop.
 *
 * Uses Supabase Realtime (WebSocket) to push updated AlertCounts whenever
 * any variant, order, or inquiry row changes for the specified shop.
 *
 * @param shopId    The merchant's shop UUID.
 * @param onUpdate  Callback invoked with fresh alert counts after each change.
 * @returns         A cleanup function that unsubscribes the channel.
 */
export function subscribeToAlerts(
  shopId: string,
  onUpdate: (counts: AlertCounts) => void,
): () => void {
  const supabase = createClient();

  const channel = supabase
    .channel(`alerts:${shopId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "inventory_variants",
        filter: `shop_id=eq.${shopId}`,
      },
      async () => {
        const result = await fetchAlertCounts(shopId);
        if (result.success) onUpdate(result.data);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `shop_id=eq.${shopId}`,
      },
      async () => {
        const result = await fetchAlertCounts(shopId);
        if (result.success) onUpdate(result.data);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "customer_inquiries",
        filter: `shop_id=eq.${shopId}`,
      },
      async () => {
        const result = await fetchAlertCounts(shopId);
        if (result.success) onUpdate(result.data);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}