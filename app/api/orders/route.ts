/* -------------------------------------------------------------------------- */
/*  TrendMart — Server-Side Order Placement (POST /api/orders)                */
/*                                                                             */
/*  The single trusted entry point for creating orders. Replaces the previous  */
/*  client-side insert (which trusted client-supplied prices and could never   */
/*  actually deduct stock because of products_owner_update RLS).               */
/*                                                                             */
/*  What this route does, in order:                                             */
/*    1. Requires a signed-in user with a confirmed email.                     */
/*    2. Reads the shop and re-validates live/approved/hours/radius/min-order. */
/*    3. Re-reads every line's authoritative price from `products`,            */
/*       `shop_deals` (standalone deals), or `service_packages`.               */
/*    4. Re-validates variant stock and atomically-ish deducts it via the      */
/*       service-role client (which bypasses RLS).                             */
/*    5. Re-validates the coupon and delivery fee server-side.                 */
/*    6. Inserts the order with the service-role client.                       */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizePkPhoneDigits, isValidUUID } from "@/lib/sanitization";
import { getShopHoursSummary } from "@/lib/shopHours";
import { isDealOrderableToday, type ShopDeal } from "@/lib/dealSchedule";
import type { Order, OrderItem, VariantGroup } from "@/types";

export const runtime = "nodejs";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface OrderItemInput {
  productId?: string | null;
  name?: string | null;
  price?: number | null;
  quantity?: number | null;
  variant?: string | null;
  variantGroup?: string | null;
  notes?: string | null;
}

interface OrderRequestBody {
  shopId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  items?: OrderItemInput[] | null;
  couponCode?: string | null;
  notes?: string | null;
  customerLat?: number | null;
  customerLng?: number | null;
}

/** Row shape read from `public.shops` (the untyped admin client resolves to `never`). */
interface ShopRow {
  id: string;
  name: string | null;
  is_live: boolean | null;
  verification_status: string | null;
  min_order_amount: number | null;
  free_delivery_threshold: number | null;
  delivery_fee_flat: number | null;
  delivery_fee_per_km: number | null;
  latitude: number | null;
  longitude: number | null;
  service_radius_km: number | null;
  delivery_zones: string[] | null;
  business_hours: string | null;
  operating_status: string | null;
}

/** Row shape read from `public.coupons`. */
interface CouponRow {
  code: string | null;
  discount_percent: number | null;
  discount_amount: number | null;
  expiry_date: string | null;
  is_active: boolean | null;
  min_order_amount?: number | null;
  usage_limit?: number | null;
  usage_count?: number | null;
}

/* ─── Small pure helpers ────────────────────────────────────────────────────── */

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number | null {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) return null;
  if (lng1 < -180 || lng1 > 180 || lng2 < -180 || lng2 > 180) return null;
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000) / 1000;
}

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampQuantity(v: unknown): number {
  const n = Math.round(toNumber(v, 1));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 99);
}

function sanitizeText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/<[^>]*>/g, "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, max);
}

function variantIsUnavailable(
  variants: VariantGroup[],
  variantLabel: string | undefined,
): boolean {
  if (!variantLabel || !variants.length) return false;
  const parts = variantLabel.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf(":");
    const label = idx > 0 ? part.slice(idx + 1).trim() : part;
    for (const group of variants) {
      for (const opt of group.options) {
        if (opt.label === label || `${group.name}: ${opt.label}` === part) {
          if (opt.is_available === false) return true;
        }
      }
    }
  }
  return false;
}

