/* -------------------------------------------------------------------------- */
/*  TrendsMart — Atomic Order Placement & Variant Stock Deduction Service       */
/*  Prompt 1: ACID-compliant checkout with inventory race-condition prevention  */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { normalizePkPhoneDigits } from "@/lib/sanitization";
import type { Order, OrderItem, OrderType, ProductVariant, VariantGroup } from "@/types";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface VariantStockCheck {
  productId: string;
  productName: string;
  variantLabel: string;
  requested: number;
  available: number;
  inStock: boolean;
}

export interface PlaceOrderParams {
  shopId: string;
  customerName: string;
  customerPhone: string;
  items: Array<{
    productId: string;
    name: string;
    /** Base price per unit in PKR. */
    price: number;
    /** Quantity ordered (default 1). */
    quantity?: number;
    /** Variant label (e.g. "Size: M", "Color: Red"). */
    variant?: string;
    /** Group name (e.g. "Size", "Color") — used for stock lookup. */
    variantGroup?: string;
    /** Per-item special instructions. */
    notes?: string;
  }>;
  /** Optional coupon code applied (for metadata logging). */
  couponCode?: string;
  /** Discount amount applied in PKR. */
  discountAmount?: number;
  /** Delivery fee applied in PKR (0 = free). */
  deliveryFee?: number;
  /** Customer delivery notes. */
  notes?: string;
  /** Optional customer GPS for radius enforcement. */
  customerLat?: number | null;
  customerLng?: number | null;
}

export interface OrderResult {
  order: Order;
  /** Variant stock snapshots after deduction (for verification). */
  stockDeductions: VariantStockCheck[];
  /** Whether any variant went to low-stock after this order. */
  lowStockAlerts: VariantStockCheck[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parse orders from Supabase, normalising `items_json` to OrderItem[].
 */
function parseOrder(row: Record<string, unknown>): Order {
  let items: OrderItem[] = [];
  try {
    items = Array.isArray(row.items_json)
      ? (row.items_json as OrderItem[])
      : [];
  } catch {
    items = [];
  }
  const orderTypeRaw = String(row.order_type ?? "delivery");
  const orderType =
    orderTypeRaw === "pickup" || orderTypeRaw === "dine_in"
      ? (orderTypeRaw as OrderType)
      : "delivery";
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
    order_type: orderType,
    subtotal_amount:
      row.subtotal_amount == null ? undefined : Number(row.subtotal_amount) || 0,
    delivery_fee: row.delivery_fee == null ? undefined : Number(row.delivery_fee) || 0,
    discount_amount:
      row.discount_amount == null ? undefined : Number(row.discount_amount) || 0,
    coupon_code:
      typeof row.coupon_code === "string" && row.coupon_code.trim()
        ? row.coupon_code.trim()
        : undefined,
    customer_user_id:
      typeof row.customer_user_id === "string" ? row.customer_user_id : null,
    whatsapp_sent_at:
      typeof row.whatsapp_sent_at === "string" ? row.whatsapp_sent_at : null,
    whatsapp_message:
      typeof row.whatsapp_message === "string" && row.whatsapp_message.trim()
        ? row.whatsapp_message.trim()
        : null,
    customer_lat: toFiniteOrNull(row.customer_lat),
    customer_lng: toFiniteOrNull(row.customer_lng),
    customer_location_accuracy_m: toFiniteOrNull(row.customer_location_accuracy_m),
    customer_location_source:
      row.customer_location_source === "gps" || row.customer_location_source === "pin"
        ? row.customer_location_source
        : null,
    customer_city:
      typeof row.customer_city === "string" && row.customer_city.trim()
        ? row.customer_city.trim()
        : null,
    customer_area:
      typeof row.customer_area === "string" && row.customer_area.trim()
        ? row.customer_area.trim()
        : null,
  };
}

function toFiniteOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** True when merchant set an explicit numeric stock (null/undefined = untracked). */
function isTrackedStock(stock: unknown): stock is number {
  return typeof stock === "number" && Number.isFinite(stock) && stock >= 0;
}

/**
 * Cart UI stores labels like "Size: M · Color: Red". Split into selections.
 */
function parseVariantSelections(
  variantLabel: string,
): Array<{ group?: string; label: string }> {
  return variantLabel
    .split(/\s*·\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx > 0) {
        return {
          group: part.slice(0, idx).trim(),
          label: part.slice(idx + 1).trim(),
        };
      }
      return { label: part };
    });
}

