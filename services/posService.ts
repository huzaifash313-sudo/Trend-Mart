/* TrendsMart POS service — settings, counter sales, stock, reports */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { fetchOrdersByShopId, updateOrderStatus } from "@/services/orderService";
import { fetchProductsByShopId } from "@/services/productService";
import type { Order, Product } from "@/types";
import {
  DEFAULT_POS_SETTINGS,
  type PosCartLine,
  type PosCashSession,
  type PosCustomer,
  type PosExpense,
  type PosHeldBill,
  type PosPaymentMethod,
  type PosPaymentSplit,
  type PosRecipe,
  type PosRecipeIngredient,
  type PosSettings,
} from "@/lib/pos/types";
import { applyPackDefaults } from "@/lib/pos/applyPack";
import { suggestPosPack } from "@/lib/pos/categoryPacks";
import { formatRupees } from "@/lib/formatters";
import { hasPriceTiers, unitPriceForQuantity } from "@/lib/priceTiers";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

function localKey(shopId: string) {
  return `trendsmart_pos_settings_${shopId}`;
}

function readLocal(shopId: string): PosSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(localKey(shopId));
    if (!raw) return null;
    return { ...DEFAULT_POS_SETTINGS, ...(JSON.parse(raw) as PosSettings) };
  } catch {
    return null;
  }
}