/* ─── POST handler ──────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  let body: OrderRequestBody;
  try {
    body = (await request.json()) as OrderRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  // 1. Authentication — verified email required.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Sign in to place an order." },
      { status: 401 },
    );
  }
  if (!user.email_confirmed_at) {
    return NextResponse.json(
      { success: false, error: "Verify your email before placing an order." },
      { status: 401 },
    );
  }

  // 2. Validate shape.
  const shopId = typeof body.shopId === "string" ? body.shopId.trim() : "";
  const customerName = sanitizeText(body.customerName, 100);
  const customerPhoneRaw = sanitizeText(body.customerPhone, 30);
  const customerPhone =
    normalizePkPhoneDigits(customerPhoneRaw) || customerPhoneRaw.replace(/\D/g, "");
  const notes = sanitizeText(body.notes, 500);

  if (!isValidUUID(shopId)) {
    return NextResponse.json({ success: false, error: "Invalid shop." }, { status: 400 });
  }
  if (customerName.length < 2) {
    return NextResponse.json({ success: false, error: "Customer name is required." }, { status: 400 });
  }
  if (customerPhone.length < 10) {
    return NextResponse.json(
      { success: false, error: "A valid customer phone number is required." },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ success: false, error: "Your cart is empty." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Checkout is temporarily unavailable." },
      { status: 503 },
    );
  }

  // 3. Read the shop.
  const { data: shopRaw, error: shopErr } = await admin
    .from("shops")
    .select(
      "id, name, is_live, verification_status, min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km, latitude, longitude, service_radius_km, delivery_zones, business_hours, operating_status",
    )
    .eq("id", shopId)
    .maybeSingle();
  const shopRow = shopRaw as unknown as ShopRow | null;
  if (shopErr || !shopRow) {
    return NextResponse.json({ success: false, error: "Shop not found." }, { status: 404 });
  }
  if (shopRow.is_live === false) {
    return NextResponse.json(
      { success: false, error: "This shop is currently offline and cannot accept orders." },
      { status: 409 },
    );
  }
  if ((shopRow.verification_status ?? "approved") !== "approved") {
    return NextResponse.json(
      { success: false, error: "This shop is not currently accepting orders." },
      { status: 409 },
    );
  }

  const hours = getShopHoursSummary({
    business_hours: shopRow.business_hours as string | null,
    operating_status: shopRow.operating_status as string | null,
  });
  if (hours.state === "closed") {
    return NextResponse.json(
      { success: false, error: `This shop is closed right now (${hours.hoursText}).` },
      { status: 409 },
    );
  }

  // 4. Normalise items.
  const items: Array<{
    productId: string;
    name: string;
    quantity: number;
    variant?: string;
    variantGroup?: string;
    notes?: string;
  }> = [];
  for (const raw of body.items) {
    const productId = typeof raw?.productId === "string" ? raw.productId.trim() : "";
    if (!productId || !isValidUUID(productId)) {
      return NextResponse.json(
        { success: false, error: "One or more cart items are invalid. Please refresh and try again." },
        { status: 400 },
      );
    }
    items.push({
      productId,
      name: sanitizeText(raw.name, 200) || "Item",
      quantity: clampQuantity(raw.quantity),
      variant: raw.variant ? sanitizeText(raw.variant, 100) : undefined,
      variantGroup: raw.variantGroup ? sanitizeText(raw.variantGroup, 50) : undefined,
      notes: raw.notes ? sanitizeText(raw.notes, 200) : undefined,
    });
  }

  // 5. Resolve authoritative prices from products, standalone shop deals, and/or service_packages.
  const ids = [...new Set(items.map((i) => i.productId))];
  const [productRes, packageRes, dealRes] = await Promise.all([
    admin
      .from("products")
      .select("id, shop_id, name, price, is_available, variants, updated_at")
      .in("id", ids),
    admin.from("service_packages").select("id, shop_id, name, price").in("id", ids),
    admin
      .from("shop_deals")
      .select(
        "id, shop_id, title, price, is_active, schedule_type, weekdays, starts_on, ends_on, day_of_month",
      )
      .in("id", ids),
  ]);

  const productMap = new Map<
    string,
    { id: string; shop_id: string; name: string; price: number; is_available: boolean; variants: VariantGroup[]; updated_at?: string }
  >();
  for (const row of (productRes.data ?? []) as Record<string, unknown>[]) {
    productMap.set(String(row.id), {
      id: String(row.id),
      shop_id: String(row.shop_id ?? ""),
      name: String(row.name ?? ""),
      price: toNumber(row.price),
      is_available: row.is_available !== false,
      variants: (row.variants as VariantGroup[]) ?? [],
      updated_at: row.updated_at as string | undefined,
    });
  }
  const packageMap = new Map<string, { id: string; shop_id: string; name: string; price: number }>();
  for (const row of (packageRes.data ?? []) as Record<string, unknown>[]) {
    packageMap.set(String(row.id), {
      id: String(row.id),
      shop_id: String(row.shop_id ?? ""),
      name: String(row.name ?? ""),
      price: toNumber(row.price),
    });
  }

  const dealMap = new Map<
    string,
    {
      id: string;
      shop_id: string;
      title: string;
      price: number;
      deal: ShopDeal;
    }
  >();
  for (const row of (dealRes.data ?? []) as Record<string, unknown>[]) {
    const scheduleType = String(row.schedule_type ?? "weekly");
    const deal: ShopDeal = {
      id: String(row.id),
      shop_id: String(row.shop_id ?? ""),
      title: String(row.title ?? "Deal"),
      description: null,
      schedule_type:
        scheduleType === "date_range" || scheduleType === "monthly" ? scheduleType : "weekly",
      weekdays: Array.isArray(row.weekdays) ? (row.weekdays as number[]) : null,
      starts_on: row.starts_on ? String(row.starts_on) : null,
      ends_on: row.ends_on ? String(row.ends_on) : null,
      day_of_month: row.day_of_month != null ? Number(row.day_of_month) : null,
      is_active: row.is_active !== false,
      created_at: "",
    };
    dealMap.set(deal.id, {
      id: deal.id,
      shop_id: deal.shop_id,
      title: deal.title,
      price: toNumber(row.price),
      deal,
    });
  }

  const resolvedItems: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    variant?: string;
    variantGroup?: string;
    notes?: string;
    isProduct: boolean;
    variants: VariantGroup[];
    updated_at?: string;
  }> = [];

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (product) {
      if (product.shop_id !== shopId) {
        return NextResponse.json(
          { success: false, error: "Cart contains an item from another shop." },
          { status: 400 },
        );
      }
      if (!product.is_available) {
        return NextResponse.json(
          { success: false, error: `"${product.name}" is currently out of stock.` },
          { status: 409 },
        );
      }
      if (variantIsUnavailable(product.variants, item.variant)) {
        return NextResponse.json(
          { success: false, error: `"${product.name}"${item.variant ? ` (${item.variant})` : ""} is not available.` },
          { status: 409 },
        );
      }
      resolvedItems.push({
        productId: item.productId,
        name: product.name || item.name,
        price: product.price,
        quantity: item.quantity,
        variant: item.variant,
        variantGroup: item.variantGroup,
        notes: item.notes,
        isProduct: true,
        variants: product.variants,
        updated_at: product.updated_at,
      });
      continue;
    }

    const deal = dealMap.get(item.productId);
    if (deal) {
      if (deal.shop_id !== shopId) {
        return NextResponse.json(
          { success: false, error: "Cart contains an item from another shop." },
          { status: 400 },
        );
      }
      if (!deal.deal.is_active || !isDealOrderableToday(deal.deal)) {
        return NextResponse.json(
          { success: false, error: `"${deal.title}" is not available to order today.` },
          { status: 409 },
        );
      }
      if (!(deal.price > 0)) {
        return NextResponse.json(
          { success: false, error: `"${deal.title}" needs a price. Ask the shop to set one.` },
          { status: 409 },
        );
      }
      resolvedItems.push({
        productId: item.productId,
        name: deal.title || item.name,
        price: deal.price,
        quantity: item.quantity,
        variant: item.variant,
        variantGroup: item.variantGroup,
        notes: item.notes,
        isProduct: false,
        variants: [],
      });
      continue;
    }

    const pkg = packageMap.get(item.productId);
    if (pkg) {
      if (pkg.shop_id !== shopId) {
        return NextResponse.json(
          { success: false, error: "Cart contains an item from another shop." },
          { status: 400 },
        );
      }
      resolvedItems.push({
        productId: item.productId,
        name: pkg.name || item.name,
        price: pkg.price,
        quantity: item.quantity,
        variant: item.variant,
        variantGroup: item.variantGroup,
        notes: item.notes,
        isProduct: false,
        variants: [],
      });
      continue;
    }

    return NextResponse.json(
      { success: false, error: "One or more items are no longer available." },
      { status: 409 },
    );
  }

  // 6. Subtotal from authoritative prices.
  const subtotal = resolvedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // 7. Radius enforcement (only when GPS + a numeric service radius exist).
  const radiusKm = toNumber(shopRow.service_radius_km, 0);
  const zones = Array.isArray(shopRow.delivery_zones) ? (shopRow.delivery_zones as string[]) : [];
  const isNationwide = zones.some((z) => /pakistan|nationwide|all/i.test(String(z)));
  const custLat = typeof body.customerLat === "number" ? body.customerLat : null;
  const custLng = typeof body.customerLng === "number" ? body.customerLng : null;
  let distanceKm: number | null = null;
  if (
    !isNationwide &&
    radiusKm > 0 &&
    custLat != null &&
    custLng != null &&
    Number.isFinite(custLat) &&
    Number.isFinite(custLng) &&
    Number.isFinite(toNumber(shopRow.latitude)) &&
    Number.isFinite(toNumber(shopRow.longitude))
  ) {
    distanceKm = haversineKm(
      custLat,
      custLng,
      toNumber(shopRow.latitude),
      toNumber(shopRow.longitude),
    );
    if (distanceKm != null && distanceKm > radiusKm) {
      return NextResponse.json(
        {
          success: false,
          error: `You are about ${distanceKm.toFixed(1)} km away — this shop only delivers within ${radiusKm} km.`,
        },
        { status: 409 },
      );
    }
  }

  // 8. Coupon validation (server-side).
  let discount = 0;
  let appliedCoupon: string | null = null;
  const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim().toUpperCase().slice(0, 20) : "";
  if (couponCode) {
    const { data: couponRaw } = await admin
      .from("coupons")
      .select("code, discount_percent, discount_amount, expiry_date, is_active, min_order_amount, usage_limit, usage_count")
      .eq("shop_id", shopId)
      .eq("code", couponCode)
      .eq("is_active", true)
      .maybeSingle();
    const coupon = couponRaw as unknown as CouponRow | null;
    if (coupon) {
      const expired =
        coupon.expiry_date && new Date(coupon.expiry_date).getTime() <= Date.now();
      const minCouponOrder = toNumber(coupon.min_order_amount, 0);
      const usageLimit = toNumber(coupon.usage_limit, 0);
      const usageCount = toNumber(coupon.usage_count, 0);
      if (expired) {
        discount = 0;
      } else if (minCouponOrder > 0 && subtotal < minCouponOrder) {
        return NextResponse.json(
          {
            success: false,
            error: `This coupon needs a minimum order of Rs. ${minCouponOrder.toLocaleString()}.`,
          },
          { status: 409 },
        );
      } else if (usageLimit > 0 && usageCount >= usageLimit) {
        return NextResponse.json(
          { success: false, error: "This coupon has reached its usage limit." },
          { status: 409 },
        );
      } else {
        if (toNumber(coupon.discount_percent, 0) > 0) {
          discount = Math.round(subtotal * (toNumber(coupon.discount_percent) / 100));
        } else if (toNumber(coupon.discount_amount, 0) > 0) {
          discount = toNumber(coupon.discount_amount);
        }
        discount = Math.min(discount, subtotal);
        appliedCoupon = couponCode;
      }
    }
  }

  const discountedSubtotal = Math.max(0, subtotal - discount);

  // 9. Minimum order check.
  const minOrder = toNumber(shopRow.min_order_amount, 0);
  if (minOrder > 0 && discountedSubtotal < minOrder) {
    return NextResponse.json(
      {
        success: false,
        error: `Minimum order for this shop is Rs. ${minOrder.toLocaleString()}. Current subtotal is Rs. ${Math.round(discountedSubtotal).toLocaleString()}.`,
      },
      { status: 409 },
    );
  }

  // 10. Delivery fee (server-side).
  const freeThreshold = toNumber(shopRow.free_delivery_threshold, 0);
  let deliveryFee = 0;
  if (!(freeThreshold > 0 && subtotal >= freeThreshold)) {
    const flat = toNumber(shopRow.delivery_fee_flat, 0);
    const perKm = toNumber(shopRow.delivery_fee_per_km, 0);
    deliveryFee =
      Math.round((flat + (perKm > 0 && distanceKm != null ? perKm * distanceKm : 0)) * 100) / 100;
  }

  const total = Math.max(0, Math.round((subtotal - discount + deliveryFee) * 100) / 100);

  // 11. Availability is already checked (In Stock / Out of Stock / Not available).
  // Exact unit counts are not deducted — merchants sell both in-store and online.

  // 12. Insert the order.
  const orderItems: OrderItem[] = resolvedItems.map((i) => ({
    product_id: i.productId,
    name: i.name,
    price: i.price,
    quantity: i.quantity,
    ...(i.variant ? { variant: i.variant } : {}),
    ...(i.notes ? { notes: i.notes } : {}),
  }));

  const orderPayload: Record<string, unknown> = {
    shop_id: shopId,
    customer_name: customerName,
    customer_phone: customerPhone,
    items_json: orderItems,
    total_amount: total,
    status: "Pending",
    customer_user_id: user.id,
  };
  if (notes) orderPayload.notes = notes;
  if (appliedCoupon) orderPayload.coupon_code = appliedCoupon;

  const { data: inserted, error: insertErr } = await admin
    .from("orders")
    .insert(orderPayload as never)
    .select("id, shop_id, customer_name, customer_phone, items_json, total_amount, status, created_at, updated_at")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { success: false, error: "Could not place your order. Please try again." },
      { status: 500 },
    );
  }

  if (appliedCoupon) {
    const { data: usedRaw } = await admin
      .from("coupons")
      .select("usage_count")
      .eq("shop_id", shopId)
      .eq("code", appliedCoupon)
      .maybeSingle();
    const used = toNumber((usedRaw as { usage_count?: number } | null)?.usage_count, 0);
    await admin
      .from("coupons")
      .update({ usage_count: used + 1 } as never)
      .eq("shop_id", shopId)
      .eq("code", appliedCoupon);
  }

  const order: Order = {
    id: String((inserted as Record<string, unknown>).id),
    shop_id: String((inserted as Record<string, unknown>).shop_id),
    customer_name: String((inserted as Record<string, unknown>).customer_name ?? ""),
    customer_phone: String((inserted as Record<string, unknown>).customer_phone ?? ""),
    items_json: ((inserted as Record<string, unknown>).items_json as OrderItem[]) ?? orderItems,
    total_amount: toNumber((inserted as Record<string, unknown>).total_amount, total),
    status: "Pending",
    created_at: String((inserted as Record<string, unknown>).created_at ?? new Date().toISOString()),
    updated_at: (inserted as Record<string, unknown>).updated_at as string | undefined,
  };

  return NextResponse.json({ success: true, order });
}