/**
 * Locate a variant within the product's variant groups by label and/or group.
 * Accepts plain labels ("M") and "Group: Label" forms from the cart.
 */
function findVariant(
  variants: VariantGroup[] | null | undefined,
  variantLabel: string,
  variantGroup?: string,
): ProductVariant | null {
  if (!variants || !variantLabel) return null;

  for (const group of variants) {
    if (variantGroup && group.name !== variantGroup) continue;

    for (const opt of group.options) {
      if (opt.label === variantLabel) return opt;
      if (`${group.name}: ${opt.label}` === variantLabel) return opt;
    }
  }
  return null;
}

/** Resolve every option referenced by a cart variant string. */
function resolveVariantsForItem(
  variants: VariantGroup[] | null | undefined,
  variantLabel?: string,
  variantGroup?: string,
): ProductVariant[] {
  if (!variants?.length || !variantLabel) return [];

  const found: ProductVariant[] = [];
  for (const sel of parseVariantSelections(variantLabel)) {
    const match = findVariant(variants, sel.label, sel.group ?? variantGroup);
    if (match) found.push(match);
  }

  if (found.length === 0) {
    const whole = findVariant(variants, variantLabel, variantGroup);
    if (whole) found.push(whole);
  }
  return found;
}

/**
 * Deep clone variant groups for safe mutation.
 */
function cloneVariants(variants: VariantGroup[]): VariantGroup[] {
  return JSON.parse(JSON.stringify(variants));
}

/* -------------------------------------------------------------------------- */
/*  Stock Verification                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Verify stock availability for a list of items with specific variants.
 * Returns detailed stock check results for each requested variant.
 * This is the first phase of the atomic checkout — it reads current stock
 * levels WITHOUT reserving them, so the subsequent deduction phase must
 * re-verify before writing.
 */
