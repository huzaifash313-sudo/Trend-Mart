/* Shop card offer ticker — coupons, free delivery, scheduled deals. */

import {
  isDealActiveOnDate,
  toPkDateKey,
  formatDealDisplayLabel,
  type ShopDeal,
} from "@/lib/dealSchedule";

export type ShopOfferSlideKind = "deal" | "free_delivery" | "coupon";

export interface ShopOfferSlide {
  id: string;
  kind: ShopOfferSlideKind;
  label: string;
  /** ISO timestamp; omit / null = no countdown */
  expiresAt?: string | null;
}

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export function formatOfferRemaining(expiresAt: string | null | undefined, now = Date.now()): string | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return null;
  const remaining = end - now;
  if (remaining <= 0) return null;

  if (remaining > TWO_DAYS_MS) {
    const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  const totalMinutes = Math.floor(remaining / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
  }
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes}m`;
}

export function isOfferActive(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return true;
  return end > now;
}

export interface BuildShopOfferSlidesInput {
  shopId: string;
  /** @deprecated Free-text shop announcement is no longer shown on product stamps. */
  announcement?: string | null;
  announcementExpiresAt?: string | null;
  freeDeliveryThreshold?: number | null;
  /** Deliver FREE within this many km of the shop pin (0/null = off). */
  freeDeliveryRadiusKm?: number | null;
  coupons?: Array<{
    id: string;
    code: string;
    discount_percent?: number | null;
    discount_amount?: number | null;
    expiry_date?: string | null;
    is_active?: boolean;
  }>;
  deals?: ShopDeal[];
  /** Calendar day (YYYY-MM-DD) used to pick which deals are “on” today */
  forDateKey?: string;
}

export function buildShopOfferSlides(input: BuildShopOfferSlidesInput, now = Date.now()): ShopOfferSlide[] {
  const slides: ShopOfferSlide[] = [];
  const dateKey = input.forDateKey ?? toPkDateKey(new Date(now));

  const deals = input.deals ?? [];
  for (const deal of deals) {
    if (!deal.is_active) continue;
    if (!isDealActiveOnDate(deal, dateKey)) continue;
    slides.push({
      id: `${input.shopId}-deal-${deal.id}`,
      kind: "deal",
      label: formatDealDisplayLabel(deal),
      expiresAt: deal.schedule_type === "date_range" ? deal.ends_on : null,
    });
  }

  const threshold = input.freeDeliveryThreshold;
  if (threshold != null && threshold > 0) {
    slides.push({
      id: `${input.shopId}-fd`,
      kind: "free_delivery",
      label: `Free delivery above Rs. ${Math.round(threshold).toLocaleString()}`,
      expiresAt: null,
    });
  }

  const radiusKm = input.freeDeliveryRadiusKm;
  if (radiusKm != null && radiusKm > 0) {
    slides.push({
      id: `${input.shopId}-fdr`,
      kind: "free_delivery",
      label: `FREE delivery within ${radiusKm} km`,
      expiresAt: null,
    });
  }

  const coupons = input.coupons ?? [];
  for (const c of coupons) {
    if (c.is_active === false) continue;
    if (!isOfferActive(c.expiry_date, now)) continue;
    const code = (c.code || "").trim().toUpperCase();
    if (!code) continue;
    let deal = "";
    if (c.discount_percent != null && c.discount_percent > 0) {
      deal = `${c.discount_percent}% OFF`;
    } else if (c.discount_amount != null && c.discount_amount > 0) {
      deal = `Rs. ${Math.round(c.discount_amount).toLocaleString()} OFF`;
    }
    slides.push({
      id: `${input.shopId}-coupon-${c.id}`,
      kind: "coupon",
      label: deal ? `Code ${code} · ${deal}` : `Code ${code}`,
      expiresAt: c.expiry_date ?? null,
    });
  }

  return slides;
}

export const OFFER_DURATION_PRESETS = [
  { key: "none", label: "No expiry", hours: null as number | null },
  { key: "6h", label: "6 hours", hours: 6 },
  { key: "12h", label: "12 hours", hours: 12 },
  { key: "1d", label: "1 day", hours: 24 },
  { key: "2d", label: "2 days", hours: 48 },
  { key: "3d", label: "3 days", hours: 72 },
  { key: "7d", label: "7 days", hours: 168 },
] as const;

export function expiresAtFromHours(hours: number | null, from = new Date()): string | null {
  if (hours == null || hours <= 0) return null;
  return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();
}