function writeLocal(shopId: string, settings: PosSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(localKey(shopId), JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

function normalizeSettings(raw: unknown, shopCategory?: string | null): PosSettings {
  const base = { ...DEFAULT_POS_SETTINGS };
  const suggested = suggestPosPack(shopCategory);
  if (!raw || typeof raw !== "object") {
    return applyPackDefaults(suggested, { ...base, pack: suggested });
  }
  const o = raw as Partial<PosSettings>;
  let modules =
    Array.isArray(o.modules) && o.modules.length > 0
      ? ([...o.modules] as PosSettings["modules"])
      : [...base.modules];
  // Soft-upgrade: expose new ERP tabs without forcing re-setup
  for (const m of ["expenses", "credit"] as const) {
    if (!modules.includes(m)) modules.push(m);
  }
  if (
    (o.pack === "food" || o.pack === "cafe" || o.pack === "bakery" || modules.includes("kitchen")) &&
    !modules.includes("recipes")
  ) {
    modules.push("recipes");
  }
  const pack = o.pack ?? suggested;
  const merged: PosSettings = {
    enabled: Boolean(o.enabled),
    modules,
    pack,
    receipt_footer: typeof o.receipt_footer === "string" ? o.receipt_footer : base.receipt_footer,
    low_stock_threshold:
      typeof o.low_stock_threshold === "number" ? o.low_stock_threshold : base.low_stock_threshold,
    auto_complete_counter:
      typeof o.auto_complete_counter === "boolean"
        ? o.auto_complete_counter
        : base.auto_complete_counter,
    barcode_enabled:
      typeof o.barcode_enabled === "boolean" ? o.barcode_enabled : base.barcode_enabled,
    decimal_qty: typeof o.decimal_qty === "boolean" ? o.decimal_qty : base.decimal_qty,
    token_mode: typeof o.token_mode === "boolean" ? o.token_mode : base.token_mode,
    prefer_customer_phone:
      typeof o.prefer_customer_phone === "boolean"
        ? o.prefer_customer_phone
        : base.prefer_customer_phone,
    staff_pin: typeof o.staff_pin === "string" ? o.staff_pin : base.staff_pin,
    order_sound: typeof o.order_sound === "boolean" ? o.order_sound : base.order_sound,
    kitchen_enabled:
      typeof o.kitchen_enabled === "boolean"
        ? o.kitchen_enabled
        : modules.includes("kitchen") || base.kitchen_enabled,
    auto_print_receipt:
      typeof o.auto_print_receipt === "boolean"
        ? o.auto_print_receipt
        : base.auto_print_receipt,
    counter_layout: o.counter_layout === "menu" || o.counter_layout === "excel"
      ? o.counter_layout
      : base.counter_layout,
    block_oversell:
      typeof o.block_oversell === "boolean" ? o.block_oversell : base.block_oversell,
    warn_low_on_add:
      typeof o.warn_low_on_add === "boolean" ? o.warn_low_on_add : base.warn_low_on_add,
    track_batch: typeof o.track_batch === "boolean" ? o.track_batch : base.track_batch,
    track_expiry: typeof o.track_expiry === "boolean" ? o.track_expiry : base.track_expiry,
    print_target:
      o.print_target === "bluetooth" || o.print_target === "serial" || o.print_target === "browser"
        ? o.print_target
        : base.print_target,
    print_width_mm: o.print_width_mm === 58 || o.print_width_mm === 80
      ? o.print_width_mm
      : base.print_width_mm,
  };
  // First-time saves (no pack chosen yet): apply category-aware defaults
  if (o.pack == null) {
    return applyPackDefaults(pack, merged);
  }
  return merged;
}

function heldKey(shopId: string) {
  return `trendsmart_pos_held_${shopId}`;
}

export function loadHeldBills(shopId: string): PosHeldBill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(heldKey(shopId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PosHeldBill[];
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function saveHeldBills(shopId: string, bills: PosHeldBill[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(heldKey(shopId), JSON.stringify(bills.slice(0, 12)));
  } catch {
    /* ignore */
  }
}

/** Match barcode, short_code, or variant SKU (case-insensitive trim). */
export function findProductByScanCode(
  products: Product[],
  code: string,
): Product | null {
  const q = code.trim().toLowerCase();
  if (!q) return null;
  const byBarcode = products.find((p) => (p.barcode || "").trim().toLowerCase() === q);
  if (byBarcode) return byBarcode;
  const byShort = products.find((p) => (p.short_code || "").trim().toLowerCase() === q);
  if (byShort) return byShort;
  for (const p of products) {
    const groups = p.variants ?? [];
    for (const g of groups) {
      for (const opt of g.options ?? []) {
        if ((opt.sku || "").trim().toLowerCase() === q) return p;
      }
    }
  }
  return null;
}

export async function updateProductBarcode(
  shopId: string,
  productId: string,
  barcode: string | null,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  const value = barcode?.trim() ? barcode.trim().slice(0, 64) : null;
  try {
    const { error } = await supabase
      .from("products")
      .update({ barcode: value })
      .eq("id", productId)
      .eq("shop_id", shopId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "posService.updateProductBarcode" });
    return { success: false, error: toError(err) };
  }
}

export async function setProductPosFavourite(
  shopId: string,
  productId: string,
  favourite: boolean,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("products")
      .update({ pos_favourite: favourite })
      .eq("id", productId)
      .eq("shop_id", shopId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    // Column may not exist yet
    logError(err, { module: "posService.setProductPosFavourite" });
    return { success: false, error: toError(err) };
  }
}

export function buildReceiptText(params: {
  shopName: string;
  lines: PosCartLine[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PosPaymentMethod;
  customerName?: string;
  customerPhone?: string;
  token?: string;
  footer?: string;
  orderType?: string;
  cashReceived?: number;
  changeDue?: number;
}): string {
  const lines = [
    params.shopName,
    "────────────────",
    ...params.lines.map((l) => {
      const label = l.variant ? `${l.name} (${l.variant})` : l.name;
      return `${l.qty}× ${label} — ${formatRupees(l.unitPrice * l.qty)}`;
    }),
    "────────────────",
    `Subtotal: ${formatRupees(params.subtotal)}`,
  ];
  if (params.discount > 0) lines.push(`Discount: −${formatRupees(params.discount)}`);
  lines.push(`Total: ${formatRupees(params.total)}`);
  lines.push(`Pay: ${params.paymentMethod}`);
  if (params.cashReceived != null && params.cashReceived > 0) {
    lines.push(`Cash: ${formatRupees(params.cashReceived)}`);
  }
  if (params.changeDue != null && params.changeDue > 0) {
    lines.push(`Change: ${formatRupees(params.changeDue)}`);
  }
  if (params.orderType) lines.push(`Type: ${params.orderType}`);
  if (params.token) lines.push(`Token: ${params.token}`);
  if (params.customerName) lines.push(`Customer: ${params.customerName}`);
  if (params.customerPhone) lines.push(`Phone: ${params.customerPhone}`);
  if (params.footer) {
    lines.push("────────────────");
    lines.push(params.footer);
  }
  lines.push("Powered by TrendsMart");
  return lines.join("\n");
}

export async function loadPosSettings(
  shopId: string,
  shopCategory?: string | null,
): Promise<ServiceResult<PosSettings>> {
  const local = readLocal(shopId);
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("shops")
      .select("pos_settings")
      .eq("id", shopId)
      .maybeSingle();
    if (error) {
      // Column may not exist yet — fall back to local
      if (local) return { success: true, data: normalizeSettings(local, shopCategory) };
      return {
        success: true,
        data: normalizeSettings(null, shopCategory),
      };
    }
    const remote = (data as { pos_settings?: unknown } | null)?.pos_settings;
    if (remote) {
      const merged = normalizeSettings(remote, shopCategory);
      writeLocal(shopId, merged);
      return { success: true, data: merged };
    }
    if (local) return { success: true, data: normalizeSettings(local, shopCategory) };
    return { success: true, data: normalizeSettings(null, shopCategory) };
  } catch (err) {
    logError(err, { module: "posService.loadPosSettings", meta: { shopId } });
    if (local) return { success: true, data: normalizeSettings(local, shopCategory) };
    return { success: false, error: toError(err) };
  }
}

export async function savePosSettings(
  shopId: string,
  settings: PosSettings,
): Promise<ServiceResult<PosSettings>> {
  writeLocal(shopId, settings);
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("shops")
      .update({ pos_settings: settings })
      .eq("id", shopId);
    if (error) {
      // Still OK offline/local until migration runs
      logError(error, { module: "posService.savePosSettings", meta: { shopId } });
      return { success: true, data: settings };
    }
    return { success: true, data: settings };
  } catch (err) {
    logError(err, { module: "posService.savePosSettings", meta: { shopId } });
    return { success: true, data: settings };
  }
}

export function orderSource(order: Order): "online" | "pos" | "dine_in" {
  const raw = (order as Order & { source?: string }).source;
  if (raw === "pos" || raw === "dine_in" || raw === "online") return raw;
  if (order.order_type === "dine_in") return "dine_in";
  if ((order.notes || "").includes("[POS]")) return "pos";
  return "online";
}

export function orderPaymentMethod(order: Order): string | null {
  const m = (order as Order & { payment_method?: string | null }).payment_method;
  return m ?? null;
}

/** Active tickets for POS board (online + counter, not dine kitchen). */
export function filterPosQueue(orders: Order[]): Order[] {
  return orders.filter((o) => {
    const src = orderSource(o);
    if (src === "dine_in") return false;
    return o.status === "Pending" || o.status === "Processing" || o.status === "Dispatched";
  });
}

export async function createPosSale(params: {
  shopId: string;
  lines: PosCartLine[];
  customerName?: string;
  customerPhone?: string;
  paymentMethod: PosPaymentMethod;
  paymentSplit?: PosPaymentSplit;
  discountAmount?: number;
  notes?: string;
  autoComplete?: boolean;
  orderType?: "pickup" | "delivery";
  token?: string;
  deliveryFee?: number;
}): Promise<ServiceResult<Order>> {
  const lines = params.lines.filter((l) => l.qty > 0);
  if (lines.length === 0) {
    return { success: false, error: "Add at least one item." };
  }

  try {
    const res = await fetch("/api/pos/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId: params.shopId,
        lines: lines.map((l) => ({
          productId: l.custom ? undefined : l.productId,
          name: l.name,
          qty: l.qty,
          variant: l.variant,
          notes: l.notes,
          unitPrice: l.unitPrice,
          priceLocked: Boolean(l.priceLocked || l.custom),
          custom: Boolean(l.custom),
        })),
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        paymentMethod: params.paymentMethod,
        paymentSplit: params.paymentSplit,
        discountAmount: params.discountAmount,
        notes: params.notes,
        autoComplete: params.autoComplete,
        orderType: params.orderType,
        token: params.token,
        deliveryFee: params.deliveryFee,
      }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      order?: Order;
    };
    if (!res.ok || !json.success || !json.order) {
      return {
        success: false,
        error: json.error || "Could not save sale (server blocked insert).",
      };
    }
    return { success: true, data: json.order };
  } catch (err) {
    logError(err, { module: "posService.createPosSale", meta: { shopId: params.shopId } });
    return { success: false, error: toError(err) };
  }
}

export async function recordStockMove(params: {
  shopId: string;
  productId: string;
  delta: number;
  reason: "sale" | "restock" | "adjust" | "damage" | "refund";
  note?: string;
  orderId?: string;
}): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    await supabase.from("pos_stock_moves").insert({
      shop_id: params.shopId,
      product_id: params.productId,
      delta: params.delta,
      reason: params.reason,
      note: (params.note || "").slice(0, 200),
      order_id: params.orderId ?? null,
    });

    // Adjust numeric stock_qty when tracked
    const { data: prod } = await supabase
      .from("products")
      .select("stock_qty, is_available")
      .eq("id", params.productId)
      .eq("shop_id", params.shopId)
      .maybeSingle();

    if (prod && prod.stock_qty != null && Number.isFinite(Number(prod.stock_qty))) {
      const next = Math.round((Number(prod.stock_qty) + params.delta) * 100) / 100;
      const patch: Record<string, unknown> = { stock_qty: next };
      if (next > 0) {
        patch.is_available = true;
        patch.stock_status = "in_stock";
      } else if (next <= 0 && params.delta < 0) {
        patch.stock_status = "out_of_stock";
        // Allow negative qty for soft POS; don't force is_available false
      } else if (next <= 0) {
        patch.is_available = false;
        patch.stock_status = "out_of_stock";
      }
      await supabase.from("products").update(patch).eq("id", params.productId).eq("shop_id", params.shopId);
    } else if (params.reason === "restock" && params.delta > 0) {
      // Start tracking from this restock if previously untracked
      await supabase
        .from("products")
        .update({
          stock_qty: params.delta,
          is_available: true,
          stock_status: "in_stock",
        })
        .eq("id", params.productId)
        .eq("shop_id", params.shopId);
    } else if (params.reason === "adjust" && params.delta <= -9999) {
      await supabase
        .from("products")
        .update({ is_available: false, stock_status: "out_of_stock", stock_qty: 0 })
        .eq("id", params.productId)
        .eq("shop_id", params.shopId);
    }

    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "posService.recordStockMove" });
    return { success: false, error: toError(err) };
  }
}

