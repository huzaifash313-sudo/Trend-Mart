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
import { computeVariantPricing } from "@/lib/variantPricing";
import { hasPriceTiers, priceForQuantity } from "@/lib/priceTiers";
import { computeDeliveryFee } from "@/lib/deliveryFee";
import { isDealOrderableToday, type ShopDeal } from "@/lib/dealSchedule";
import { sendPushToUser } from "@/lib/webPush";
import type { Order, OrderItem, PriceTier, VariantGroup } from "@/types";

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
  /** Fulfilment channel: 'delivery' (default) or 'pickup'. */
  orderType?: string | null;
  customerLat?: number | null;
  customerLng?: number | null;
  customerCity?: string | null;
  /** Client-generated idempotency token to prevent duplicate orders. */
  idempotencyKey?: string | null;
}

/** Row shape read from `public.shops` (the untyped admin client resolves to `never`). */
interface ShopRow {
  id: string;
  owner_id: string | null;
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
  location: string | null;
  business_hours: string | null;
  operating_status: string | null;
  accepts_delivery: boolean | null;
  accepts_pickup: boolean | null;
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

/** Parse a money value; returns null for invalid (non-numeric) or negative values. */
function toMoney(v: unknown): number | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
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

/**
 * Mark only the referenced variant option(s) unavailable inside the product's
 * `variants` JSON — never the whole product. When a tracked variant runs out
 * during checkout we "Sold Out" just that option (Daraz-style) so the rest of
 * the sizes/flavours stay orderable. Returns a new array (or null if nothing
 * matched / nothing changed).
 */
function markVariantUnavailable(
  variants: VariantGroup[],
  variantLabel: string | undefined,
): VariantGroup[] | null {
  if (!variantLabel || !variants.length) return null;
  const parts = variantLabel.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  let changed = false;
  const next = variants.map((group) => ({
    ...group,
    options: group.options.map((opt) => {
      const match = parts.some((part) => {
        const idx = part.indexOf(":");
        const label = idx > 0 ? part.slice(idx + 1).trim() : part;
        return opt.label === label || `${group.name}: ${opt.label}` === part;
      });
      if (match && opt.is_available !== false) {
        changed = true;
        return { ...opt, is_available: false };
      }
      return opt;
    }),
  }));

  return changed ? next : null;
}

type CoverageMode = "radius" | "city" | "nationwide";

function parseCoverage(zones: string[] | null | undefined): {
  mode: CoverageMode;
  city: string | null;
} {
  const list = zones ?? [];
  for (const z of list) {
    const s = String(z);
    if (s === "__pk_nationwide__" || s.toLowerCase() === "pakistan") {
      return { mode: "nationwide", city: null };
    }
    if (s.startsWith("__pk_city__:")) {
      return { mode: "city", city: s.slice("__pk_city__:".length).trim() || null };
    }
  }
  return { mode: "radius", city: null };
}

function cityMatch(a: string, b: string): boolean {
  const l = a.toLowerCase().trim();
  const r = b.toLowerCase().trim();
  if (!l || !r) return false;
  return l === r || l.includes(r) || r.includes(l);
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
  // Fulfilment channel — delivery or self-pickup. Defaults to delivery for
  // legacy callers; dine_in is created through the dedicated dine-in service.
  const orderType =
    body.orderType === "pickup" ? ("pickup" as const) : ("delivery" as const);
  // Idempotency token: client-generated UUID, unique per checkout attempt.
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 100) : "";

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

  // The service-role client has no generated Database types, so `.rpc()` is
  // typed with `args?: undefined`. Cast it to the loose signature we actually
  // call (atomic coupon increment + product variant stock deduction).
  const adminRpc = admin.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;

