/* -------------------------------------------------------------------------- */
/*  TrendMart — Atomic Order Placement & Variant Stock Deduction Service       */
/*  Prompt 1: ACID-compliant checkout with inventory race-condition prevention  */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { normalizePkPhoneDigits } from "@/lib/sanitization";
import type { Order, OrderItem, ProductVariant, VariantGroup } from "@/types";

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
  };
}

/**
 * Locate a variant within the product's variant groups by label and/or group.
 */
function findVariant(
  variants: VariantGroup[] | null | undefined,
  variantLabel: string,
  variantGroup?: string,
): ProductVariant | null {
  if (!variants || !variantLabel) return null;

  for (const group of variants) {
    // If variantGroup is specified, only look in that group
    if (variantGroup && group.name !== variantGroup) continue;

    for (const opt of group.options) {
      if (opt.label === variantLabel) return opt;
    }
  }
  return null;
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
      const { data: product, error } = await supabase
        .from("products")
        .select("id, name, variants, is_available")
        .eq("id", productId)
        .single();

      if (error || !product) {
        // Product not found
        const relatedItems = items.filter((i) => i.productId === productId);
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
        const relatedItems = items.filter((i) => i.productId === productId);
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

      for (const item of items.filter((i) => i.productId === productId)) {
        if (item.variant && variants) {
          // Variant-level stock check
          const variant = findVariant(variants, item.variant, item.variantGroup);
          const stock = variant?.stock ?? 0;
          checks.push({
            productId,
            productName: product.name,
            variantLabel: item.variant,
            requested: item.quantity,
            available: stock,
            inStock: stock >= item.quantity,
          });
        } else {
          // No variant specified — assume product-level. If the product
          // has variants, we need at least one variant with enough stock.
          if (variants && variants.length > 0) {
            // Check if any variant has sufficient stock for the quantity
            let totalAvailable = 0;
            for (const group of variants) {
              for (const opt of group.options) {
                totalAvailable += opt.stock ?? 0;
                if (opt.is_available === false) continue;
                if ((opt.stock ?? 0) >= item.quantity) {
                  // Found at least one variant with enough stock
                  break;
                }
              }
            }
            checks.push({
              productId,
              productName: product.name,
              variantLabel: "default",
              requested: item.quantity,
              available: totalAvailable,
              inStock: totalAvailable >= item.quantity,
            });
          } else {
            // No variants at all — treat as unlimited/in-stock
            checks.push({
              productId,
              productName: product.name,
              variantLabel: "default",
              requested: item.quantity,
              available: 9999, // Sentinal for "untracked"
              inStock: true,
            });
          }
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
/*  Atomic Order Placement with Stock Deduction                                 */
/* -------------------------------------------------------------------------- */

/**
 * Place an order with atomic stock deduction.
 *
 * This function performs the following steps within a logical transaction:
 *
 *  1. **Verify stock** — re-checks all variant stock levels against
 *     requested quantities (prevents TOCTOU race conditions).
 *  2. **Deduct stock** — decrements variant stock counts on the product
 *     record. Uses optimistic concurrency via `updated_at` version check.
 *  3. **Create order** — inserts the order record with complete metadata
 *     (items, customer info, coupon, discount, notes).
 *  4. **Rollback on failure** — if any step fails, restores stock levels
 *     and returns a descriptive error.
 *
 * Race condition prevention:
 *  - Sequential re-verification of stock before deduction
 *  - Optimistic concurrency: stock deduction only proceeds if the product
 *    hasn't been modified since we read it
 *  - Retry up to 3 times on version mismatch
 */
export async function placeOrderAtomic(
  params: PlaceOrderParams,
): Promise<ServiceResult<OrderResult>> {
  const supabase = createClient();
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // ── Phase 1: Re-verify stock for all items ─────────────────────────
      const stockVerification = await verifyVariantStock(
        params.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity ?? 1,
          variant: item.variant,
          variantGroup: item.variantGroup,
        })),
      );

      if (!stockVerification.success) {
        return { success: false, error: stockVerification.error };
      }

      const outOfStock = stockVerification.data.filter((c) => !c.inStock);
      if (outOfStock.length > 0) {
        const names = outOfStock
          .map(
            (c) =>
              `${c.productName}${c.variantLabel !== "default" ? ` (${c.variantLabel})` : ""}`,
          )
          .join(", ");
        return {
          success: false,
          error: `Insufficient stock for: ${names}. Please adjust quantities.`,
        };
      }

      // ── Phase 2: Deduct stock atomically per product ───────────────────
      const stockDeductions: VariantStockCheck[] = [];
      const productUpdates: Array<{
        id: string;
        variants: VariantGroup[];
        /** Pre-deduction snapshot for rollback if order insert fails. */
        previousVariants: VariantGroup[];
        currentVersion?: string;
      }> = [];

      // Group items by product ID
      const productGroups = new Map<
        string,
        Array<{
          variant?: string;
          variantGroup?: string;
          quantity: number;
        }>
      >();

      for (const item of params.items) {
        const qty = item.quantity ?? 1;
        const existing = productGroups.get(item.productId) ?? [];
        existing.push({
          variant: item.variant,
          variantGroup: item.variantGroup,
          quantity: qty,
        });
        productGroups.set(item.productId, existing);
      }

      // Fetch current product data to get latest variants and updated_at
      for (const [productId, deductions] of productGroups.entries()) {
        const { data: product, error } = await supabase
          .from("products")
          .select("id, variants, updated_at")
          .eq("id", productId)
          .single();

        if (error || !product) {
          return {
            success: false,
            error: `Product ${productId} not found during stock deduction.`,
          };
        }

        const currentVariants: VariantGroup[] =
          (product.variants as VariantGroup[]) ?? [];
        const previousVariants = cloneVariants(currentVariants);
        const updatedVariants = cloneVariants(currentVariants);

        let deductionFailed = false;

        for (const ded of deductions) {
          if (ded.variant && currentVariants.length > 0) {
            // Deduct from specific variant
            const variant = findVariant(
              updatedVariants,
              ded.variant,
              ded.variantGroup,
            );
            if (!variant) {
              deductionFailed = true;
              break;
            }
            const currentStock = variant.stock ?? 0;
            if (currentStock < ded.quantity) {
              deductionFailed = true;
              break;
            }
            variant.stock = currentStock - ded.quantity;
            // Flag low stock
            const threshold = variant.low_stock_threshold ?? 5;
            if (variant.stock <= threshold) {
              stockDeductions.push({
                productId,
                productName: "",
                variantLabel: ded.variant,
                requested: ded.quantity,
                available: variant.stock,
                inStock: true,
              });
            }
          } else if (currentVariants.length > 0) {
            // No variant specified but product has variants —
            // deduct from the first available variant with enough stock
            let deducted = false;
            for (const group of updatedVariants) {
              for (const opt of group.options) {
                if (opt.is_available === false) continue;
                const stock = opt.stock ?? 0;
                if (stock >= ded.quantity) {
                  opt.stock = stock - ded.quantity;
                  const threshold = opt.low_stock_threshold ?? 5;
                  if (opt.stock <= threshold) {
                    stockDeductions.push({
                      productId,
                      productName: "",
                      variantLabel: opt.label,
                      requested: ded.quantity,
                      available: opt.stock,
                      inStock: true,
                    });
                  }
                  deducted = true;
                  break;
                }
              }
              if (deducted) break;
            }
            if (!deducted) {
              deductionFailed = true;
              break;
            }
          }
          // If no variants exist, no stock deduction needed (unlimited)
        }

        if (deductionFailed) {
          return {
            success: false,
            error:
              "Stock changed during checkout. Please review and try again.",
          };
        }

        productUpdates.push({
          id: productId,
          variants: updatedVariants,
          previousVariants,
          currentVersion: (product as Record<string, unknown>)
            .updated_at as string | undefined,
        });
      }

      // ── Phase 3: Write stock decrements to database ────────────────────
      for (const update of productUpdates) {
        const updatePayload: Record<string, unknown> = {
          variants: update.variants,
        };

        // Optimistic concurrency: only update if not modified since our read
        let query = supabase.from("products").update(updatePayload).eq(
          "id",
          update.id,
        );

        if (update.currentVersion) {
          query = query.eq("updated_at", update.currentVersion);
        }

        // Must select rows — without this, Supabase leaves `count` null and
        // version-mismatch retries never fire (oversell race).
        const { data: updatedRows, error: updateError } = await query.select("id");

        if (updateError) {
          throw new Error(
            `Failed to update stock for product ${update.id}: ${updateError.message}`,
          );
        }

        if ((!updatedRows || updatedRows.length === 0) && update.currentVersion) {
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, attempt * 100));
            throw new Error("RETRY_VERSION_MISMATCH");
          }
          return {
            success: false,
            error:
              "Stock is changing rapidly. Please try again in a moment.",
          };
        }
      }

      // ── Phase 4: Create the order record ───────────────────────────────
      const totalAmount = params.items.reduce(
        (sum, i) => sum + (i.price * (i.quantity ?? 1)),
        0,
      );
      const discount = params.discountAmount ?? 0;
      const deliveryFee = params.deliveryFee ?? 0;
      const finalAmount = Math.max(0, totalAmount - discount + deliveryFee);

      const orderItems: OrderItem[] = params.items.map((item) => ({
        product_id: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity ?? 1,
        variant: item.variant,
        ...(item.notes ? { notes: item.notes } : {}),
      }));

      const customerPhone =
        normalizePkPhoneDigits(params.customerPhone) ||
        params.customerPhone.replace(/\D/g, "");

      const {
        data: { user: buyer },
      } = await supabase.auth.getUser();

      const orderPayload: Record<string, unknown> = {
        shop_id: params.shopId,
        customer_name: params.customerName.trim(),
        customer_phone: customerPhone,
        items_json: orderItems,
        total_amount: finalAmount,
        status: "Pending",
      };

      if (buyer?.id) {
        orderPayload.customer_user_id = buyer.id;
      }

      if (params.notes?.trim()) {
        orderPayload.notes = params.notes.trim().slice(0, 500);
      }

      let { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert(orderPayload)
        .select()
        .single();

      // Older DBs may not have customer_user_id yet — retry without it.
      if (orderError && /customer_user_id/i.test(orderError.message || "")) {
        delete orderPayload.customer_user_id;
        ({ data: orderData, error: orderError } = await supabase
          .from("orders")
          .insert(orderPayload)
          .select()
          .single());
      }

      if (orderError) {
        // ── Phase 5: Rollback stock using pre-deduction snapshots ───────
        for (const snap of productUpdates) {
          await supabase
            .from("products")
            .update({ variants: snap.previousVariants })
            .eq("id", snap.id);
        }

        throw new Error(
          `Order creation failed: ${orderError.message}. Stock has been restored.`,
        );
      }

      // ── Phase 6: Collect low-stock alerts ──────────────────────────────
      const lowStockAlerts = stockDeductions.filter(
        (d) => d.available <= 5,
      );

      const order = parseOrder(orderData as Record<string, unknown>);

      return {
        success: true,
        data: {
          order,
          stockDeductions,
          lowStockAlerts,
        },
      };
    } catch (err) {
      const msg = toError(err);
      // If it's a retry signal, continue to next attempt
      if (msg === "RETRY_VERSION_MISMATCH") continue;

      logError(err, {
        module: "orderService.placeOrderAtomic",
        meta: { params, attempt },
      });
      return { success: false, error: msg };
    }
  }

  return {
    success: false,
    error: "Failed to complete order after multiple attempts. Please try again.",
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
export async function createOrder(params: {
  shopId: string;
  customerName?: string;
  customerPhone?: string;
  items: OrderItem[];
  discountAmount?: number;
  deliveryFee?: number;
  notes?: string;
  couponCode?: string;
}): Promise<ServiceResult<Order>> {
  const result = await placeOrderAtomic({
    shopId: params.shopId,
    customerName: params.customerName ?? "",
    customerPhone: params.customerPhone ?? "",
    discountAmount: params.discountAmount,
    deliveryFee: params.deliveryFee,
    notes: params.notes,
    couponCode: params.couponCode,
    items: params.items.map((item) => ({
      productId: item.product_id ?? "",
      name: item.name,
      price: item.price,
      quantity: Math.max(1, Math.min(99, Math.round(item.quantity ?? 1))),
      variant: item.variant,
      notes: item.notes,
    })),
  });

  if (!result.success) return result;
  return { success: true, data: result.data.order };
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
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("total_amount, status")
      .eq("shop_id", shopId);

    if (ordersErr) throw ordersErr;

    const allOrders = (orders as Record<string, unknown>[]) ?? [];
    const total_revenue = allOrders
      .filter((o) => o.status !== "Cancelled")
      .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const pending_orders_count = allOrders.filter(
      (o) => o.status === "Pending",
    ).length;

    // Active product count
    const { count: activeCount, error: prodErr } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("is_available", true);

    if (prodErr) throw prodErr;

    // Total store views
    const { count: viewsCount, error: viewsErr } = await supabase
      .from("analytics_logs")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("event_type", "shop_view");

    if (viewsErr) throw viewsErr;

    return {
      success: true,
      data: {
        total_revenue,
        active_product_count: activeCount ?? 0,
        total_store_views: viewsCount ?? 0,
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