export interface PosStockMoveRow {
  id: string;
  shop_id: string;
  product_id: string;
  delta: number;
  reason: string;
  note: string | null;
  order_id: string | null;
  created_at: string;
}

export async function listStockMoves(
  shopId: string,
  opts?: { productId?: string; limit?: number },
): Promise<ServiceResult<PosStockMoveRow[]>> {
  const supabase = createClient();
  try {
    let q = supabase
      .from("pos_stock_moves")
      .select("id, shop_id, product_id, delta, reason, note, order_id, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(Math.min(200, opts?.limit ?? 40));
    if (opts?.productId) q = q.eq("product_id", opts.productId);
    const { data, error } = await q;
    if (error) throw error;
    return { success: true, data: (data || []) as PosStockMoveRow[] };
  } catch (err) {
    logError(err, { module: "posService.listStockMoves" });
    return { success: true, data: [] };
  }
}

/** Absolute stocktake — logs real delta vs previous on-hand. */
export async function stocktakeSetQty(
  shopId: string,
  productId: string,
  qty: number,
  note?: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  const stockQty = Math.max(0, Math.round(qty));
  try {
    const { data: prod } = await supabase
      .from("products")
      .select("stock_qty")
      .eq("id", productId)
      .eq("shop_id", shopId)
      .maybeSingle();
    const prev =
      prod && prod.stock_qty != null && Number.isFinite(Number(prod.stock_qty))
        ? Number(prod.stock_qty)
        : null;
    const delta = prev == null ? stockQty : stockQty - prev;

    const { error } = await supabase
      .from("products")
      .update({
        stock_qty: stockQty,
        is_available: stockQty > 0,
        stock_status: stockQty > 0 ? "in_stock" : "out_of_stock",
      })
      .eq("id", productId)
      .eq("shop_id", shopId);
    if (error) throw error;

    await supabase.from("pos_stock_moves").insert({
      shop_id: shopId,
      product_id: productId,
      delta,
      reason: "adjust",
      note: (note || `Stocktake → ${stockQty}`).slice(0, 200),
    });
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

export async function updateProductInventoryMeta(
  shopId: string,
  productId: string,
  meta: {
    batch_no?: string | null;
    expiry_date?: string | null;
    reorder_level?: number | null;
  },
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if ("batch_no" in meta) {
    const b = (meta.batch_no || "").trim().slice(0, 64);
    patch.batch_no = b || null;
  }
  if ("expiry_date" in meta) {
    const e = (meta.expiry_date || "").trim();
    patch.expiry_date = e && /^\d{4}-\d{2}-\d{2}/.test(e) ? e.slice(0, 10) : null;
  }
  if ("reorder_level" in meta) {
    patch.reorder_level =
      meta.reorder_level == null || Number.isNaN(Number(meta.reorder_level))
        ? null
        : Math.max(0, Math.round(Number(meta.reorder_level)));
  }
  if (Object.keys(patch).length === 0) return { success: true, data: null };
  try {
    const { error } = await supabase
      .from("products")
      .update(patch)
      .eq("id", productId)
      .eq("shop_id", shopId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

export async function enableProductStockTracking(
  shopId: string,
  productId: string,
  initialQty = 0,
): Promise<ServiceResult<null>> {
  return stocktakeSetQty(shopId, productId, initialQty, `Start tracking @ ${initialQty}`);
}

export async function setProductStockQty(
  shopId: string,
  productId: string,
  qty: number,
): Promise<ServiceResult<null>> {
  return stocktakeSetQty(shopId, productId, qty);
}

export async function restockProduct(
  shopId: string,
  productId: string,
  addQty: number,
  note?: string,
): Promise<ServiceResult<null>> {
  const delta = Math.max(1, Math.round(addQty));
  return recordStockMove({
    shopId,
    productId,
    delta,
    reason: "restock",
    note: note || `Restock +${delta}`,
  });
}

export async function damageWriteOff(
  shopId: string,
  productId: string,
  qty: number,
  note?: string,
): Promise<ServiceResult<null>> {
  const units = Math.max(1, Math.round(qty));
  return recordStockMove({
    shopId,
    productId,
    delta: -units,
    reason: "damage",
    note: note || `Damage −${units}`,
  });
}

export async function setProductStockAvailable(
  shopId: string,
  productId: string,
  available: boolean,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("products")
      .update({
        is_available: available,
        stock_status: available ? "in_stock" : "out_of_stock",
      })
      .eq("id", productId)
      .eq("shop_id", shopId);
    if (error) throw error;
    await recordStockMove({
      shopId,
      productId,
      delta: available ? 1 : -1,
      reason: available ? "restock" : "adjust",
      note: available ? "Marked in stock" : "Marked out of stock",
    });
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

export interface PosReportSummary {
  onlineCount: number;
  posCount: number;
  onlineRevenue: number;
  posRevenue: number;
  totalRevenue: number;
  pendingCount: number;
  topItems: { name: string; qty: number; revenue: number }[];
  refundedTotal: number;
  cashSales: number;
  creditSales: number;
  /** Estimated COGS from product cost_price when known */
  cogsEstimate: number;
  /** Revenue − COGS (only lines with known cost) */
  grossProfitEstimate: number;
  expenseTotal: number;
  /** Gross profit − expenses */
  netProfitEstimate: number;
}

export function buildPosReport(
  orders: Order[],
  sinceMs: number,
  untilMs?: number,
  opts?: {
    products?: Product[];
    expenses?: PosExpense[];
  },
): PosReportSummary {
  const day = orders.filter((o) => {
    const t = Date.parse(o.created_at);
    if (!Number.isFinite(t) || t < sinceMs) return false;
    if (untilMs != null && t > untilMs) return false;
    if (o.status === "Cancelled" || o.voided_at) return false;
    return true;
  });

  const costById = new Map<string, number>();
  for (const p of opts?.products || []) {
    if (p.cost_price != null && Number.isFinite(Number(p.cost_price)) && Number(p.cost_price) >= 0) {
      costById.set(p.id, Number(p.cost_price));
    }
  }

  let onlineCount = 0;
  let posCount = 0;
  let onlineRevenue = 0;
  let posRevenue = 0;
  let pendingCount = 0;
  let refundedTotal = 0;
  let cashSales = 0;
  let creditSales = 0;
  let cogsEstimate = 0;
  let grossOnCosted = 0;
  const itemMap = new Map<string, { qty: number; revenue: number }>();

  for (const o of day) {
    const src = orderSource(o);
    const amt = Math.max(0, (Number(o.total_amount) || 0) - (Number(o.refunded_amount) || 0));
    refundedTotal += Number(o.refunded_amount) || 0;
    if (o.status === "Pending" || o.status === "Processing" || o.status === "Dispatched") {
      pendingCount += 1;
    }
    if (src === "pos") {
      posCount += 1;
      posRevenue += amt;
      const pay = orderPaymentMethod(o);
      if (pay === "cash" || (o.payment_split && (o.payment_split.cash || 0) > 0)) {
        cashSales += o.payment_split?.cash ?? (pay === "cash" ? amt : 0);
      }
      if (pay === "credit" || (o.payment_split && (o.payment_split as { credit?: number }).credit)) {
        creditSales +=
          (o.payment_split as { credit?: number } | null)?.credit ?? (pay === "credit" ? amt : 0);
      }
    } else if (src !== "dine_in") {
      onlineCount += 1;
      onlineRevenue += amt;
    }
    for (const it of o.items_json || []) {
      const name = it.name || "Item";
      const qty = Math.max(0.01, it.quantity ?? 1);
      const prev = itemMap.get(name) ?? { qty: 0, revenue: 0 };
      prev.qty += qty;
      prev.revenue += (Number(it.price) || 0) * qty;
      itemMap.set(name, prev);
      if (it.product_id && costById.has(it.product_id)) {
        const cost = costById.get(it.product_id)! * qty;
        cogsEstimate += cost;
        grossOnCosted += (Number(it.price) || 0) * qty - cost;
      }
    }
  }

  const expenseTotal = (opts?.expenses || [])
    .filter((e) => {
      const t = Date.parse(e.spent_at);
      if (!Number.isFinite(t) || t < sinceMs) return false;
      if (untilMs != null && t > untilMs) return false;
      return true;
    })
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const topItems = [...itemMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const totalRevenue = onlineRevenue + posRevenue;
  const grossProfitEstimate = grossOnCosted;

  return {
    onlineCount,
    posCount,
    onlineRevenue,
    posRevenue,
    totalRevenue,
    pendingCount,
    topItems,
    refundedTotal,
    cashSales,
    creditSales,
    cogsEstimate,
    grossProfitEstimate,
    expenseTotal,
    netProfitEstimate: grossProfitEstimate - expenseTotal,
  };
}

export async function loadPosWorkspace(shopId: string): Promise<
  ServiceResult<{ orders: Order[]; products: Product[] }>
> {
  const [ordersRes, productsRes] = await Promise.all([
    fetchOrdersByShopId(shopId),
    fetchProductsByShopId(shopId),
  ]);
  if (!ordersRes.success) return { success: false, error: ordersRes.error };
  if (!productsRes.success) return { success: false, error: productsRes.error };
  return {
    success: true,
    data: { orders: ordersRes.data, products: productsRes.data },
  };
}

/** Reprice a cart line using product price_tiers when present (skip if priceLocked). */
export function repriceLineFromProduct(line: PosCartLine, product: Product | undefined): PosCartLine {
  if (line.priceLocked || line.custom) {
    return line;
  }
  if (!product || !hasPriceTiers(product.price_tiers)) {
    return { ...line, unitPrice: line.basePrice || line.unitPrice };
  }
  const base = line.basePrice || Number(product.price) || line.unitPrice;
  const qty = Math.max(1, Math.round(line.qty) || 1);
  const unit = unitPriceForQuantity(base, product.price_tiers, qty);
  return { ...line, basePrice: base, unitPrice: unit };
}

export async function voidPosOrder(
  shopId: string,
  order: Order,
): Promise<ServiceResult<Order>> {
  if (orderSource(order) !== "pos") {
    return { success: false, error: "Only counter POS bills can be voided here." };
  }
  if (order.voided_at || order.status === "Cancelled") {
    return { success: false, error: "Already voided / cancelled." };
  }
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("orders")
      .update({
        status: "Cancelled",
        voided_at: new Date().toISOString(),
        refunded_amount: Number(order.total_amount) || 0,
        notes: `${order.notes || ""} [VOID]`.trim(),
      })
      .eq("id", order.id)
      .eq("shop_id", shopId)
      .select("*")
      .single();
    if (error) {
      // Fallback without void columns
      const { data: d2, error: e2 } = await supabase
        .from("orders")
        .update({
          status: "Cancelled",
          notes: `${order.notes || ""} [VOID]`.trim(),
        })
        .eq("id", order.id)
        .eq("shop_id", shopId)
        .select("*")
        .single();
      if (e2) throw e2;
      await restoreStockFromOrder(shopId, order);
      return { success: true, data: d2 as Order };
    }
    await restoreStockFromOrder(shopId, order);
    return { success: true, data: data as Order };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

async function restoreStockFromOrder(shopId: string, order: Order) {
  for (const it of order.items_json || []) {
    if (!it.product_id) continue;
    const units = Math.max(1, Math.round(it.quantity ?? 1));
    await recordStockMove({
      shopId,
      productId: it.product_id,
      delta: units,
      reason: "refund",
      note: "Void restore",
      orderId: order.id,
    });
  }
}

export async function touchPosCustomer(
  shopId: string,
  name: string,
  phone: string,
): Promise<void> {
  const p = phone.replace(/\D/g, "").slice(0, 15);
  if (!p || p === "00000000000") return;
  const supabase = createClient();
  try {
    const { data: existing } = await supabase
      .from("pos_customers")
      .select("id, visit_count")
      .eq("shop_id", shopId)
      .eq("phone", p)
      .maybeSingle();
    if (existing?.id) {
      await supabase
        .from("pos_customers")
        .update({
          name: name || "Customer",
          visit_count: (existing.visit_count || 0) + 1,
          last_order_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("pos_customers").insert({
        shop_id: shopId,
        name: name || "Customer",
        phone: p,
        visit_count: 1,
        last_order_at: new Date().toISOString(),
      });
    }
  } catch {
    /* table may not exist yet */
  }
}

export async function listPosCustomers(shopId: string): Promise<ServiceResult<PosCustomer[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("pos_customers")
      .select("*")
      .eq("shop_id", shopId)
      .order("last_order_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return { success: true, data: (data || []) as PosCustomer[] };
  } catch (err) {
    return { success: true, data: [] };
  }
}

export async function upsertPosCustomer(
  shopId: string,
  input: { name: string; phone?: string; notes?: string },
): Promise<ServiceResult<PosCustomer>> {
  const phone = (input.phone || "").replace(/\D/g, "").slice(0, 15);
  const name = input.name.trim().slice(0, 80);
  if (!phone && !name) {
    return { success: false, error: "Name or phone required" };
  }
  const supabase = createClient();
  // Name-only walk-ins get a stable local key so upsert still works
  const phoneKey = phone || `name:${name.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}`;
  try {
    const row = {
      shop_id: shopId,
      name: name || "Customer",
      phone: phoneKey,
      notes: (input.notes || "").slice(0, 200),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("pos_customers")
      .upsert(row, { onConflict: "shop_id,phone" })
      .select("*")
      .single();
    if (error) throw error;
    return { success: true, data: data as PosCustomer };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

export async function getOpenCashSession(
  shopId: string,
): Promise<ServiceResult<PosCashSession | null>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("pos_cash_sessions")
      .select("*")
      .eq("shop_id", shopId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { success: true, data: (data as PosCashSession) ?? null };
  } catch {
    return { success: true, data: null };
  }
}

export async function openCashSession(
  shopId: string,
  openingCash: number,
  cashierLabel?: string,
): Promise<ServiceResult<PosCashSession>> {
  const existing = await getOpenCashSession(shopId);
  if (existing.success && existing.data) {
    return { success: false, error: "A cash session is already open. Close it first." };
  }
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("pos_cash_sessions")
      .insert({
        shop_id: shopId,
        status: "open",
        opening_cash: Math.max(0, openingCash),
        cashier_label: (cashierLabel || "Owner").slice(0, 40),
      })
      .select("*")
      .single();
    if (error) throw error;
    return { success: true, data: data as PosCashSession };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

export async function closeCashSession(
  shopId: string,
  sessionId: string,
  closingCash: number,
  expectedCash: number,
  notes?: string,
): Promise<ServiceResult<PosCashSession>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("pos_cash_sessions")
      .update({
        status: "closed",
        closing_cash: Math.max(0, closingCash),
        expected_cash: Math.max(0, expectedCash),
        notes: (notes || "").slice(0, 300),
        closed_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("shop_id", shopId)
      .select("*")
      .single();
    if (error) throw error;
    return { success: true, data: data as PosCashSession };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

/** Expected cash in drawer = opening + cash POS sales since open − refunds. */
export function expectedCashInDrawer(
  session: PosCashSession,
  orders: Order[],
): number {
  const openMs = Date.parse(session.opened_at);
  let cashIn = 0;
  for (const o of orders) {
    const t = Date.parse(o.created_at);
    if (!Number.isFinite(t) || t < openMs) continue;
    if (orderSource(o) !== "pos") continue;
    if (o.voided_at || o.status === "Cancelled") continue;
    const split = o.payment_split;
    if (split && typeof split.cash === "number") {
      cashIn += split.cash;
      continue;
    }
    if (orderPaymentMethod(o) === "cash") {
      cashIn += Math.max(0, (Number(o.total_amount) || 0) - (Number(o.refunded_amount) || 0));
    }
  }
  return Math.round(Number(session.opening_cash) || 0) + Math.round(cashIn);
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export async function listPosExpenses(
  shopId: string,
  opts?: { sinceMs?: number; untilMs?: number; limit?: number },
): Promise<ServiceResult<PosExpense[]>> {
  const supabase = createClient();
  try {
    let q = supabase
      .from("pos_expenses")
      .select("*")
      .eq("shop_id", shopId)
      .order("spent_at", { ascending: false })
      .limit(Math.min(200, opts?.limit ?? 80));
    if (opts?.sinceMs) q = q.gte("spent_at", new Date(opts.sinceMs).toISOString());
    if (opts?.untilMs) q = q.lte("spent_at", new Date(opts.untilMs).toISOString());
    const { data, error } = await q;
    if (error) throw error;
    return { success: true, data: (data || []) as PosExpense[] };
  } catch {
    return { success: true, data: [] };
  }
}

export async function addPosExpense(
  shopId: string,
  input: { title: string; amount: number; category?: string; notes?: string; spent_at?: string },
): Promise<ServiceResult<PosExpense>> {
  const amount = Math.max(0, Number(input.amount) || 0);
  if (amount <= 0) return { success: false, error: "Amount required" };
  const title = (input.title || "").trim().slice(0, 120) || "Expense";
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("pos_expenses")
      .insert({
        shop_id: shopId,
        title,
        amount,
        category: (input.category || "general").slice(0, 40),
        notes: (input.notes || "").slice(0, 300),
        spent_at: input.spent_at || new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;
    return { success: true, data: data as PosExpense };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

export async function deletePosExpense(
  shopId: string,
  expenseId: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("pos_expenses")
      .delete()
      .eq("id", expenseId)
      .eq("shop_id", shopId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

// ─── Credit / udhaar ────────────────────────────────────────────────────────

export async function recordCreditPayment(
  shopId: string,
  input: {
    phone: string;
    name?: string;
    amount: number;
    note?: string;
  },
): Promise<ServiceResult<PosCustomer>> {
  const phone = input.phone.replace(/\D/g, "").slice(0, 15);
  const amount = Math.max(0, Number(input.amount) || 0);
  if (!phone) return { success: false, error: "Phone required for udhaar settle" };
  if (amount <= 0) return { success: false, error: "Amount required" };
  const supabase = createClient();
  try {
    const { data: existing } = await supabase
      .from("pos_customers")
      .select("*")
      .eq("shop_id", shopId)
      .eq("phone", phone)
      .maybeSingle();

    const prev = Number((existing as PosCustomer | null)?.credit_balance) || 0;
    const nextBal = Math.max(0, Math.round((prev - amount) * 100) / 100);
    let customer: PosCustomer;

    if (existing) {
      const { data, error } = await supabase
        .from("pos_customers")
        .update({
          credit_balance: nextBal,
          updated_at: new Date().toISOString(),
          ...(input.name ? { name: input.name.slice(0, 80) } : {}),
        })
        .eq("id", (existing as PosCustomer).id)
        .select("*")
        .single();
      if (error) throw error;
      customer = data as PosCustomer;
    } else {
      const { data, error } = await supabase
        .from("pos_customers")
        .insert({
          shop_id: shopId,
          name: (input.name || "Customer").slice(0, 80),
          phone,
          credit_balance: 0,
          visit_count: 0,
        })
        .select("*")
        .single();
      if (error) throw error;
      customer = data as PosCustomer;
    }

    await supabase.from("pos_credit_ledger").insert({
      shop_id: shopId,
      customer_id: customer.id,
      customer_phone: phone,
      customer_name: customer.name,
      delta: -amount,
      reason: "collect",
      note: (input.note || "Udhaar collected").slice(0, 200),
    });

    return { success: true, data: customer };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

export async function listCreditLedger(
  shopId: string,
  limit = 40,
): Promise<
  ServiceResult<
    {
      id: string;
      customer_phone: string;
      customer_name: string;
      delta: number;
      reason: string;
      note: string | null;
      created_at: string;
    }[]
  >
> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("pos_credit_ledger")
      .select("id, customer_phone, customer_name, delta, reason, note, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { success: true, data: (data || []) as never };
  } catch {
    return { success: true, data: [] };
  }
}

// ─── Recipes / BOM ──────────────────────────────────────────────────────────

export async function listPosRecipes(shopId: string): Promise<ServiceResult<PosRecipe[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("pos_recipes")
      .select("*")
      .eq("shop_id", shopId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return {
      success: true,
      data: ((data || []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        shop_id: String(r.shop_id),
        product_id: String(r.product_id),
        ingredients: (Array.isArray(r.ingredients)
          ? r.ingredients
          : []) as PosRecipeIngredient[],
        notes: (r.notes as string) || "",
        updated_at: r.updated_at as string | undefined,
      })),
    };
  } catch {
    return { success: true, data: [] };
  }
}

export async function savePosRecipe(
  shopId: string,
  productId: string,
  ingredients: PosRecipeIngredient[],
  notes?: string,
): Promise<ServiceResult<PosRecipe>> {
  const clean = ingredients
    .filter((i) => i.product_id && Number(i.qty) > 0)
    .map((i) => ({
      product_id: i.product_id,
      qty: Math.round(Number(i.qty) * 100) / 100,
      name: (i.name || "").slice(0, 80),
    }));
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("pos_recipes")
      .upsert(
        {
          shop_id: shopId,
          product_id: productId,
          ingredients: clean,
          notes: (notes || "").slice(0, 300),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "shop_id,product_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    const r = data as Record<string, unknown>;
    return {
      success: true,
      data: {
        id: String(r.id),
        shop_id: String(r.shop_id),
        product_id: String(r.product_id),
        ingredients: clean,
        notes: (r.notes as string) || "",
      },
    };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

export async function deletePosRecipe(
  shopId: string,
  productId: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("pos_recipes")
      .delete()
      .eq("shop_id", shopId)
      .eq("product_id", productId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

export async function updateProductCostPrice(
  shopId: string,
  productId: string,
  costPrice: number | null,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  const value =
    costPrice == null || !Number.isFinite(costPrice) || costPrice < 0
      ? null
      : Math.round(costPrice * 100) / 100;
  try {
    const { error } = await supabase
      .from("products")
      .update({ cost_price: value })
      .eq("id", productId)
      .eq("shop_id", shopId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

export { updateOrderStatus };