  // 3. Read the shop.
  const { data: shopRaw, error: shopErr } = await admin
    .from("shops")
    .select(
      "id, owner_id, name, is_live, verification_status, min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km, latitude, longitude, service_radius_km, delivery_zones, location, business_hours, operating_status, accepts_delivery, accepts_pickup",
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

  // Merchant fulfillment toggles — reject a channel the shop has paused.
  const acceptsDelivery = shopRow.accepts_delivery !== false;
  const acceptsPickup = shopRow.accepts_pickup !== false;
  if (orderType === "delivery" && !acceptsDelivery) {
    return NextResponse.json(
      {
        success: false,
        error: "This shop has paused delivery right now. Try pickup or contact the shop directly.",
      },
      { status: 409 },
    );
  }
  if (orderType === "pickup" && !acceptsPickup) {
    return NextResponse.json(
      {
        success: false,
        error: "This shop has paused pickup right now. Try delivery or contact the shop directly.",
      },
      { status: 409 },
    );
  }
  if (!acceptsDelivery && !acceptsPickup) {
    return NextResponse.json(
      { success: false, error: "This shop has paused all orders right now. Please try again later." },
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
      .select(
        "id, shop_id, name, price, original_price, compare_at_price, is_available, variants, price_tiers, updated_at",
      )
      .in("id", ids),
    admin.from("service_packages").select("id, shop_id, name, price").in("id", ids),
    admin
      .from("shop_deals")
      .select(
        "id, shop_id, title, price, original_price, is_active, schedule_type, weekdays, starts_on, ends_on, day_of_month, product_id",
      )
      .in("id", ids),
  ]);

  const productMap = new Map<
    string,
    {
      id: string;
      shop_id: string;
      name: string;
      price: number | null;
      original_price: number | null;
      is_available: boolean;
      variants: VariantGroup[];
      price_tiers: PriceTier[] | null;
      updated_at?: string;
    }
  >();
  for (const row of (productRes.data ?? []) as Record<string, unknown>[]) {
    const original = toMoney(row.original_price) ?? toMoney(row.compare_at_price) ?? null;
    productMap.set(String(row.id), {
      id: String(row.id),
      shop_id: String(row.shop_id ?? ""),
      name: String(row.name ?? ""),
      price: toMoney(row.price),
      original_price: original,
      is_available: row.is_available !== false,
      variants: (row.variants as VariantGroup[]) ?? [],
      price_tiers: Array.isArray(row.price_tiers)
        ? (row.price_tiers as PriceTier[])
        : null,
      updated_at: row.updated_at as string | undefined,
    });
  }
  const packageMap = new Map<string, { id: string; shop_id: string; name: string; price: number | null }>();
  for (const row of (packageRes.data ?? []) as Record<string, unknown>[]) {
    packageMap.set(String(row.id), {
      id: String(row.id),
      shop_id: String(row.shop_id ?? ""),
      name: String(row.name ?? ""),
      price: toMoney(row.price),
    });
  }

  const dealMap = new Map<
    string,
    {
      id: string;
      shop_id: string;
      title: string;
      price: number;
      original_price: number | null;
      deal: ShopDeal;
    }
  >();
  // Deals linked to a catalog product, keyed by product id. A linked deal's
  // cart/wishlist identity is the product id (see dealCommerceId), so we need
  // this reverse index to re-resolve the deal price at checkout.
  const dealByProductId = new Map<
    string,
    {
      id: string;
      shop_id: string;
      title: string;
      price: number;
      original_price: number | null;
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
      product_id: row.product_id ? String(row.product_id) : null,
      created_at: "",
    };
    const entry = {
      id: deal.id,
      shop_id: deal.shop_id,
      title: deal.title,
      price: toNumber(row.price),
      original_price: toMoney(row.original_price),
      deal,
    };
    dealMap.set(deal.id, entry);
    if (deal.product_id) dealByProductId.set(deal.product_id, entry);
  }