export async function verifyVariantStock(
  items: Array<{
    productId: string;
    quantity: number;
    variant?: string;
    variantGroup?: string;
  }>,
): Promise<ServiceResult<VariantStockCheck[]>> {
  const supabase = createClient();
  const checks: VariantStockCheck[] = [];

  // Group by product ID to minimize queries
  const productIds = [...new Set(items.map((i) => i.productId))];

  try {
    for (const productId of productIds) {
      const relatedItems = items.filter((i) => i.productId === productId);

      // Legacy / incomplete cart lines without a product id — don't block WhatsApp orders.
      if (!productId) {
        for (const item of relatedItems) {
          checks.push({
            productId: "",
            productName: "Item",
            variantLabel: item.variant ?? "default",
            requested: item.quantity,
            available: 9999,
            inStock: true,
          });
        }
        continue;
      }

      const { data: product, error } = await supabase
        .from("products")
        .select("id, name, variants, is_available")
        .eq("id", productId)
        .single();

      if (error || !product) {
        for (const item of relatedItems) {
          checks.push({
            productId,
            productName: "Unknown",
            variantLabel: item.variant ?? "default",
            requested: item.quantity,
            available: 0,
            inStock: false,
          });
        }
        continue;
      }

      if (!product.is_available) {
        for (const item of relatedItems) {
          checks.push({
            productId,
            productName: product.name,
            variantLabel: item.variant ?? "default",
            requested: item.quantity,
            available: 0,
            inStock: false,
          });
        }
        continue;
      }

      const variants: VariantGroup[] | null =
        (product.variants as VariantGroup[]) ?? null;

      for (const item of relatedItems) {
        if (item.variant && variants?.length) {
          const matched = resolveVariantsForItem(
            variants,
            item.variant,
            item.variantGroup,
          );

          // Display-only label that didn't map — allow checkout (WhatsApp flow).
          if (matched.length === 0) {
            checks.push({
              productId,
              productName: product.name,
              variantLabel: item.variant,
              requested: item.quantity,
              available: 9999,
              inStock: true,
            });
            continue;
          }

          const tracked = matched.filter((v) => isTrackedStock(v.stock));
          if (tracked.length === 0) {
            checks.push({
              productId,
              productName: product.name,
              variantLabel: item.variant,
              requested: item.quantity,
              available: 9999,
              inStock: true,
            });
            continue;
          }

          const unavailable = tracked.some((v) => v.is_available === false);
          const available = Math.min(...tracked.map((v) => v.stock as number));
          checks.push({
            productId,
            productName: product.name,
            variantLabel: item.variant,
            requested: item.quantity,
            available: unavailable ? 0 : available,
            inStock: !unavailable && available >= item.quantity,
          });
        } else if (variants && variants.length > 0) {
          // No variant on cart line — only enforce when some options track stock.
          let trackedTotal = 0;
          let hasTracked = false;
          let hasEnoughTracked = false;
          for (const group of variants) {
            for (const opt of group.options) {
              if (opt.is_available === false) continue;
              if (!isTrackedStock(opt.stock)) continue;
              hasTracked = true;
              trackedTotal += opt.stock;
              if (opt.stock >= item.quantity) hasEnoughTracked = true;
            }
          }
          checks.push({
            productId,
            productName: product.name,
            variantLabel: "default",
            requested: item.quantity,
            available: hasTracked ? trackedTotal : 9999,
            inStock: !hasTracked || hasEnoughTracked || trackedTotal >= item.quantity,
          });
        } else {
          checks.push({
            productId,
            productName: product.name,
            variantLabel: "default",
            requested: item.quantity,
            available: 9999,
            inStock: true,
          });
        }
      }
    }

    return { success: true, data: checks };
  } catch (err) {
    logError(err, {
      module: "orderService.verifyVariantStock",
      meta: { items },
    });
    return { success: false, error: toError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Atomic Order Placement (server-authoritative)                               */
/* -------------------------------------------------------------------------- */

/**
 * Place an order with stock deduction via POST /api/orders.
 *
 * SECURITY: Client-side inserts into `orders` are disabled. This wrapper
 * keeps any legacy callers on the secure server path (re-priced totals,
 * service-role insert, email verification gate).
 */
export async function placeOrderAtomic(
  params: PlaceOrderParams,
): Promise<ServiceResult<OrderResult>> {
  const result = await placeOrderOnServer({
    shopId: params.shopId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    couponCode: params.couponCode,
    notes: params.notes,
    customerLat: params.customerLat,
    customerLng: params.customerLng,
    items: params.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: Math.max(1, Math.min(99, Math.round(item.quantity ?? 1))),
      variant: item.variant,
      notes: item.notes,
    })),
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      order: result.data,
      stockDeductions: [],
      lowStockAlerts: [],
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Backward-Compatible Convenience Wrappers                                   */
/* -------------------------------------------------------------------------- */

/**
 * Create an order from a WhatsApp product click.
 * Accepts an array of line items to support multi-item orders.
 * Pass **unit** price + quantity (do not pre-multiply line totals).
 */
/**
 * Place an order through the server-side /api/orders endpoint.
 *
 * The server re-reads authoritative prices, validates shop rules and stock,
 * and deducts stock via the service-role client — the client never inserts
 * order rows directly and never supplies the trusted total.
 */
async function placeOrderOnServer(params: {
  shopId: string;
  customerName: string;
  customerPhone: string;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    variant?: string;
    notes?: string;
  }>;
  couponCode?: string;
  notes?: string;
  orderType?: "delivery" | "pickup";
  customerLat?: number | null;
  customerLng?: number | null;
  customerLocationAccuracyM?: number | null;
  customerLocationSource?: string | null;
  customerCity?: string | null;
  customerArea?: string | null;
  idempotencyKey?: string | null;
}): Promise<ServiceResult<Order>> {
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      order?: Order;
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

export async function createOrder(params: {
  shopId: string;
  customerName?: string;
  customerPhone?: string;
  items: OrderItem[];
  discountAmount?: number;
  deliveryFee?: number;
  notes?: string;
  couponCode?: string;
  orderType?: "delivery" | "pickup";
  customerLat?: number | null;
  customerLng?: number | null;
  customerLocationAccuracyM?: number | null;
  customerLocationSource?: string | null;
  customerCity?: string | null;
  customerArea?: string | null;
  idempotencyKey?: string | null;
}): Promise<ServiceResult<Order>> {
  return placeOrderOnServer({
    shopId: params.shopId,
    customerName: params.customerName ?? "",
    customerPhone: params.customerPhone ?? "",
    couponCode: params.couponCode,
    notes: params.notes,
    orderType: params.orderType,
    customerLat: params.customerLat,
    customerLng: params.customerLng,
    customerLocationAccuracyM: params.customerLocationAccuracyM,
    customerLocationSource: params.customerLocationSource,
    customerCity: params.customerCity,
    customerArea: params.customerArea,
    idempotencyKey: params.idempotencyKey,
    items: params.items.map((item) => ({
      productId: item.product_id ?? "",
      name: item.name,
      price: item.price,
      quantity: Math.max(1, Math.min(99, Math.round(item.quantity ?? 1))),
      variant: item.variant,
      notes: item.notes,
    })),
  });
}

/**
 * Convenience: create a single-item order (for backward compatibility).
 */
export async function createSingleItemOrder(
  shopId: string,
  productName: string,
  price: number,
  productId?: string,
  variant?: string,
): Promise<ServiceResult<Order>> {
  return createOrder({
    shopId,
    items: [
      {
        product_id: productId,
        name: productName,
        price,
        ...(variant ? { variant } : {}),
      },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*  Queries                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Fetch all orders for a specific shop (merchant dashboard).
 */
export async function fetchOrdersByShopId(
  shopId: string,
): Promise<ServiceResult<Order[]>> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    const orders = ((data as Record<string, unknown>[]) ?? []).map(parseOrder);
    return { success: true, data: orders };
  } catch (err) {
    logError(err, {
      module: "orderService.fetchOrdersByShopId",
      meta: { shopId },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Fetch orders by customer phone number (customer tracking page).
 *
 * NOTE: Calls the `track_orders_by_phone` SECURITY DEFINER RPC instead of
 * selecting from `orders` directly. Direct anonymous reads of the orders
 * table are blocked by RLS (it holds customer PII) — the RPC only ever
 * returns rows matching the exact phone the caller supplies.
 */
export async function fetchOrdersByPhone(
  phone: string,
): Promise<ServiceResult<Order[]>> {
  const supabase = createClient();

  try {
    const cleaned =
      normalizePkPhoneDigits(phone) || phone.replace(/\D/g, "");
    const { data, error } = await supabase.rpc("track_orders_by_phone", {
      p_phone: cleaned,
    });

    if (error) throw error;
    const orders = ((data as Record<string, unknown>[]) ?? []).map(parseOrder);
    return { success: true, data: orders };
  } catch (err) {
    logError(err, {
      module: "orderService.fetchOrdersByPhone",
      meta: { phone },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Fetch orders for the signed-in customer (`customer_user_id = auth.uid()`).
 * Relies on RLS `orders_customer_select` — no phone entry required.
 */
export async function fetchOrdersForCurrentUser(): Promise<ServiceResult<Order[]>> {
  const supabase = createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Please sign in to see your orders." };
    }

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    const orders = ((data as Record<string, unknown>[]) ?? []).map(parseOrder);
    return { success: true, data: orders };
  } catch (err) {
    logError(err, { module: "orderService.fetchOrdersForCurrentUser" });
    return { success: false, error: toError(err) };
  }
}

/**
 * Update order status (merchant action).
 */
export async function updateOrderStatus(
  orderId: string,
  status: string,
): Promise<ServiceResult<Order>> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    const parsed = parseOrder(data as Record<string, unknown>);
    // Best-effort OS / web push (never blocks merchant UI).
    void fetch("/api/push/notify-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        status,
        shopId: parsed.shop_id,
        event: "status",
      }),
    }).catch(() => undefined);

    return {
      success: true,
      data: parsed,
    };
  } catch (err) {
    logError(err, {
      module: "orderService.updateOrderStatus",
      meta: { orderId, status },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Fetch merchant analytics: total revenue, active products, store views, pending orders.
 */
export async function fetchMerchantAnalytics(shopId: string): Promise<
  ServiceResult<{
    total_revenue: number;
    active_product_count: number;
    total_store_views: number;
    pending_orders_count: number;
  }>
> {
  const supabase = createClient();

  try {
    // Fetch orders for revenue + pending count
    const ordersQuery = supabase
      .from("orders")
      .select("total_amount, status")
      .eq("shop_id", shopId);

    // Active product count
    const prodQuery = supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("is_available", true);

    // Total store views
    const viewsQuery = supabase
      .from("analytics_logs")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("event_type", "shop_view");

    // Run the three independent reads in parallel (one round-trip latency
    // instead of three sequential waits).
    const [ordersRes, prodRes, viewsRes] = await Promise.all([
      ordersQuery,
      prodQuery,
      viewsQuery,
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (prodRes.error) throw prodRes.error;
    if (viewsRes.error) throw viewsRes.error;

    const allOrders = (ordersRes.data as Record<string, unknown>[]) ?? [];
    const total_revenue = allOrders
      .filter((o) => o.status !== "Cancelled")
      .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const pending_orders_count = allOrders.filter(
      (o) => o.status === "Pending",
    ).length;

    return {
      success: true,
      data: {
        total_revenue,
        active_product_count: prodRes.count ?? 0,
        total_store_views: viewsRes.count ?? 0,
        pending_orders_count,
      },
    };
  } catch (err) {
    logError(err, {
      module: "orderService.fetchMerchantAnalytics",
      meta: { shopId },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Get current variant stock for a product.
 * Returns detailed per-variant stock information.
 */
export async function getProductVariantStock(
  productId: string,
): Promise<
  ServiceResult<
    Array<{
      group: string;
      label: string;
      stock: number;
      lowStockThreshold: number;
      isAvailable: boolean;
      sku?: string;
    }>
  >
> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("products")
      .select("variants, name")
      .eq("id", productId)
      .single();

    if (error || !data) {
      return { success: false, error: "Product not found." };
    }

    const variants: VariantGroup[] = (data.variants as VariantGroup[]) ?? [];
    const result: Array<{
      group: string;
      label: string;
      stock: number;
      lowStockThreshold: number;
      isAvailable: boolean;
      sku?: string;
    }> = [];

    for (const group of variants) {
      for (const opt of group.options) {
        result.push({
          group: group.name,
          label: opt.label,
          stock: opt.stock ?? 0,
          lowStockThreshold: opt.low_stock_threshold ?? 5,
          isAvailable: opt.is_available ?? true,
          sku: opt.sku,
        });
      }
    }

    return { success: true, data: result };
  } catch (err) {
    logError(err, {
      module: "orderService.getProductVariantStock",
      meta: { productId },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Bulk update variant stock levels (used by merchant inventory manager).
 * Accepts an array of stock updates keyed by product ID and variant label.
 */
export async function bulkUpdateVariantStock(
  updates: Array<{
    productId: string;
    variantLabel: string;
    variantGroup: string;
    newStock: number;
  }>,
): Promise<ServiceResult<{ updated: number; failed: string[] }>> {
  const supabase = createClient();

  // Group updates by product
  const productMap = new Map<string, typeof updates>();
  for (const upd of updates) {
    const existing = productMap.get(upd.productId) ?? [];
    existing.push(upd);
    productMap.set(upd.productId, existing);
  }

  let updated = 0;
  const failed: string[] = [];

  for (const [productId, productUpdates] of productMap.entries()) {
    try {
      const { data: product } = await supabase
        .from("products")
        .select("variants")
        .eq("id", productId)
        .single();

      if (!product) {
        failed.push(productId);
        continue;
      }

      const variants: VariantGroup[] = cloneVariants(
        (product.variants as VariantGroup[]) ?? [],
      );

      for (const upd of productUpdates) {
        const variant = findVariant(variants, upd.variantLabel, upd.variantGroup);
        if (variant) {
          variant.stock = Math.max(0, upd.newStock);
        } else {
          // Variant not found — add to the appropriate group
          const group = variants.find((g) => g.name === upd.variantGroup);
          if (group) {
            group.options.push({
              label: upd.variantLabel,
              stock: Math.max(0, upd.newStock),
              is_available: true,
            });
          }
        }
      }

      const { error: updateErr } = await supabase
        .from("products")
        .update({ variants })
        .eq("id", productId);

      if (updateErr) {
        failed.push(productId);
      } else {
        updated++;
      }
    } catch {
      failed.push(productId);
    }
  }

  return { success: true, data: { updated, failed } };
}

/* -------------------------------------------------------------------------- */
/*  Customer order lifecycle (WhatsApp hand-off + cancel)                      */
/* -------------------------------------------------------------------------- */

/** Persist the WhatsApp payload and optionally mark it as sent. */
export async function updateOrderWhatsApp(
  orderId: string,
  opts: { message?: string; sent?: boolean },
): Promise<ServiceResult<{ whatsappSentAt: string | null; whatsappMessage: string | null }>> {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(opts.message !== undefined ? { message: opts.message } : {}),
        ...(opts.sent ? { sent: true } : {}),
      }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      whatsappSentAt?: string | null;
      whatsappMessage?: string | null;
    };
    if (!res.ok || !json.success) {
      return { success: false, error: json.error ?? "Could not update WhatsApp status." };
    }
    return {
      success: true,
      data: {
        whatsappSentAt: json.whatsappSentAt ?? null,
        whatsappMessage: json.whatsappMessage ?? null,
      },
    };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

/**
 * Merchant confirms the order actually arrived on WhatsApp (or phone).
 * Clears the "Confirm baaqi hai" gate so fulfilment can continue.
 */
export async function confirmOrderWhatsAppAsMerchant(
  orderId: string,
): Promise<ServiceResult<{ whatsappSentAt: string | null }>> {
  try {
    const res = await fetch(
      `/api/orders/${encodeURIComponent(orderId)}/confirm-whatsapp`,
      { method: "POST" },
    );
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      whatsappSentAt?: string | null;
    };
    if (!res.ok || !json.success) {
      return { success: false, error: json.error ?? "Could not confirm WhatsApp." };
    }
    return {
      success: true,
      data: { whatsappSentAt: json.whatsappSentAt ?? null },
    };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

/** Customer cancels a Pending order before the shop starts processing. */
export async function cancelOrderAsCustomer(
  orderId: string,
): Promise<ServiceResult<{ id: string; status: string }>> {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: "POST",
    });
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      order?: { id: string; status: string };
    };
    if (!res.ok || !json.success || !json.order) {
      return { success: false, error: json.error ?? "Could not cancel the order." };
    }
    return { success: true, data: json.order };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}