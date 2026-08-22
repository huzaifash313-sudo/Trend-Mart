/* -------------------------------------------------------------------------- */
/*  TrendMart — Dine-In Order Placement (POST /api/dinein/orders)              */
/*                                                                             */
/*  The zero-friction checkout for QR table ordering. Unlike POST /api/orders  */
/*  (delivery) this route deliberately requires NO sign-in and NO email        */
/*  verification — the QR token on the table is the possession proof.          */
/*                                                                             */
/*  Server still stays authoritative:                                          */
/*    1. Resolves the table token (must be active).                            */
/*    2. Re-reads every line's price from `products` (never trusts the client).*/
/*    3. Enforces a per-table cooldown so a stray/spam scanner can't flood     */
/*       the kitchen.                                                          */
/*    4. Inserts the order with order_type = 'dine_in' + table context.        */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/sanitization";
import { sendPushToUser } from "@/lib/webPush";
import { normalizeDinePhone } from "@/services/dineInService";
import type { OrderItem, VariantGroup } from "@/types";

export const runtime = "nodejs";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface DineItemInput {
  productId?: string | null;
  name?: string | null;
  quantity?: number | null;
  variant?: string | null;
  notes?: string | null;
}

interface DineOrderBody {
  tableToken?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  items?: DineItemInput[] | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toMoney(v: unknown): number | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function sanitizeText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/<[^>]*>/g, "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, max);
}

function clampQuantity(v: unknown): number {
  const n = Math.round(toNumber(v, 1));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 99);
}

