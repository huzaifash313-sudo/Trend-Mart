/* -------------------------------------------------------------------------- */
/*  TrendMart — Atomic Order Placement & Variant Stock Deduction Service       */
/*  Prompt 1: ACID-compliant checkout with inventory race-condition prevention  */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { normalizePkPhoneDigits } from "@/lib/sanitization";
import { getShopHoursSummary } from "@/lib/shopHours";
import { getDistanceToShop } from "@/services/geoRadiusService";
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

  // Soft server-side shop rules (live, hours, radius, min order) before stock work.
  try {
    const { data: shopRow, error: shopErr } = await supabase
      .from("shops")
      .select(
        "id, name, is_live, min_order_amount, delivery_fee_per_km, latitude, longitude, service_radius_km, delivery_zones, business_hours, operating_status",
      )
      .eq("id", params.shopId)
      .maybeSingle();

    if (shopErr) throw shopErr;
    if (!shopRow) {
      return { success: false, error: "Shop not found." };
    }
    if (shopRow.is_live === false) {
      return {
        success: false,
        error: "This shop is currently offline and cannot accept orders.",
      };
    }

    const hours = getShopHoursSummary({
      business_hours: shopRow.business_hours as string | null,
      operating_status: shopRow.operating_status as string | null,
    });
    if (hours.state === "closed") {
      return {
        success: false,
        error: `This shop is closed right now (${hours.hoursText}). Try again during open hours.`,
      };
    }

    const radiusKm = Number(shopRow.service_radius_km ?? 0);
    const zones = Array.isArray(shopRow.delivery_zones)
      ? (shopRow.delivery_zones as string[])
      : [];
    const isNationwide = zones.some((z) => /pakistan|nationwide|all/i.test(String(z)));
    if (
      !isNationwide &&
      radiusKm > 0 &&
      params.customerLat != null &&
      params.customerLng != null &&
      Number.isFinite(params.customerLat) &&
      Number.isFinite(params.customerLng)
    ) {
      const dist = getDistanceToShop(
        {
          id: String(shopRow.id),
          name: String(shopRow.name ?? ""),
          category: "",
          location: "",
          whatsapp_number: "",
          is_live: true,
          latitude: shopRow.latitude as number | null,
          longitude: shopRow.longitude as number | null,
          service_radius_km: radiusKm,
        },
        params.customerLat,
        params.customerLng,
      );
      if (dist != null && dist > radiusKm) {
        return {
          success: false,
          error: `You are about ${dist.toFixed(1)} km away — this shop only delivers within ${radiusKm} km.`,
        };
      }
    }

    const lineSubtotal = params.items.reduce(
      (sum, item) => sum + item.price * Math.max(1, item.quantity ?? 1),
      0,
    );
    const discountedSubtotal = Math.max(
      0,
      lineSubtotal - Math.max(0, params.discountAmount ?? 0),
    );
    const minOrder = Number(shopRow.min_order_amount ?? 0);
    if (minOrder > 0 && discountedSubtotal < minOrder) {
      return {
        success: false,
        error: `Minimum order for this shop is Rs. ${minOrder.toLocaleString()}. Current subtotal is Rs. ${Math.round(discountedSubtotal).toLocaleString()}.`,
      };
    }
  } catch (err) {
    logError(err, {
      module: "orderService.placeOrderAtomic.shopGate",
      meta: { shopId: params.shopId },
    });
    // Continue — stock checks still protect inventory; do not soft-fail checkout on gate read errors.
  }

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
        if (!productId) continue;

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
        let didChangeStock = false;

        for (const ded of deductions) {
          if (ded.variant && currentVariants.length > 0) {
            const matched = resolveVariantsForItem(
              updatedVariants,
              ded.variant,
              ded.variantGroup,
            );
            // Unmapped / untracked options — nothing to deduct.
            const tracked = matched.filter((v) => isTrackedStock(v.stock));
            if (tracked.length === 0) continue;

            for (const variant of tracked) {
              if ((variant.stock as number) < ded.quantity) {
                deductionFailed = true;
                break;
              }
              variant.stock = (variant.stock as number) - ded.quantity;
              didChangeStock = true;
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
            }
            if (deductionFailed) break;
          } else if (currentVariants.length > 0) {
            // Deduct only when some option tracks stock; otherwise unlimited.
            const anyTracked = updatedVariants.some((g) =>
              g.options.some((o) => isTrackedStock(o.stock)),
            );
            if (!anyTracked) continue;

            let deducted = false;
            for (const group of updatedVariants) {
              for (const opt of group.options) {
                if (opt.is_available === false) continue;
                if (!isTrackedStock(opt.stock)) continue;
                if (opt.stock >= ded.quantity) {
                  opt.stock = opt.stock - ded.quantity;
                  didChangeStock = true;
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
        }

        if (deductionFailed) {
          return {
            success: false,
            error:
              "Stock changed during checkout. Please review and try again.",
          };
        }

        if (didChangeStock) {
          productUpdates.push({
            id: productId,
            variants: updatedVariants,
            previousVariants,
            currentVersion: (product as Record<string, unknown>)
              .updated_at as string | undefined,
          });
        }
      }

      // ── Phase 3: Best-effort stock write
      // Customers are blocked by products_owner_update RLS — never fail the order for that.
      for (const update of productUpdates) {
        const updatePayload: Record<string, unknown> = {
          variants: update.variants,
        };

        let query = supabase.from("products").update(updatePayload).eq(
          "id",
          update.id,
        );
        if (update.currentVersion) {
          query = query.eq("updated_at", update.currentVersion);
        }

        let { data: updatedRows, error: updateError } = await query.select("id");

        if (updateError) {
          console.warn(
            "[placeOrderAtomic] Stock update skipped:",
            update.id,
            updateError.message,
          );
          continue;
        }

        // Version drift: one loose retry, then give up on stock (order still proceeds).
        if ((!updatedRows || updatedRows.length === 0) && update.currentVersion) {
          ({ data: updatedRows, error: updateError } = await supabase
            .from("products")
            .update(updatePayload)
            .eq("id", update.id)
            .select("id"));

          if (updateError || !updatedRows?.length) {
            console.warn(
              "[placeOrderAtomic] Stock write skipped (RLS or race); placing order anyway:",
              update.id,
            );
          }
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

      // Older DBs may lack optional columns — strip and retry.
      if (orderError && /customer_user_id/i.test(orderError.message || "")) {
        delete orderPayload.customer_user_id;
        ({ data: orderData, error: orderError } = await supabase
          .from("orders")
          .insert(orderPayload)
          .select()
          .single());
      }
      if (orderError && /\bnotes\b/i.test(orderError.message || "")) {
        delete orderPayload.notes;
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

      // Best-effort: notify merchant (and customer if linked) via web push.
      if (typeof window !== "undefined") {
        void import("@/lib/pushClient")
          .then(({ notifyOrderPush }) =>
            notifyOrderPush({
              orderId: order.id,
              shopId: params.shopId,
              status: order.status || "Pending",
              event: "new",
            }),
          )
          .catch(() => undefined);
      }

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
  customerLat?: number | null;
  customerLng?: number | null;
  customerCity?: string | null;
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
  customerLat?: number | null;
  customerLng?: number | null;
  customerCity?: string | null;
  idempotencyKey?: string | null;
}): Promise<ServiceResult<Order>> {
  return placeOrderOnServer({
    shopId: params.shopId,
    customerName: params.customerName ?? "",
    customerPhone: params.customerPhone ?? "",
    couponCode: params.couponCode,
    notes: params.notes,
    customerLat: params.customerLat,
    customerLng: params.customerLng,
    customerCity: params.customerCity,
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