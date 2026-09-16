/* -------------------------------------------------------------------------- */
/*  TrendsMart — POS counter sale (POST /api/pos/sales)                        */
/*  Orders RLS blocks client INSERT — merchants must create via service role.  */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/sanitization";
import { STAFF_COOKIE, verifyStaffSession } from "@/lib/pos/staffAuth";
import { logPosAudit } from "@/lib/pos/posAudit";
import { computeBillTotals } from "@/lib/pos/billMath";
import { computeVariantPricing } from "@/lib/variantPricing";
import { hasPriceTiers, unitPriceForQuantity } from "@/lib/priceTiers";
import type { OrderItem, PriceTier, VariantGroup } from "@/types";

export const runtime = "nodejs";

interface PosLineInput {
  productId?: string | null;
  name?: string | null;
  qty?: number | null;
  variant?: string | null;
  notes?: string | null;
  /** Cashier unit price — honored when priceLocked or differs from catalog */
  unitPrice?: number | null;
  /** When true, server keeps client unitPrice (counter override) */
  priceLocked?: boolean | null;
  /** Non-catalog / general item (name+price from cashier). */
  custom?: boolean | null;
}

interface PosSaleBody {
  shopId?: string | null;
  lines?: PosLineInput[] | null;
  customerName?: string | null;
  customerPhone?: string | null;
  paymentMethod?: string | null;
  paymentSplit?: Record<string, number> | null;
  discountAmount?: number | null;
  taxAmount?: number | null;
  notes?: string | null;
  autoComplete?: boolean | null;
  orderType?: string | null;
  token?: string | null;
  deliveryFee?: number | null;
}

const PAY_METHODS = new Set([
  "cash",
  "card",
  "jazzcash",
  "easypaisa",
  "credit",
  "other",
]);

function money(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 100) / 100;
}

function sanitizeText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/<[^>]*>/g, "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, max);
}

function clampQty(v: unknown, allowDecimal: boolean): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (allowDecimal) return Math.min(9999, Math.round(n * 100) / 100);
  return Math.min(9999, Math.max(1, Math.round(n)));
}