/* ─── POST ──────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  let body: DineOrderBody;
  try {
    body = (await request.json()) as DineOrderBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Ordering is temporarily unavailable." },
      { status: 503 },
    );
  }

  const tableToken = sanitizeText(body.tableToken, 64);
  const customerName = sanitizeText(body.customerName, 100);
  const customerPhone = normalizeDinePhone(sanitizeText(body.customerPhone, 30));
  const notes = sanitizeText(body.notes, 500);
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 100) : "";

  if (!tableToken) {
    return NextResponse.json({ success: false, error: "Table not found. Rescan the QR code." }, { status: 404 });
  }
  if (customerName.length < 1) {
    return NextResponse.json({ success: false, error: "Please enter your name." }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ success: false, error: "Your order is empty." }, { status: 400 });
  }

  // 1. Resolve the table token → table + shop.
  const { data: tableRaw, error: tableErr } = await admin
    .from("dine_in_tables")
    .select("id, name, shop_id, is_active")
    .eq("qr_token", tableToken)
    .maybeSingle();
  const table = tableRaw as { id: string; name: string; shop_id: string; is_active: boolean } | null;
  if (tableErr || !table) {
    return NextResponse.json({ success: false, error: "This QR code is not active. Ask staff for help." }, { status: 404 });
  }
  if (table.is_active === false) {
    return NextResponse.json({ success: false, error: "Orders from this table are paused right now." }, { status: 409 });
  }

  const { data: shopRaw, error: shopErr } = await admin
    .from("shops")
    .select("id, owner_id, name, is_live, verification_status")
    .eq("id", table.shop_id)
    .maybeSingle();
  const shop = shopRaw as { id: string; owner_id: string | null; name: string | null; is_live: boolean; verification_status: string | null } | null;
  if (shopErr || !shop) {
    return NextResponse.json({ success: false, error: "Shop not found." }, { status: 404 });
  }
  if (shop.is_live === false) {
    return NextResponse.json({ success: false, error: "This shop is currently offline." }, { status: 409 });
  }
  if ((shop.verification_status ?? "approved") !== "approved") {
    return NextResponse.json({ success: false, error: "This shop is not accepting orders yet." }, { status: 409 });
  }

  // 2. Normalise + authoritatively price the items (must belong to this shop).
  const lines: Array<{ productId: string; name: string; quantity: number; variant?: string; notes?: string }> = [];
  for (const raw of body.items) {
    const productId = typeof raw?.productId === "string" ? raw.productId.trim() : "";
    if (!isValidUUID(productId)) {
      return NextResponse.json({ success: false, error: "One or more items are invalid. Refresh and try again." }, { status: 400 });
    }
    lines.push({
      productId,
      name: sanitizeText(raw.name, 200) || "Item",
      quantity: clampQuantity(raw.quantity),
      variant: raw.variant ? sanitizeText(raw.variant, 100) : undefined,
      notes: raw.notes ? sanitizeText(raw.notes, 200) : undefined,
    });
  }

  const ids = [...new Set(lines.map((l) => l.productId))];
  const { data: productRes } = await admin
    .from("products")
    .select("id, shop_id, name, price, is_available, variants")
    .in("id", ids);
  const productMap = new Map<string, { shop_id: string; name: string; price: number | null; is_available: boolean; variants: VariantGroup[] }>();
  for (const row of (productRes ?? []) as Record<string, unknown>[]) {
    productMap.set(String(row.id), {
      shop_id: String(row.shop_id ?? ""),
      name: String(row.name ?? ""),
      price: toMoney(row.price),
      is_available: row.is_available !== false,
      variants: (row.variants as VariantGroup[]) ?? [],
    });
  }

  const resolvedItems: Array<{ productId: string; name: string; price: number; quantity: number; variant?: string; notes?: string }> = [];
  for (const line of lines) {
    const product = productMap.get(line.productId);
    if (!product) {
      return NextResponse.json({ success: false, error: "One or more items are no longer available." }, { status: 409 });
    }
    if (product.shop_id !== shop.id) {
      return NextResponse.json({ success: false, error: "Order contains an item from another shop." }, { status: 400 });
    }
    if (!product.is_available) {
      return NextResponse.json({ success: false, error: `"${product.name}" is currently unavailable.` }, { status: 409 });
    }
    if (product.price == null) {
      return NextResponse.json({ success: false, error: `"${product.name}" has an invalid price.` }, { status: 409 });
    }
    resolvedItems.push({
      productId: line.productId,
      name: product.name || line.name,
      price: product.price,
      quantity: line.quantity,
      variant: line.variant,
      notes: line.notes,
    });
  }

  const total = Math.round(resolvedItems.reduce((sum, i) => sum + i.price * i.quantity, 0) * 100) / 100;

  // 3. Per-table cooldown — stop a stray/spam scanner from flooding the kitchen.
  const COOLDOWN_MS = 15000;
  const { data: recentRaw } = await admin
    .from("orders")
    .select("id, created_at")
    .eq("table_id", table.id)
    .eq("order_type", "dine_in")
    .gte("created_at", new Date(Date.now() - COOLDOWN_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const recent = (recentRaw as { id: string; created_at: string }[] | null)?.[0];
  if (recent) {
    return NextResponse.json(
      { success: false, error: "Order received — please wait a moment before sending another." },
      { status: 409 },
    );
  }

  // 4. Idempotency — same checkout token never creates a duplicate.
  if (idempotencyKey) {
    const { data: existing } = await admin
      .from("orders")
      .select("id, shop_id, table_code, customer_name, items_json, total_amount, dine_status, created_at")
      .eq("client_token", idempotencyKey)
      .maybeSingle();
    if (existing) {
      const prior = existing as Record<string, unknown>;
      return NextResponse.json({
        success: true,
        order: {
          id: String(prior.id),
          shop_id: String(prior.shop_id),
          table_code: String(prior.table_code ?? table.name),
          customer_name: String(prior.customer_name ?? ""),
          items_json: (prior.items_json as OrderItem[]) ?? [],
          total_amount: toNumber(prior.total_amount, total),
          dine_status: String(prior.dine_status ?? "Pending"),
          created_at: String(prior.created_at ?? new Date().toISOString()),
        },
      });
    }
  }

  // 5. Insert the dine-in order.
  const orderItems: OrderItem[] = resolvedItems.map((i) => ({
    product_id: i.productId,
    name: i.name,
    price: i.price,
    quantity: i.quantity,
    ...(i.variant ? { variant: i.variant } : {}),
    ...(i.notes ? { notes: i.notes } : {}),
  }));

  const orderPayload: Record<string, unknown> = {
    shop_id: shop.id,
    table_id: table.id,
    table_code: table.name,
    order_type: "dine_in",
    dine_status: "Pending",
    status: "Pending",
    customer_name: customerName,
    customer_phone: customerPhone,
    items_json: orderItems,
    total_amount: total,
    subtotal_amount: total,
    discount_amount: 0,
    delivery_fee: 0,
  };
  if (notes) orderPayload.notes = notes;
  if (idempotencyKey) orderPayload.client_token = idempotencyKey;

  // Attach the signed-in user when present (so they can also track it normally).
  try {
    const { createClient: createServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabaseServer = await createServerSupabaseClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user?.id) orderPayload.customer_user_id = user.id;
  } catch {
    /* anonymous dine-in is the default — ignore */
  }

  let { data: inserted, error: insertErr } = await admin
    .from("orders")
    .insert(orderPayload as never)
    .select("id, shop_id, table_code, customer_name, items_json, total_amount, dine_status, created_at")
    .single();

  if (insertErr && /column .* does not exist|PGRST204|schema cache|Could not find/i.test(insertErr.message || "")) {
    const corePayload: Record<string, unknown> = {
      shop_id: shop.id,
      table_id: table.id,
      table_code: table.name,
      order_type: "dine_in",
      dine_status: "Pending",
      status: "Pending",
      customer_name: customerName,
      customer_phone: customerPhone,
      items_json: orderItems,
      total_amount: total,
    };
    if (notes) corePayload.notes = notes;
    if (idempotencyKey) corePayload.client_token = idempotencyKey;
    if (orderPayload.customer_user_id) corePayload.customer_user_id = orderPayload.customer_user_id;
    ({ data: inserted, error: insertErr } = await admin
      .from("orders")
      .insert(corePayload as never)
      .select("id, shop_id, table_code, customer_name, items_json, total_amount, dine_status, created_at")
      .single());
  }

  if (insertErr || !inserted) {
    return NextResponse.json(
      { success: false, error: "Could not place your order. Please try again." },
      { status: 500 },
    );
  }

  const row = inserted as Record<string, unknown>;
  const order = {
    id: String(row.id),
    shop_id: String(row.shop_id),
    table_code: String(row.table_code ?? table.name),
    customer_name: String(row.customer_name ?? customerName),
    items_json: (row.items_json as OrderItem[]) ?? orderItems,
    total_amount: toNumber(row.total_amount, total),
    dine_status: String(row.dine_status ?? "Pending"),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };

  // 6. Notify the merchant via OS push (best-effort, never blocks checkout).
  const amountLabel = `Rs. ${Math.round(total).toLocaleString()}`;
  void (async () => {
    if (shop.owner_id) {
      await sendPushToUser(shop.owner_id, {
        title: "New dine-in order",
        body: `${table.name} • ${customerName} ordered ${amountLabel}.`,
        url: "/dashboard/kitchen",
        tag: `dine-${order.id}`,
      });
    }
  })().catch(() => undefined);

  return NextResponse.json({ success: true, order });
}