  const resolvedItems: Array<{
    productId: string;
    name: string;
    price: number;
    originalPrice: number | null;
    quantity: number;
    variant?: string;
    variantGroup?: string;
    notes?: string;
    isProduct: boolean;
    variants: VariantGroup[];
    priceTiers?: PriceTier[] | null;
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

      // A deal linked to this product (active + orderable today) sells at the
      // DEAL price, not the catalog base price. Linked deals are variant-less,
      // so this only applies when no variant was selected (a variant pick is a
      // plain product order and keeps its own price).
      const linkedDeal = dealByProductId.get(item.productId);
      if (
        linkedDeal &&
        !item.variant &&
        linkedDeal.deal.is_active &&
        isDealOrderableToday(linkedDeal.deal)
      ) {
        if (!(linkedDeal.price > 0)) {
          return NextResponse.json(
            { success: false, error: `"${linkedDeal.title}" needs a price. Ask the shop to set one.` },
            { status: 409 },
          );
        }
        resolvedItems.push({
          productId: item.productId,
          name: product.name || item.name,
          price: linkedDeal.price,
          originalPrice:
            linkedDeal.original_price != null && linkedDeal.original_price > linkedDeal.price
              ? linkedDeal.original_price
              : null,
          quantity: item.quantity,
          variant: item.variant,
          variantGroup: item.variantGroup,
          notes: item.notes,
          isProduct: false,
          variants: [],
        });
        continue;
      }

      if (variantIsUnavailable(product.variants, item.variant)) {
        return NextResponse.json(
          { success: false, error: `"${product.name}"${item.variant ? ` (${item.variant})` : ""} is not available.` },
          { status: 409 },
        );
      }
      if (product.price == null) {
        return NextResponse.json(
          { success: false, error: `"${product.name}" has an invalid price. Ask the shop to fix it.` },
          { status: 409 },
        );
      }
      // Variant price — server-derived from the stored variants JSON (supports
      // both Daraz-style absolute prices and additive adjustments). Original
      // price is variant-aware too so the bill's strikethrough stays accurate.
      const { price: variantPrice, originalPrice: variantOriginal } = computeVariantPricing(
        product.price ?? 0,
        product.original_price,
        product.variants,
        item.variant,
      );
      resolvedItems.push({
        productId: item.productId,
        name: product.name || item.name,
        price: variantPrice,
        originalPrice: variantOriginal,
        quantity: item.quantity,
        variant: item.variant,
        variantGroup: item.variantGroup,
        notes: item.notes,
        isProduct: true,
        variants: product.variants,
        priceTiers: product.price_tiers,
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
        originalPrice: deal.original_price != null && deal.original_price > deal.price ? deal.original_price : null,
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
      if (pkg.price == null) {
        return NextResponse.json(
          { success: false, error: `"${pkg.name || item.name}" has an invalid price. Ask the shop to fix it.` },
          { status: 409 },
        );
      }
      resolvedItems.push({
        productId: item.productId,
        name: pkg.name || item.name,
        price: pkg.price,
        originalPrice: null,
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

  // 6. Subtotal from authoritative prices — pack/quantity tiers honoured so a
  //    "6 = Rs 1100" bottle never gets billed as 6 × 200 = 1200.
  const subtotal = resolvedItems.reduce((sum, i) => {
    if (hasPriceTiers(i.priceTiers)) {
      return sum + priceForQuantity(i.price, i.priceTiers, i.quantity);
    }
    return sum + i.price * i.quantity;
  }, 0);

  // 7. Delivery-coverage enforcement (radius / city / nationwide).
  //    Skipped entirely for self-pickup — the customer is coming to the shop.
  const radiusKm = toNumber(shopRow.service_radius_km, 0);
  const coverage = parseCoverage(shopRow.delivery_zones);
  const customerCity = typeof body.customerCity === "string" ? body.customerCity.trim() : "";
  const custLat = typeof body.customerLat === "number" ? body.customerLat : null;
  const custLng = typeof body.customerLng === "number" ? body.customerLng : null;
  const hasCustomerCoords =
    custLat != null &&
    custLng != null &&
    Number.isFinite(custLat) &&
    Number.isFinite(custLng);
  const shopLat = toNumber(shopRow.latitude);
  const shopLng = toNumber(shopRow.longitude);
  let distanceKm: number | null = null;
  if (hasCustomerCoords && Number.isFinite(shopLat) && Number.isFinite(shopLng)) {
    distanceKm = haversineKm(custLat, custLng, shopLat, shopLng);
  }

  if (orderType !== "pickup") {
    let coverageError: string | null = null;
    if (coverage.mode === "city") {
      const target = coverage.city || (shopRow.location ?? "");
      if (customerCity && target && !cityMatch(target, customerCity)) {
        coverageError = `This shop only delivers in ${target}.`;
      } else if (!customerCity && distanceKm != null && distanceKm > 35) {
        coverageError = "You appear to be outside this shop's delivery city.";
      }
    } else if (coverage.mode === "radius") {
      if (radiusKm > 0 && distanceKm != null && distanceKm > radiusKm) {
        coverageError = `You are about ${distanceKm.toFixed(1)} km away — this shop only delivers within ${radiusKm} km.`;
      }
    }
    if (coverageError) {
      return NextResponse.json({ success: false, error: coverageError }, { status: 409 });
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

  // 9. Minimum order check — uses PRE-discount subtotal so it matches the
  //     client-side gate (`belowMinimumOrder` in WhatsAppCheckoutModal) and the
  //     merchant's intent ("spend at least Rs. X", not "after coupon").
  const minOrder = toNumber(shopRow.min_order_amount, 0);
  if (minOrder > 0 && subtotal < minOrder) {
    return NextResponse.json(
      {
        success: false,
        error: `Minimum order for this shop is Rs. ${minOrder.toLocaleString()}. Current subtotal is Rs. ${Math.round(subtotal).toLocaleString()}.`,
      },
      { status: 409 },
    );
  }

  // 10. Delivery fee (server-side) — self-pickup is never charged delivery.
  //     Shared helper = exactly what the customer saw in checkout.
  const deliveryFee = computeDeliveryFee({
    flat: toNumber(shopRow.delivery_fee_flat, 0),
    perKm: toNumber(shopRow.delivery_fee_per_km, 0),
    distanceKm,
    freeThreshold: toNumber(shopRow.free_delivery_threshold, 0),
    subtotal,
    isPickup: orderType === "pickup",
  });

  const total = Math.max(0, Math.round((subtotal - discount + deliveryFee) * 100) / 100);

  // 11. Idempotency — if this checkout token already produced an order, return
  //     it instead of creating a duplicate. This MUST run BEFORE any mutation
  //     (coupon increment / stock deduction) so a retry or double-click can
  //     never double-spend a coupon or double-deduct stock.
  if (idempotencyKey) {
    // Scoped to the signed-in user: a leaked token can never be replayed to
    // read another customer's order (name, phone, items).
    const { data: existing } = await admin
      .from("orders")
      .select("id, shop_id, customer_name, customer_phone, items_json, total_amount, subtotal_amount, delivery_fee, discount_amount, coupon_code, order_type, status, created_at, updated_at")
      .eq("client_token", idempotencyKey)
      .eq("customer_user_id", user.id)
      .maybeSingle();
    if (existing) {
      const prior = existing as Record<string, unknown>;
      const priorOrderType = String(prior.order_type ?? "delivery");
      const order: Order = {
        id: String(prior.id),
        shop_id: String(prior.shop_id),
        customer_name: String(prior.customer_name ?? ""),
        customer_phone: String(prior.customer_phone ?? ""),
        items_json: (prior.items_json as OrderItem[]) ?? [],
        total_amount: toNumber(prior.total_amount, 0),
        status: (prior.status as Order["status"]) ?? "Pending",
        order_type:
          priorOrderType === "pickup" || priorOrderType === "dine_in"
            ? (priorOrderType as "pickup" | "dine_in")
            : "delivery",
        subtotal_amount:
          prior.subtotal_amount == null ? undefined : toNumber(prior.subtotal_amount, 0),
        delivery_fee:
          prior.delivery_fee == null ? undefined : toNumber(prior.delivery_fee, 0),
        discount_amount:
          prior.discount_amount == null ? undefined : toNumber(prior.discount_amount, 0),
        coupon_code:
          typeof prior.coupon_code === "string" && prior.coupon_code.trim()
            ? prior.coupon_code.trim()
            : undefined,
        created_at: String(prior.created_at ?? new Date().toISOString()),
        updated_at: prior.updated_at as string | undefined,
      };
      return NextResponse.json({ success: true, order });
    }
  }

  // 12. Atomic coupon redemption — BEFORE insert, so the usage limit can never
  //     be exceeded even under concurrent checkouts (closes the TOCTOU race).
  if (appliedCoupon) {
    let rpcOk: boolean | null = null;
    try {
      const { data: rpcData, error: rpcErr } = await adminRpc(
        "increment_coupon_usage",
        { p_shop_id: shopId, p_code: appliedCoupon },
      );
      if (!rpcErr) rpcOk = rpcData === true;
    } catch {
      rpcOk = null; // RPC missing on legacy DB
    }

    if (rpcOk === false) {
      return NextResponse.json(
        { success: false, error: "This coupon has reached its usage limit." },
        { status: 409 },
      );
    }

    if (rpcOk === null) {
      // Legacy fallback: guarded read-modify-write (non-atomic, best-effort).
      const { data: cur } = await admin
        .from("coupons")
        .select("usage_count, usage_limit")
        .eq("shop_id", shopId)
        .eq("code", appliedCoupon)
        .maybeSingle();
      const row = cur as { usage_count?: number | null; usage_limit?: number | null } | null;
      const current = toNumber(row?.usage_count, 0);
      const limit = toNumber(row?.usage_limit, 0);
      if (limit > 0 && current >= limit) {
        return NextResponse.json(
          { success: false, error: "This coupon has reached its usage limit." },
          { status: 409 },
        );
      }
      let updater = admin
        .from("coupons")
        .update({ usage_count: current + 1 } as never)
        .eq("shop_id", shopId)
        .eq("code", appliedCoupon);
      if (limit > 0) updater = updater.lt("usage_count", limit);
      await updater;
    }
  }

  // 13. SOFT stock deduction — advisory, never blocks checkout.
  //     TrendMart is a WhatsApp-first marketplace: the merchant is the human
  //     gatekeeper who confirms/declines each order in WhatsApp. Digital stock
  //     is only a rough guide (merchants also sell walk-in), so we NEVER reject
  //     an order over a stock number. Instead:
  //       - tracked stock is decremented when available (keeps online count honest)
  //       - if a tracked variant can't cover the order, the product is auto-flagged
  //         "Out of Stock" (so new customers see "Sold Out") but THIS order still
  //         proceeds — the merchant confirms via WhatsApp.
  for (const item of resolvedItems) {
    if (!item.isProduct) continue;
    try {
      const { data: deductOk, error: deductErr } = await adminRpc(
        "deduct_product_variant_stock",
        {
          p_product_id: item.productId,
          p_variant_label: item.variant ?? "",
          p_qty: item.quantity,
        },
      );
      if (!deductErr && deductOk === false) {
        // Insufficient tracked stock for THIS variant: don't block the order,
        // just "Sold Out" that specific option so the rest stay orderable.
        // Re-read the current variants first so we never clobber the stock
        // deductions an earlier line on this same product just committed.
        const { data: fresh } = await admin
          .from("products")
          .select("variants")
          .eq("id", item.productId)
          .maybeSingle();
        const freshVariants =
          ((fresh as { variants?: VariantGroup[] } | null)?.variants as
            | VariantGroup[]
            | undefined) ?? item.variants;
        const updatedVariants = markVariantUnavailable(freshVariants, item.variant);
        if (updatedVariants) {
          await admin
            .from("products")
            .update({ variants: updatedVariants } as never)
            .eq("id", item.productId);
        } else {
          await admin
            .from("products")
            .update({ is_available: false } as never)
            .eq("id", item.productId);
        }
      }
    } catch {
      // RPC missing (old DB) — skip deduction; availability was already checked.
    }
  }

  // 14. Insert the order with the full money breakdown.
  const orderItems: OrderItem[] = resolvedItems.map((i) => {
    // Effective per-unit price so bill lines match the pack/quantity subtotal
    // (e.g. "6 = Rs 1100" → line is 183.33 × 6, subtotal stays exactly 1100).
    let unit = i.price;
    if (hasPriceTiers(i.priceTiers)) {
      unit = priceForQuantity(i.price, i.priceTiers, i.quantity) / i.quantity;
      unit = Math.round(unit * 100) / 100;
    }
    return {
      product_id: i.productId,
      name: i.name,
      price: unit,
      ...(i.originalPrice != null && i.originalPrice > unit
        ? { original_price: i.originalPrice }
        : {}),
      quantity: i.quantity,
      ...(i.variant ? { variant: i.variant } : {}),
      ...(i.notes ? { notes: i.notes } : {}),
    };
  });

  const orderPayload: Record<string, unknown> = {
    shop_id: shopId,
    customer_name: customerName,
    customer_phone: customerPhone,
    items_json: orderItems,
    total_amount: total,
    subtotal_amount: subtotal,
    discount_amount: discount,
    delivery_fee: deliveryFee,
    status: "Pending",
    customer_user_id: user.id,
    order_type: orderType,
  };
  if (notes) orderPayload.notes = notes;
  if (appliedCoupon) orderPayload.coupon_code = appliedCoupon;
  if (idempotencyKey) orderPayload.client_token = idempotencyKey;

  let { data: inserted, error: insertErr } = await admin
    .from("orders")
    .insert(orderPayload as never)
    .select("id, shop_id, customer_name, customer_phone, items_json, total_amount, status, created_at, updated_at, order_type")
    .single();

  // Concurrent-duplicate race: both requests passed the idempotency check, but
  // the DB unique index on client_token only lets one insert through. Return
  // the winning order instead of a confusing 500.
  if (
    insertErr &&
    idempotencyKey &&
    /23505|duplicate key|unique constraint/i.test(insertErr.message || "")
  ) {
    const { data: existing } = await admin
      .from("orders")
      .select("id, shop_id, customer_name, customer_phone, items_json, total_amount, subtotal_amount, delivery_fee, discount_amount, coupon_code, order_type, status, created_at, updated_at")
      .eq("client_token", idempotencyKey)
      .eq("customer_user_id", user.id)
      .maybeSingle();
    if (existing) {
      const prior = existing as Record<string, unknown>;
      const priorOrderType = String(prior.order_type ?? "delivery");
      const order: Order = {
        id: String(prior.id),
        shop_id: String(prior.shop_id),
        customer_name: String(prior.customer_name ?? ""),
        customer_phone: String(prior.customer_phone ?? ""),
        items_json: (prior.items_json as OrderItem[]) ?? [],
        total_amount: toNumber(prior.total_amount, 0),
        status: (prior.status as Order["status"]) ?? "Pending",
        order_type:
          priorOrderType === "pickup" || priorOrderType === "dine_in"
            ? (priorOrderType as "pickup" | "dine_in")
            : "delivery",
        subtotal_amount:
          prior.subtotal_amount == null ? undefined : toNumber(prior.subtotal_amount, 0),
        delivery_fee:
          prior.delivery_fee == null ? undefined : toNumber(prior.delivery_fee, 0),
        discount_amount:
          prior.discount_amount == null ? undefined : toNumber(prior.discount_amount, 0),
        coupon_code:
          typeof prior.coupon_code === "string" && prior.coupon_code.trim()
            ? prior.coupon_code.trim()
            : undefined,
        created_at: String(prior.created_at ?? new Date().toISOString()),
        updated_at: prior.updated_at as string | undefined,
      };
      return NextResponse.json({ success: true, order });
    }
  }

  // Older DBs may lack the money-breakdown / coupon_code columns — retry with
  // core fields so checkout still works and coupon orders don't 500.
  if (insertErr && /column .* does not exist|PGRST204|schema cache|Could not find/i.test(insertErr.message || "")) {
    const corePayload: Record<string, unknown> = {
      shop_id: shopId,
      customer_name: customerName,
      customer_phone: customerPhone,
      items_json: orderItems,
      total_amount: total,
      status: "Pending",
      customer_user_id: user.id,
      order_type: orderType,
    };
    if (notes) corePayload.notes = notes;
    if (idempotencyKey) corePayload.client_token = idempotencyKey;
    ({ data: inserted, error: insertErr } = await admin
      .from("orders")
      .insert(corePayload as never)
      .select("id, shop_id, customer_name, customer_phone, items_json, total_amount, status, created_at, updated_at, order_type")
      .single());
  }

  if (insertErr || !inserted) {
    return NextResponse.json(
      { success: false, error: "Could not place your order. Please try again." },
      { status: 500 },
    );
  }

  const order: Order = {
    id: String((inserted as Record<string, unknown>).id),
    shop_id: String((inserted as Record<string, unknown>).shop_id),
    customer_name: String((inserted as Record<string, unknown>).customer_name ?? ""),
    customer_phone: String((inserted as Record<string, unknown>).customer_phone ?? ""),
    items_json: ((inserted as Record<string, unknown>).items_json as OrderItem[]) ?? orderItems,
    total_amount: toNumber((inserted as Record<string, unknown>).total_amount, total),
    status: "Pending",
    order_type: orderType,
    subtotal_amount: subtotal,
    delivery_fee: deliveryFee,
    discount_amount: discount,
    coupon_code: appliedCoupon ?? undefined,
    created_at: String((inserted as Record<string, unknown>).created_at ?? new Date().toISOString()),
    updated_at: (inserted as Record<string, unknown>).updated_at as string | undefined,
  };

  // Notify merchant + customer via OS web push (best-effort, never blocks the
  // order response). This covers the trusted checkout path end-to-end.
  const amountLabel = `Rs. ${Math.round(total).toLocaleString()}`;
  const shopName = (shopRow.name ?? "your shop").trim() || "your shop";
  void (async () => {
    if (shopRow.owner_id) {
      await sendPushToUser(shopRow.owner_id, {
        title: "New TrendMart order",
        body: `${customerName} placed an order — ${amountLabel} at ${shopName}.`,
        url: "/dashboard/orders",
        tag: `order-${order.id}`,
      });
    }
    await sendPushToUser(user.id, {
      title: "Order placed on TrendMart",
      body: `Your order at ${shopName} was received (${amountLabel}).`,
      url: `/orders/tracking?orderId=${encodeURIComponent(order.id)}`,
      tag: `order-${order.id}-customer`,
    });
  })().catch(() => undefined);

  return NextResponse.json({ success: true, order });
}
