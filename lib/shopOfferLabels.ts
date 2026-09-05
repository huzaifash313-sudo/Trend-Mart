/* Shared shop offer ticker labels — coupons, delivery, deals. */

import { isOfferActive } from "@/lib/shopOfferTicker";
import { describeDeliveryPricing } from "@/lib/deliveryFee";
import type { Coupon } from "@/services/couponService";

export function buildDeliveryTickerLabel(input: {
  freeDeliveryThreshold?: number | null;
  freeDeliveryRadiusKm?: number | null;
  deliveryFeeFlat?: number | null;
  deliveryFeePerKm?: number | null;
}): string | null {
  return describeDeliveryPricing(input);
}

export function formatCouponTickerLabels(
  coupons: Array<Pick<
    Coupon,
    "code" | "discount_percent" | "discount_amount" | "expiry_date" | "is_active"
  >>,
): string[] {
  const labels: string[] = [];
  for (const c of coupons) {
    if (c.is_active === false) continue;
    if (!isOfferActive(c.expiry_date)) continue;
    const code = (c.code || "").trim().toUpperCase();
    if (!code) continue;
    let deal = "";
    if (c.discount_percent != null && c.discount_percent > 0) {
      deal = `${c.discount_percent}% OFF`;
    } else if (c.discount_amount != null && c.discount_amount > 0) {
      deal = `Rs. ${Math.round(c.discount_amount).toLocaleString()} OFF`;
    }
    const label = deal ? `Code ${code} · ${deal}` : `Code ${code}`;
    if (!labels.some((t) => t.toLowerCase() === label.toLowerCase())) {
      labels.push(label);
    }
  }
  return labels;
}

export interface ShopTickerInput {
  dealLabels?: string[];
  couponLabels?: string[];
  coupons?: Array<Pick<
    Coupon,
    "code" | "discount_percent" | "discount_amount" | "expiry_date" | "is_active"
  >>;
  freeDeliveryThreshold?: number | null;
  freeDeliveryRadiusKm?: number | null;
  deliveryFeeFlat?: number | null;
  deliveryFeePerKm?: number | null;
}

/**
 * Ticker lines for product OR deal cards.
 * Coupons + delivery always included when set — even if the item itself isn't “on deal”.
 */
export function buildShopTickerTags(input: ShopTickerInput): string[] {
  const tags: string[] = [];

  const couponLabels = [
    ...(input.couponLabels ?? []),
    ...formatCouponTickerLabels(input.coupons ?? []),
  ];
  for (const label of couponLabels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    const short = trimmed.length > 36 ? `${trimmed.slice(0, 34)}…` : trimmed;
    if (!tags.some((t) => t.toLowerCase() === short.toLowerCase())) tags.push(short);
  }

  const delivery = buildDeliveryTickerLabel({
    freeDeliveryThreshold: input.freeDeliveryThreshold,
    freeDeliveryRadiusKm: input.freeDeliveryRadiusKm,
    deliveryFeeFlat: input.deliveryFeeFlat,
    deliveryFeePerKm: input.deliveryFeePerKm,
  });
  if (delivery) {
    const short = delivery.length > 42 ? `${delivery.slice(0, 40)}…` : delivery;
    if (!tags.some((t) => t.toLowerCase() === short.toLowerCase())) {
      tags.push(short);
    }
  }

  for (const label of input.dealLabels ?? []) {
    if (!label) continue;
    const short = label.length > 32 ? `${label.slice(0, 30)}…` : label;
    if (!tags.some((t) => t.toLowerCase() === short.toLowerCase())) tags.push(short);
  }

  return tags;
}
