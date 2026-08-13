/* -------------------------------------------------------------------------- */
/*  TrendMart — Coupon / Promo Code Service                                    */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface Coupon {
  id: string;
  shop_id: string;
  code: string;
  discount_percent: number | null;
  discount_amount: number | null;
  expiry_date: string | null;
  is_active: boolean;
  created_at: string;
  /** Minimum subtotal (PKR) required. Null/0 = no minimum. */
  min_order_amount?: number | null;
  /** Max redemptions. Null/0 = unlimited. */
  usage_limit?: number | null;
  /** How many times this code has been used. */
  usage_count?: number | null;
}

export interface CouponValidation {
  valid: boolean;
  coupon?: Coupon;
  discountAmount?: number; // absolute discount in PKR
  message?: string;
}

/* -------------------------------------------------------------------------- */
/*  CRUD                                                                       */
/* -------------------------------------------------------------------------- */

export async function createCoupon(
  shopId: string,
  code: string,
  discountPercent?: number,
  discountAmount?: number,
  expiryDate?: string,
  extras?: { minOrderAmount?: number; usageLimit?: number },
): Promise<ServiceResult<Coupon>> {
  const supabase = createClient();
  const minOrder =
    extras?.minOrderAmount && extras.minOrderAmount > 0 ? extras.minOrderAmount : null;
  const usageLimit =
    extras?.usageLimit && extras.usageLimit > 0 ? Math.round(extras.usageLimit) : null;

  const base = {
    shop_id: shopId,
    code: code.toUpperCase().trim(),
    discount_percent: discountPercent ?? null,
    discount_amount: discountAmount ?? null,
    expiry_date: expiryDate ?? null,
    is_active: true,
    usage_count: 0,
  };

  try {
    const full = { ...base, min_order_amount: minOrder, usage_limit: usageLimit };
    const first = await supabase.from("coupons").insert(full).select().single();
    if (!first.error) {
      return { success: true, data: first.data as Coupon };
    }

    // Older DBs may lack min_order_amount — retry with usage columns only.
    const retry = await supabase
      .from("coupons")
      .insert({ ...base, usage_limit: usageLimit })
      .select()
      .single();
    if (retry.error) throw retry.error;
    return { success: true, data: retry.data as Coupon };
  } catch (err) {
    logError(err, { module: "couponService.createCoupon", meta: { shopId, code } });
    return { success: false, error: toError(err) };
  }
}

export async function fetchCouponsByShopId(
  shopId: string,
): Promise<ServiceResult<Coupon[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as Coupon[]) ?? [] };
  } catch (err) {
    logError(err, { module: "couponService.fetchCouponsByShopId", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

export async function updateCouponStatus(
  couponId: string,
  isActive: boolean,
): Promise<ServiceResult<Coupon>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("coupons")
      .update({ is_active: isActive })
      .eq("id", couponId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as Coupon };
  } catch (err) {
    logError(err, { module: "couponService.updateCouponStatus", meta: { couponId, isActive } });
    return { success: false, error: toError(err) };
  }
}

export async function deleteCoupon(
  couponId: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("coupons")
      .delete()
      .eq("id", couponId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "couponService.deleteCoupon", meta: { couponId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Batch-fetch active, non-expired coupons for many shops (homepage ticker).
 * Returns a map of shop_id → coupons (max a few per shop for the card strip).
 */
export async function fetchActiveCouponsForShops(
  shopIds: string[],
): Promise<ServiceResult<Record<string, Coupon[]>>> {
  const supabase = createClient();
  const unique = [...new Set(shopIds.filter(Boolean))];
  if (unique.length === 0) return { success: true, data: {} };

  try {
    const now = Date.now();
    const { data, error } = await supabase
      .from("coupons")
      .select(
        "id, shop_id, code, discount_percent, discount_amount, expiry_date, is_active, created_at",
      )
      .in("shop_id", unique)
      .eq("is_active", true);

    if (error) throw error;

    const map: Record<string, Coupon[]> = {};
    for (const row of (data as Coupon[]) ?? []) {
      if (row.expiry_date) {
        const end = new Date(row.expiry_date).getTime();
        if (!Number.isNaN(end) && end <= now) continue;
      }
      const list = map[row.shop_id] ?? [];
      if (list.length >= 3) continue;
      list.push(row);
      map[row.shop_id] = list;
    }
    return { success: true, data: map };
  } catch (err) {
    logError(err, { module: "couponService.fetchActiveCouponsForShops", meta: { count: unique.length } });
    return { success: false, error: toError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validate a coupon code for a given shop and subtotal.
 * Returns the discount amount in PKR if valid.
 */
export async function validateCoupon(
  shopId: string,
  code: string,
  subtotal: number,
): Promise<CouponValidation> {
  const supabase = createClient();
  try {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return { valid: false, message: "Please enter a coupon code." };

    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("shop_id", shopId)
      .eq("code", trimmed)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      return { valid: false, message: "Invalid or expired coupon code." };
    }

    const coupon = data as Coupon;

    // Check expiry
    if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) {
      return { valid: false, message: "This coupon has expired." };
    }

    const minOrder = Number(coupon.min_order_amount ?? 0);
    if (minOrder > 0 && subtotal < minOrder) {
      return {
        valid: false,
        message: `This coupon needs a minimum order of Rs. ${minOrder.toLocaleString()}.`,
      };
    }

    const limit = Number(coupon.usage_limit ?? 0);
    const used = Number(coupon.usage_count ?? 0);
    if (limit > 0 && used >= limit) {
      return { valid: false, message: "This coupon has reached its usage limit." };
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discount_percent) {
      discountAmount = Math.round(subtotal * (coupon.discount_percent / 100));
    } else if (coupon.discount_amount) {
      discountAmount = coupon.discount_amount;
    }

    if (discountAmount > subtotal) {
      discountAmount = subtotal;
    }

    return {
      valid: true,
      coupon,
      discountAmount,
      message: `Discount: Rs. ${discountAmount.toLocaleString()} (${coupon.discount_percent ? `${coupon.discount_percent}%` : `Rs. ${coupon.discount_amount}`} off)`,
    };
  } catch (err) {
    logError(err, { module: "couponService.validateCoupon", meta: { shopId, code } });
    return { valid: false, message: "Error validating coupon. Please try again." };
  }
}