export async function POST(request: Request) {
  let body: PosSaleBody;
  try {
    body = (await request.json()) as PosSaleBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  const shopId = typeof body.shopId === "string" ? body.shopId.trim() : "";
  if (!isValidUUID(shopId)) {
    return NextResponse.json({ success: false, error: "Invalid shop." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Server billing is not configured." },
      { status: 500 },
    );
  }
  const { data: shop, error: shopErr } = await admin
    .from("shops")
    .select("id, owner_id, name, pos_settings")
    .eq("id", shopId)
    .maybeSingle();

  if (shopErr || !shop || (shop as { owner_id?: string }).owner_id !== user.id) {
    return NextResponse.json(
      { success: false, error: "You can only bill for your own store." },
      { status: 403 },
    );
  }

  // ── Who is at the counter? ────────────────────────────────────────────────
  // The owner session above authorizes the shop; the staff cookie identifies the
  // person. Once a shop has configured staff, an identified shift is required —
  // otherwise sales would be unattributable, defeating the audit trail. Shops
  // with no staff configured keep working exactly as before (owner at counter).
  const staffToken = (await cookies()).get(STAFF_COOKIE)?.value;
  const staffSession = verifyStaffSession(staffToken);
  const activeStaff =
    staffSession && staffSession.shopId === shopId ? staffSession : null;

  const { count: staffCount } = await admin
    .from("pos_staff")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("is_active", true);

  if ((staffCount ?? 0) > 0 && !activeStaff) {
    return NextResponse.json(
      { success: false, error: "Start your shift — pick your name and enter your PIN." },
      { status: 403 },
    );
  }

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (rawLines.length === 0) {
    return NextResponse.json({ success: false, error: "Add at least one item." }, { status: 400 });
  }

  const productIds = [
    ...new Set(
      rawLines
        .filter((l) => !l.custom)
        .map((l) => (typeof l.productId === "string" ? l.productId.trim() : ""))
        .filter((id) => isValidUUID(id)),
    ),
  ];

  const hasCustom = rawLines.some((l) => l.custom);
  if (productIds.length === 0 && !hasCustom) {
    return NextResponse.json({ success: false, error: "Invalid products." }, { status: 400 });
  }

  const { data: products, error: prodErr } =
    productIds.length > 0
      ? await admin
          .from("products")
          .select(
            "id, name, price, original_price, variants, price_tiers, is_available, stock_qty, expiry_date",
          )
          .eq("shop_id", shopId)
          .in("id", productIds)
      : { data: [], error: null };

  if (prodErr) {
    return NextResponse.json({ success: false, error: "Could not load products." }, { status: 500 });
  }

  const byId = new Map(
    ((products as Record<string, unknown>[]) || []).map((p) => [String(p.id), p]),
  );

  // Load shop POS stock discipline (oversell / expiry)
  const { data: shopRow } = await admin
    .from("shops")
    .select("pos_settings")
    .eq("id", shopId)
    .maybeSingle();
  const posCfg =
    shopRow && typeof (shopRow as { pos_settings?: unknown }).pos_settings === "object"
      ? ((shopRow as { pos_settings: Record<string, unknown> }).pos_settings || {})
      : {};
  const blockOversell = posCfg.block_oversell === true;
  const trackExpiry = posCfg.track_expiry === true;

  // Load recipes for finished goods (BOM)
  const recipeByProduct = new Map<
    string,
    { product_id: string; qty: number }[]
  >();
  if (productIds.length > 0) {
    try {
      const { data: recipes } = await admin
        .from("pos_recipes")
        .select("product_id, ingredients")
        .eq("shop_id", shopId)
        .in("product_id", productIds);
      for (const r of (recipes as { product_id: string; ingredients: unknown }[]) || []) {
        const ing = Array.isArray(r.ingredients) ? r.ingredients : [];
        const clean = ing
          .map((x) => {
            const o = x as { product_id?: string; qty?: number };
            if (!o.product_id || !isValidUUID(o.product_id)) return null;
            const q = Number(o.qty);
            if (!Number.isFinite(q) || q <= 0) return null;
            return { product_id: o.product_id, qty: q };
          })
          .filter(Boolean) as { product_id: string; qty: number }[];
        if (clean.length) recipeByProduct.set(String(r.product_id), clean);
      }
    } catch {
      /* recipes table optional until migration */
    }
  }

  const ingredientIds = [
    ...new Set(
      [...recipeByProduct.values()].flatMap((ings) => ings.map((i) => i.product_id)),
    ),
  ].filter((id) => !byId.has(id));

  if (ingredientIds.length > 0) {
    const { data: extra } = await admin
      .from("products")
      .select(
        "id, name, price, original_price, variants, price_tiers, is_available, stock_qty, expiry_date",
      )
      .eq("shop_id", shopId)
      .in("id", ingredientIds);
    for (const p of (extra as Record<string, unknown>[]) || []) {
      byId.set(String(p.id), p);
    }
  }

  const items: OrderItem[] = [];
  /** Lines where the cashier charged something other than the catalog price. */
  const priceOverrides: Array<{
    product: string;
    catalogPrice: number;
    chargedPrice: number;
    qty: number;
  }> = [];
  const stockDeltas: { productId: string; units: number; reason: string }[] = [];

  for (const line of rawLines) {
    const qty = clampQty(line.qty, true);
    if (qty <= 0) continue;

    // General / misc item (Noor-style)
    if (line.custom) {
      const name = sanitizeText(line.name, 120) || "Misc item";
      const unit = money(line.unitPrice);
      if (unit <= 0) {
        return NextResponse.json(
          { success: false, error: "Custom item needs a price." },
          { status: 400 },
        );
      }
      items.push({
        name,
        price: unit,
        quantity: qty,
        notes: sanitizeText(line.notes, 200) || "custom",
      });
      continue;
    }

    const pid = typeof line.productId === "string" ? line.productId.trim() : "";
    const prod = byId.get(pid);
    if (!prod) {
      return NextResponse.json(
        { success: false, error: "One or more products are invalid for this shop." },
        { status: 400 },
      );
    }
    if (prod.is_available === false && blockOversell) {
      return NextResponse.json(
        { success: false, error: `${String(prod.name)} is out of stock.` },
        { status: 400 },
      );
    }

    if (trackExpiry && prod.expiry_date) {
      const exp = Date.parse(String(prod.expiry_date));
      if (Number.isFinite(exp)) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (exp < today.getTime() && blockOversell) {
          return NextResponse.json(
            { success: false, error: `${String(prod.name)} is expired.` },
            { status: 400 },
          );
        }
      }
    }

    const base = money(prod.price);
    const variantLabel = sanitizeText(line.variant, 120);
    const clientUnit = money(line.unitPrice);
    const locked = line.priceLocked === true || (clientUnit > 0 && Math.abs(clientUnit - base) > 0.009);

    let unit = base;
    let original: number | undefined =
      prod.original_price != null ? money(prod.original_price) : undefined;

    if (locked && clientUnit > 0) {
      // Merchant counter override (known customer / special deal)
      unit = clientUnit;
      priceOverrides.push({
        product: String(prod.name || line.name || "Item").slice(0, 120),
        catalogPrice: base,
        chargedPrice: clientUnit,
        qty,
      });
    } else if (variantLabel) {
      const priced = computeVariantPricing(
        base,
        original ?? null,
        (prod.variants as VariantGroup[]) ?? null,
        variantLabel,
      );
      unit = priced.price;
      if (priced.originalPrice != null) original = priced.originalPrice;
    } else if (hasPriceTiers(prod.price_tiers as PriceTier[] | null)) {
      const qInt = Math.max(1, Math.round(qty));
      unit = unitPriceForQuantity(base, prod.price_tiers as PriceTier[], qInt);
    }

    items.push({
      product_id: pid,
      name: String(prod.name || line.name || "Item").slice(0, 120),
      price: unit,
      original_price: original && original > unit ? original : undefined,
      quantity: qty,
      variant: variantLabel || undefined,
      notes: sanitizeText(line.notes, 200) || undefined,
    });

    const recipe = recipeByProduct.get(pid);
    if (recipe && recipe.length > 0) {
      for (const ing of recipe) {
        const units = Math.round(ing.qty * qty * 100) / 100;
        stockDeltas.push({
          productId: ing.product_id,
          units,
          reason: "recipe",
        });
      }
    } else {
      stockDeltas.push({
        productId: pid,
        units: Math.round(qty * 100) / 100,
        reason: "sale",
      });
    }
  }

  if (items.length === 0) {
    return NextResponse.json({ success: false, error: "Add at least one item." }, { status: 400 });
  }

  if (blockOversell) {
    const need = new Map<string, number>();
    for (const d of stockDeltas) {
      need.set(d.productId, (need.get(d.productId) || 0) + d.units);
    }
    for (const [pid, units] of need) {
      const prod = byId.get(pid);
      if (!prod || prod.stock_qty == null || !Number.isFinite(Number(prod.stock_qty))) continue;
      const onHand = Number(prod.stock_qty);
      if (units > onHand + 0.0001) {
        return NextResponse.json(
          {
            success: false,
            error: `${String(prod.name)}: only ${onHand} in stock (bill needs ${units}).`,
          },
          { status: 400 },
        );
      }
    }
  }

  const rawSubtotal = items.reduce(
    (s, i) => s + i.price * Math.max(0.01, i.quantity ?? 1),
    0,
  );

  // Tax is computed from the shop's configured rate, never from a client-sent
  // amount — otherwise a tampered request could under- or over-charge tax.
  const shopSettings = (shop as { pos_settings?: { tax_rate?: unknown } | null })
    .pos_settings;
  const shopTaxRate = money(shopSettings?.tax_rate);

  // Shared arithmetic with the counter UI (lib/pos/billMath) so the total the
  // cashier sees and the total stored here can never drift apart.
  const { subtotal, discount, tax, fee: deliveryFee, total } = computeBillTotals({
    subtotal: rawSubtotal,
    // The discount IS a legitimate cashier decision, so it comes from the
    // request — but computeBillTotals clamps it to the subtotal.
    discountValue: money(body.discountAmount),
    discountMode: "flat",
    taxRatePercent: shopTaxRate,
    deliveryFee: body.orderType === "delivery" ? money(body.deliveryFee) : 0,
  });

  const payRaw = sanitizeText(body.paymentMethod, 20).toLowerCase() || "cash";
  const paymentMethod = PAY_METHODS.has(payRaw) ? payRaw : "cash";

  let paymentSplit: Record<string, number> | null = null;
  if (body.paymentSplit && typeof body.paymentSplit === "object") {
    const out: Record<string, number> = {};
    let sum = 0;
    for (const k of ["cash", "card", "jazzcash", "easypaisa", "credit", "other"] as const) {
      const v = money(body.paymentSplit[k]);
      if (v > 0) {
        out[k] = v;
        sum += v;
      }
    }
    if (sum > 0) {
      if (Math.abs(sum - total) > 1) {
        out.cash = Math.max(0, money((out.cash || 0) + (total - sum)));
      }
      paymentSplit = out;
    }
  }

  const orderType = body.orderType === "delivery" ? "delivery" : "pickup";
  const autoComplete = body.autoComplete !== false && orderType === "pickup";
  const token = sanitizeText(body.token, 40);
  const notes = [
    "[POS]",
    `pay:${paymentMethod}`,
    token ? `token:${token}` : "",
    sanitizeText(body.notes, 400),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const customerName =
    sanitizeText(body.customerName, 80) || "Walk-in";
  const customerPhone =
    sanitizeText(body.customerPhone, 15).replace(/\D/g, "").slice(0, 15) || "00000000000";

  if (paymentMethod === "credit" && customerPhone === "00000000000") {
    return NextResponse.json(
      { success: false, error: "Udhaar sale needs a customer phone." },
      { status: 400 },
    );
  }

  const row: Record<string, unknown> = {
    shop_id: shopId,
    customer_name: customerName,
    customer_phone: customerPhone,
    items_json: items,
    total_amount: total,
    subtotal_amount: subtotal,
    discount_amount: discount > 0 ? discount : 0,
    tax_amount: tax > 0 ? tax : 0,
    delivery_fee: deliveryFee,
    staff_id: activeStaff?.staffId ?? null,
    staff_name: activeStaff?.name ?? "Owner",
    status: autoComplete ? "Delivered" : "Pending",
    order_type: orderType,
    notes,
    source: "pos",
    payment_method: paymentMethod,
    payment_split: paymentSplit,
  };

  let inserted: Record<string, unknown> | null = null;
  {
    const { data, error } = await admin
      .from("orders")
      .insert(row as never)
      .select("*")
      .single();
    if (error) {
      // Columns may be missing on older DBs
      delete row.source;
      delete row.payment_method;
      delete row.payment_split;
      // Staff attribution lands with 20260917_pos_staff.sql; until that runs the
      // sale must still go through (unattributed) rather than fail at the counter.
      delete row.staff_id;
      delete row.staff_name;
      delete row.tax_amount;
      const { data: d2, error: e2 } = await admin
        .from("orders")
        .insert(row as never)
        .select("*")
        .single();
      if (e2) {
        return NextResponse.json(
          { success: false, error: e2.message || "Could not save sale." },
          { status: 500 },
        );
      }
      inserted = d2 as Record<string, unknown>;
    } else {
      inserted = data as Record<string, unknown>;
    }
  }

  const orderId = String(inserted.id);

  // ── Audit trail ───────────────────────────────────────────────────────────
  // Recorded server-side with the service role so a cashier can't suppress it.
  // Discounts and counter price overrides are allowed for cashiers by design —
  // accountability comes from these records, not from blocking the action.
  const auditActor = activeStaff
    ? { staffId: activeStaff.staffId, name: activeStaff.name }
    : null;

  void logPosAudit({
    shopId,
    staff: auditActor,
    eventType: "sale.completed",
    orderId,
    metadata: { subtotal, discount, tax, deliveryFee, total, paymentMethod, itemCount: items.length },
  });

  if (discount > 0) {
    void logPosAudit({
      shopId,
      staff: auditActor,
      eventType: "sale.discount",
      severity: "warning",
      orderId,
      metadata: {
        discount,
        subtotal,
        percentOfSubtotal: subtotal > 0 ? Math.round((discount / subtotal) * 1000) / 10 : 0,
      },
    });
  }

  for (const line of priceOverrides) {
    void logPosAudit({
      shopId,
      staff: auditActor,
      eventType: "sale.price_override",
      severity: "warning",
      orderId,
      metadata: line,
    });
  }

  // Stock ledger + qty (best-effort). Soft mode allows negative on-hand.
  for (const d of stockDeltas) {
    const move: Record<string, unknown> = {
      shop_id: shopId,
      product_id: d.productId,
      delta: -d.units,
      reason: d.reason === "recipe" ? "sale" : "sale",
      note: d.reason === "recipe" ? "POS recipe ingredient" : "POS sale",
      order_id: orderId,
      staff_id: activeStaff?.staffId ?? null,
      staff_name: activeStaff?.name ?? "Owner",
    };
    const { error: moveErr } = await admin
      .from("pos_stock_moves")
      .insert(move as never);
    if (moveErr) {
      // Staff columns arrive with 20260917_pos_staff.sql — never lose the
      // ledger row just because attribution columns aren't there yet.
      delete move.staff_id;
      delete move.staff_name;
      await admin.from("pos_stock_moves").insert(move as never);
    }

    const prod = byId.get(d.productId);
    if (prod && prod.stock_qty != null && Number.isFinite(Number(prod.stock_qty))) {
      const next = Math.round((Number(prod.stock_qty) - d.units) * 100) / 100;
      const patch: Record<string, unknown> = { stock_qty: next };
      if (blockOversell) {
        patch.is_available = next > 0;
        patch.stock_status = next > 0 ? "in_stock" : "out_of_stock";
      } else if (next > 0) {
        patch.stock_status = "in_stock";
      } else {
        patch.stock_status = "out_of_stock";
        // keep is_available so soft sales can continue
      }
      await admin
        .from("products")
        .update(patch as never)
        .eq("id", d.productId)
        .eq("shop_id", shopId);
      prod.stock_qty = next;
    }
  }

  // Walk-in customer book + udhaar credit
  const creditAmt =
    paymentMethod === "credit"
      ? total
      : paymentSplit
        ? money(paymentSplit.credit)
        : 0;

  if (customerPhone && customerPhone !== "00000000000") {
    try {
      const { data: existing } = await admin
        .from("pos_customers")
        .select("id, visit_count, credit_balance")
        .eq("shop_id", shopId)
        .eq("phone", customerPhone)
        .maybeSingle();
      let customerId: string | null = null;
      if (existing && (existing as { id: string }).id) {
        customerId = (existing as { id: string }).id;
        const prevBal = Number((existing as { credit_balance?: number }).credit_balance) || 0;
        const patch: Record<string, unknown> = {
          visit_count: ((existing as { visit_count?: number }).visit_count || 0) + 1,
          last_order_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (customerName && customerName !== "Walk-in") patch.name = customerName;
        if (creditAmt > 0) patch.credit_balance = prevBal + creditAmt;
        await admin.from("pos_customers").update(patch as never).eq("id", customerId);
      } else {
        const { data: created } = await admin
          .from("pos_customers")
          .insert({
            shop_id: shopId,
            name: customerName,
            phone: customerPhone,
            visit_count: 1,
            last_order_at: new Date().toISOString(),
            credit_balance: creditAmt > 0 ? creditAmt : 0,
          } as never)
          .select("id")
          .single();
        customerId = created ? String((created as { id: string }).id) : null;
      }

      if (creditAmt > 0) {
        await admin.from("pos_credit_ledger").insert({
          shop_id: shopId,
          customer_id: customerId,
          customer_phone: customerPhone,
          customer_name: customerName,
          delta: creditAmt,
          reason: "sale",
          note: "POS udhaar sale",
          order_id: orderId,
        } as never);
      }
    } catch {
      /* optional tables until migration */
    }
  }

  return NextResponse.json({ success: true, order: inserted });
}
