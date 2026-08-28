/* -------------------------------------------------------------------------- */
/*  TrendMart — WhatsApp-First Checkout & Dynamic Message Payload Builder      */
/*                                                                             */
/*  Elite-grade WhatsApp checkout modal tailored for direct merchant           */
/*  communication. Features:                                                   */
/*                                                                             */
/*   - Strict form validation for customer delivery details                   */
/*     (Name, Phone, Complete Address, Optional Notes)                       */
/*   - Real-time item totals and applicable discount codes                   */
/*   - Auto-generated meticulously formatted clean-text WhatsApp payload      */
/*     containing item summaries, quantities, prices, and store references   */
/*   - window.open to dispatch directly to the merchant's WhatsApp number    */
/*   - Simultaneously saves the order log to the Supabase orders table      */
/*   - Coupon code validation with real-time discount calculation           */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createOrder } from "@/services/orderService";
import { validateCoupon, fetchCouponsByShopId } from "@/services/couponService";
import { saveOrderRecord } from "@/services/orderHistoryService";
import type { OrderItem as OrderItemType, PriceTier, Shop } from "@/types";
import { formatRupees } from "@/lib/formatters";
import { priceForQuantity, hasPriceTiers } from "@/lib/priceTiers";
import { computeDeliveryFee } from "@/lib/deliveryFee";
import { sanitizeText } from "@/lib/validations";
import { useLocation } from "@/context/LocationContext";
import {
  getDistanceToShop,
  locationErrorMessage,
  parseCoverageFromZones,
  isCustomerWithinCoverage,
} from "@/services/geoRadiusService";
import { getShopHoursSummary } from "@/lib/shopHours";
import { requireVerifiedEmailSession } from "@/services/authService";
import { toWhatsAppDigits, normalizePkPhoneDigits } from "@/lib/sanitization";
import {
  formatPkPhoneDisplay,
  formatPkPhoneInput,
  isValidPkMobile,
  PK_PHONE_PLACEHOLDER,
  toPkWhatsAppDigits,
} from "@/lib/phoneFormat";
import Link from "next/link";
import { getPublicAppUrl } from "@/lib/appUrl";
import { useToast } from "@/components/Toast";

/** Wrap an async call so a slow/never-resolving request can't hang the UI forever. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WhatsAppCartItem {
  id: string;
  productId: string;
  shopId: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  quantity: number;
  variant?: string;
  /** Per-item special instructions. */
  notes?: string;
  currency?: string;
  /** Original price before discount (for showing savings). */
  originalPrice?: number;
  /**
   * Direct product-page deep link target.
   * `product` → `/p/{shortCode}` | `deal` → `#deal-{id}` (standalone deal,
   * no catalog product). `shortCode` falls back to `productId` when the
   * short-code migration hasn't backfilled a row yet.
   */
  viewKind?: "product" | "deal";
  /** Compact `/p/{code}` short code when available. */
  shortCode?: string;
  /** Quantity price tiers — line total recomputes when the qty changes. */
  priceTiers?: PriceTier[] | null;
}

/** Line total for an item at a given quantity (tier-aware). */
function itemLineTotal(item: { price: number; priceTiers?: PriceTier[] | null }, qty: number): number {
  const q = Math.max(1, Math.min(99, Math.round(qty) || 1));
  if (hasPriceTiers(item.priceTiers)) {
    return priceForQuantity(item.price, item.priceTiers, q);
  }
  return item.price * q;
}

export interface ShippingDetails {
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  deliveryNotes: string;
}

interface CouponValidationResult {
  valid: boolean;
  discountAmount: number;
  message: string;
  code: string;
}

interface WhatsAppCheckoutModalProps {
  /** Items from the cart (grouped by shop). */
  items: WhatsAppCartItem[];
  /** The shop these items belong to. */
  shop: Shop;
  /** Called when user closes or cancels. */
  onClose: () => void;
  /** Called after successful order placement. */
  onOrderPlaced: () => void;
  /** Optional: accent color override for the modal (category-based theming). */
  accentColor?: string;
  /** Optional: accent hex code for category-aware styling. */
  accentHex?: string;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function CloseIcon() { return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>); }
function MinusIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>); }
function PlusIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>); }
function WhatsAppIcon() { return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" /></svg>); }
function TagIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>); }
function CheckIcon() { return (<svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>); }
function SpinnerIcon() { return (<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>); }
function ShieldCheckIcon() { return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>); }
function MapPinIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>); }
function PackageIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>); }
function StoreIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.12-5.6A1 1 0 0 1 5.1 3h13.8a1 1 0 0 1 .98.8L21 9" /><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /><path d="M9 21V9h6v12" /></svg>); }
function InfoIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>); }
function LockIcon() { return (<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>); }

// ─── Constants ──────────────────────────────────────────────────────────────

const INITIAL_SHIPPING: ShippingDetails = {
  customerName: "",
  customerPhone: "",
  shippingAddress: "",
  deliveryNotes: "",
};

/* -------------------------------------------------------------------------- */
/*  Payload Sanitization Helpers                                               */
/* -------------------------------------------------------------------------- */

/**
 * Sanitize a value for WhatsApp message payloads.
 * - Strips HTML/script tags
 * - Removes control characters that could break formatting
 * - Limits string length to prevent payload overflow
 * - Ensures numeric values are valid finite numbers
 */
function sanitizePayloadString(input: string, maxLength: number = 200): string {
  return sanitizeText(input)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars except \n \t
    .replace(/[*_~`>|\\]/g, "") // strip Markdown special chars that could cause injection
    .replace(/\n{3,}/g, "\n\n") // collapse excessive newlines
    .slice(0, maxLength)
    .trim();
}

/** Ensure a number is safe for arithmetic and display. */
function sanitizePayloadNumber(value: number, fallback: number = 0): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) return fallback;
  if (value < 0) return 0;
  if (value > 99_999_999) return 99_999_999;
  return value;
}

/** Sanitize a coupon code for payload: uppercase, alphanumeric + hyphens/underscores only, max 20 chars. */
function sanitizePayloadCouponCode(code: string): string {
  return code.replace(/[^A-Z0-9_-]/gi, "").toUpperCase().slice(0, 20);
}

/** Sanitize an image URL for the payload: http(s) only, no control chars, capped length. */
function sanitizePayloadUrl(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "";
  return trimmed
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .slice(0, 500);
}

/**
 * Build a meticulously formatted WhatsApp order message for the merchant.
 * All inputs undergo strict sanitation before being embedded in the payload.
 */
function buildWhatsAppMessage(
  shop: Pick<Shop, "id" | "name" | "location" | "slug">,
  items: WhatsAppCartItem[],
  quantities: Record<string, number>,
  shipping: ShippingDetails,
  subtotal: number,
  discount: number,
  deliveryFee: number,
  grandTotal: number,
  couponCode: string,
  orderRef: string,
  customerCoords?: { latitude: number; longitude: number } | null,
  orderType: "delivery" | "pickup" = "delivery",
): string {
  const isPickup = orderType === "pickup";
  // ── Sanitize all inputs ──────────────────────────────────────────────
  const safeShopName = sanitizePayloadString(shop.name, 100);
  const safeLocation = sanitizePayloadString(shop.location, 100);
  const safeOrderRef = sanitizePayloadString(orderRef.slice(0, 8), 20).toUpperCase();
  const safeSubtotal = sanitizePayloadNumber(subtotal);
  const safeDiscount = sanitizePayloadNumber(discount);
  const safeDeliveryFee = sanitizePayloadNumber(deliveryFee);
  const safeGrandTotal = sanitizePayloadNumber(grandTotal);
  const safeCouponCode = couponCode ? sanitizePayloadCouponCode(couponCode) : "";
  const safeCustomerName = sanitizePayloadString(shipping.customerName, 100);
  const safeCustomerPhone = sanitizePayloadString(shipping.customerPhone.replace(/[^\d+\s-]/g, ""), 50);
  const safeAddress = sanitizePayloadString(shipping.shippingAddress, 200);
  const safeNotes = sanitizePayloadString(shipping.deliveryNotes, 500);

  const lat =
    customerCoords &&
    Number.isFinite(customerCoords.latitude) &&
    customerCoords.latitude >= -90 &&
    customerCoords.latitude <= 90
      ? customerCoords.latitude
      : null;
  const lng =
    customerCoords &&
    Number.isFinite(customerCoords.longitude) &&
    customerCoords.longitude >= -180 &&
    customerCoords.longitude <= 180
      ? customerCoords.longitude
      : null;
  const mapsPinUrl =
    lat != null && lng != null
      ? `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`
      : null;

  const siteOrigin = getPublicAppUrl().replace(/\/$/, "");

  const lines: string[] = [
    `🛒 *New Order via TrendMart*`,
    ``,
    `🏪 *Shop:* ${safeShopName}`,
    `📍 *Shop area:* ${safeLocation}`,
    isPickup ? `🛍️ *Order Type:* PICKUP — customer will collect` : `🚚 *Order Type:* Delivery`,
    `🆔 *Order Ref:* ${safeOrderRef}`,
    ``,
    `──────────────────────────`,
    `📦 *Order Details*`,
    `──────────────────────────`,
  ];

  for (const item of items) {
    const rawQty = quantities[item.id] ?? item.quantity;
    const qty = Math.max(1, Math.min(99, Math.round(sanitizePayloadNumber(rawQty, 1))));
    const safePrice = sanitizePayloadNumber(item.price);
    const safeItemName = sanitizePayloadString(item.name, 100);
    const safeVariant = item.variant ? sanitizePayloadString(item.variant, 50) : "";
    const safeItemNotes = item.notes ? sanitizePayloadString(item.notes, 200) : "";
    const itemTotal = itemLineTotal({ price: safePrice, priceTiers: item.priceTiers }, qty);
    const safeOriginalPrice = item.originalPrice ? sanitizePayloadNumber(item.originalPrice) : 0;

    const variantLabel = safeVariant ? ` (${safeVariant})` : "";
    const originalPriceStr = safeOriginalPrice > safePrice
      ? ` (Was ${formatRupees(safeOriginalPrice)})`
      : "";

    lines.push(`• ${safeItemName}${variantLabel}`);
    lines.push(`  ${qty} x ${formatRupees(safePrice)} = ${formatRupees(itemTotal)}${originalPriceStr}`);

    if (safeItemNotes) {
      lines.push(`  📝 Note: ${safeItemNotes}`);
    }
  }

  // ONE grouped link for the whole order — no more a link per product.
  // `/o/{id}` shows every item (name, variant, qty, price) + shop + total.
  const summaryPath = `/o/${encodeURIComponent(orderRef)}`;
  const safeSummaryUrl = sanitizePayloadUrl(`${siteOrigin}${summaryPath}`);
  if (safeSummaryUrl) {
    lines.push(``);
    lines.push(`📋 *Full order:* ${safeSummaryUrl}`);
    lines.push(`   (tap once to see all items together)`);
  }

  lines.push(``);
  lines.push(`──────────────────────────`);
  lines.push(`💵 *Subtotal:* ${formatRupees(safeSubtotal)}`);

  if (safeDiscount > 0 && safeCouponCode) {
    lines.push(`🏷️ *Coupon:* ${safeCouponCode}`);
    lines.push(`💸 *Discount:* -${formatRupees(safeDiscount)}`);
  }

  lines.push(
    safeDeliveryFee > 0
      ? `🚚 *Delivery Fee:* ${formatRupees(safeDeliveryFee)}`
      : `🚚 *Delivery Fee:* FREE`,
  );

  lines.push(`✅ *Grand Total:* ${formatRupees(safeGrandTotal)}`);
  lines.push(`──────────────────────────`);
  lines.push(``);
  lines.push(`👤 *Customer Details*`);
  lines.push(`   Name: ${safeCustomerName}`);
  lines.push(`   Phone: ${safeCustomerPhone}`);

  if (isPickup) {
    lines.push(`   🛍️ Collection: customer will pick up from the shop`);
  } else {
    if (safeAddress) {
      lines.push(`   Address: ${safeAddress}`);
    }

    if (mapsPinUrl) {
      lines.push(`   📌 Live pin (open in Maps):`);
      lines.push(`   ${mapsPinUrl}`);
    } else {
      lines.push(`   ⚠️ Map pin missing — ask customer to resend location.`);
    }
  }

  if (safeNotes) {
    lines.push(`   📝 Notes: ${safeNotes}`);
  }

  // Timestamp — safe since it's system-generated
  const safeTimestamp = new Date().toLocaleString("en-PK", { dateStyle: "full", timeStyle: "short" });

  lines.push(``);
  lines.push(`──────────────────────────`);
  lines.push(`_Sent via TrendMart — Your Local Shopping Hub_`);
  lines.push(`_🕐 ${safeTimestamp}_`);

  return lines.join("\n");
}

// ─── Validation ─────────────────────────────────────────────────────────────

interface ValidationErrors {
  customerName?: string;
  customerPhone?: string;
  shippingAddress?: string;
}

function validateShipping(details: ShippingDetails): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!details.customerName.trim()) {
    errors.customerName = "Full name is required.";
  } else if (details.customerName.trim().length < 2) {
    errors.customerName = "Name must be at least 2 characters.";
  } else if (details.customerName.trim().length > 100) {
    errors.customerName = "Name is too long (max 100 characters).";
  }

  if (!details.customerPhone.trim()) {
    errors.customerPhone = "Phone number is required.";
  } else if (!isValidPkMobile(details.customerPhone)) {
    errors.customerPhone = `Enter a valid mobile (e.g. ${PK_PHONE_PLACEHOLDER}).`;
  }

  if (details.shippingAddress.trim() && details.shippingAddress.trim().length < 5) {
    errors.shippingAddress = "Address seems too short. Please provide more detail.";
  }

  return errors;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WhatsAppCheckoutModal({
  items,
  shop,
  onClose,
  onOrderPlaced,
  accentColor = "emerald",
}: WhatsAppCheckoutModalProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { location, isDetecting, detectLocationDetailed, seedLocation } = useLocation();
  const { addToast } = useToast();

  // ── State ───────────────────────────────────────────────────────────────
  const [step, setStep] = useState<"review" | "shipping" | "confirm" | "success" | "auth">("review");
  const [authGate, setAuthGate] = useState<"checking" | "ok" | "login" | "verify">("checking");
  const [shipping, setShipping] = useState<ShippingDetails>(INITIAL_SHIPPING);
  const [errors, setErrors] = useState<ValidationErrors>({});
  // Fulfilment channel — Delivery or Self-Pickup. Dine-in (QR tables) is a
  // separate flow; this checkout only offers the channels the shop enables.
  const [orderType, setOrderType] = useState<"delivery" | "pickup">(() => {
    if (shop.accepts_delivery === false && shop.accepts_pickup !== false) return "pickup";
    return "delivery";
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderRef, setOrderRef] = useState("");
  const [pendingWhatsAppUrl, setPendingWhatsAppUrl] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [autofilledFromAccount, setAutofilledFromAccount] = useState(false);
  const [locationFillError, setLocationFillError] = useState<string | null>(null);
  const [locationFillBusy, setLocationFillBusy] = useState(false);
  // Portal only after mount so fixed overlay escapes transform ancestors (deals carousel).
  const [portalReady, setPortalReady] = useState(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [showCouponField, setShowCouponField] = useState(false);
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponResult, setCouponResult] = useState<CouponValidationResult | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<Array<{ id: string; code: string }>>([]);
  const couponTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Idempotency token: one per checkout session. Reused across retries so a
  // double-submit can't create duplicate orders; regenerated only on success.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  );

  // Editable quantities (initialized from items via lazy state initializer)
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const item of items) {
      initial[item.id] = item.quantity;
    }
    return initial;
  });

  // ── Derived Values ──────────────────────────────────────────────────────
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = quantities[item.id] ?? item.quantity;
      return sum + itemLineTotal(item, qty);
    }, 0);
  }, [items, quantities]);

  const discountAmount = useMemo(() => {
    return couponResult?.valid ? couponResult.discountAmount : 0;
  }, [couponResult]);

  // ── Delivery Slabs: minimum order + free-delivery threshold + radius fee ──
  const distanceKm = useMemo(() => {
    if (!location?.coordinates) return null;
    return getDistanceToShop(shop, location.coordinates.latitude, location.coordinates.longitude);
  }, [shop, location]);

  // Fulfilment channels the shop actually accepts.
  const canDeliver = shop.accepts_delivery !== false;
  const canPickup = shop.accepts_pickup !== false;
  const isPickup = orderType === "pickup";
  const noFulfillment = !canDeliver && !canPickup;

  const minOrderAmount = shop.min_order_amount ?? 0;
  const belowMinimumOrder = minOrderAmount > 0 && subtotal > 0 && subtotal < minOrderAmount;

  const qualifiesForFreeDelivery =
    !isPickup &&
    shop.free_delivery_threshold != null &&
    shop.free_delivery_threshold > 0 &&
    subtotal >= shop.free_delivery_threshold;

  const perKmFee = shop.delivery_fee_per_km ?? 0;
  const needsDistanceForFee = !isPickup && perKmFee > 0 && !qualifiesForFreeDelivery;
  const missingDistanceForFee = needsDistanceForFee && distanceKm == null;

  const shopHours = useMemo(
    () =>
      getShopHoursSummary({
        business_hours: shop.business_hours,
        operating_status: shop.operating_status,
      }),
    [shop.business_hours, shop.operating_status],
  );
  const shopClosed = shopHours.state === "closed";

  const radiusKm = shop.service_radius_km ?? 0;
  const coverageMode = useMemo(
    () => parseCoverageFromZones(shop.delivery_zones).mode,
    [shop.delivery_zones],
  );
  const outsideServiceRadius = useMemo(() => {
    if (isPickup || !location?.coordinates) return false;
    const gate = isCustomerWithinCoverage(
      shop,
      location.coordinates.latitude,
      location.coordinates.longitude,
      location.city,
    );
    return !gate.within;
  }, [shop, location, isPickup]);

  const deliveryFee = useMemo(() => {
    // Single shared helper — identical to the server-side calculation, so the
    // fee shown here is always the fee stored on the order.
    return computeDeliveryFee({
      flat: shop.delivery_fee_flat,
      perKm: shop.delivery_fee_per_km,
      distanceKm,
      freeThreshold: shop.free_delivery_threshold,
      subtotal,
      isPickup,
    });
  }, [shop.delivery_fee_flat, shop.delivery_fee_per_km, distanceKm, shop.free_delivery_threshold, subtotal, isPickup]);

  const grandTotal = useMemo(
    () => Math.max(0, subtotal - discountAmount + deliveryFee),
    [subtotal, discountAmount, deliveryFee],
  );

  const phone = toWhatsAppDigits(shop.whatsapp_number ?? "");

  // Accent class names
  const accentBg = `bg-${accentColor}-600`;
  const accentBgHover = `hover:bg-${accentColor}-700`;
  const accentRing = `focus:ring-${accentColor}-500`;
  const accentLight = `bg-${accentColor}-50`;
  const accentText = `text-${accentColor}-700`;

  // ── Quantity Handlers ───────────────────────────────────────────────────
  const updateQuantity = useCallback((itemId: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(1, Math.min(99, (prev[itemId] ?? 1) + delta)),
    }));
  }, []);

  // ── Coupon Handlers ─────────────────────────────────────────────────────
  const handleCouponChange = useCallback((code: string) => {
    setCouponCode(code);
    const trimmed = code.trim();

    if (couponTimerRef.current) {
      clearTimeout(couponTimerRef.current);
      couponTimerRef.current = null;
    }

    if (!trimmed || !shop.id) {
      setCouponResult(null);
      return;
    }

    setCouponValidating(true);
    couponTimerRef.current = setTimeout(async () => {
      try {
        const result = await validateCoupon(shop.id!, trimmed, subtotal);
        setCouponResult({
          valid: result.valid,
          discountAmount: result.discountAmount ?? 0,
          message: result.message ?? "",
          code: trimmed,
        });
      } catch {
        setCouponResult({
          valid: false,
          discountAmount: 0,
          message: "Failed to validate coupon. Please try again.",
          code: trimmed,
        });
      }
      setCouponValidating(false);
    }, 500);
  }, [shop.id, subtotal]);

  const handleClearCoupon = useCallback(() => {
    setCouponCode("");
    setCouponResult(null);
  }, []);

  const toggleCouponField = useCallback(async () => {
    setShowCouponField(prev => !prev);
    if (availableCoupons.length === 0 && shop.id) {
      try {
        const result = await fetchCouponsByShopId(shop.id);
        if (result.success) {
          setAvailableCoupons(
            result.data
              .filter(c => c.is_active)
              .map(c => ({ id: c.id, code: c.code })),
          );
        }
      } catch { /* ignore */ }
    }
  }, [availableCoupons.length, shop.id]);

  /** Best human-readable line from the header / map location context. */
  const formatLocationAddress = useCallback((loc: typeof location): string => {
    if (!loc) return "";
    if (loc.address?.trim()) return loc.address.trim();
    return [loc.deliveryZone, loc.city].filter(Boolean).join(", ");
  }, []);

  // ── Require verified email before checkout ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gate = await requireVerifiedEmailSession();
      if (cancelled) return;
      if (gate.ok) {
        setAuthGate("ok");
        return;
      }
      setAuthGate(gate.reason === "unverified" ? "verify" : "login");
      setStep("auth");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // ── Auto-fill from saved delivery address + profile ────────────────────
  useEffect(() => {
    if (authGate !== "ok") return;
    let cancelled = false;

    async function loadProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setProfileLoaded(true);
          return;
        }

        const [{ data: profile }, { data: savedAddr }] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("full_name, phone, address, latitude, longitude, city, location_label")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("customer_addresses")
            .select("full_name, phone_number, address_line1, address_line2, city, delivery_notes, is_default")
            .eq("user_id", user.id)
            .order("is_default", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const line = savedAddr
          ? [savedAddr.address_line1, savedAddr.address_line2, savedAddr.city]
              .filter(Boolean)
              .join(", ")
          : "";

        const profileLat =
          typeof profile?.latitude === "number" && Number.isFinite(profile.latitude)
            ? profile.latitude
            : null;
        const profileLng =
          typeof profile?.longitude === "number" && Number.isFinite(profile.longitude)
            ? profile.longitude
            : null;
        const profileLocLabel = (profile?.location_label as string | undefined)?.trim() || "";

        // Seed the location context from the saved profile pin so distance +
        // coverage checks run immediately without a fresh GPS prompt.
        if (profileLat != null && profileLng != null) {
          seedLocation({
            coordinates: { latitude: profileLat, longitude: profileLng },
            city: (profile?.city as string | undefined) ?? null,
            deliveryZone: (profile?.city as string | undefined) ?? null,
            address: profileLocLabel || profile?.address || null,
            updatedAt: Date.now(),
            source: "cached",
          });
        }

        const nextName =
          savedAddr?.full_name ||
          profile?.full_name ||
          user.user_metadata?.full_name ||
          "";
        const nextPhoneRaw =
          savedAddr?.phone_number ||
          profile?.phone ||
          user.user_metadata?.phone ||
          "";
        const nextPhone = nextPhoneRaw ? formatPkPhoneDisplay(String(nextPhoneRaw)) : "";
        const nextAddress = line || profile?.address || profileLocLabel || "";
        const nextNotes = savedAddr?.delivery_notes || "";

        setShipping((prev) => ({
          ...prev,
          customerName: nextName || prev.customerName,
          customerPhone: nextPhone || prev.customerPhone,
          shippingAddress: nextAddress || prev.shippingAddress,
          deliveryNotes: nextNotes || prev.deliveryNotes,
        }));

        if (nextName || nextPhone || nextAddress) {
          setAutofilledFromAccount(true);
        }
        setProfileLoaded(true);
      } catch {
        if (!cancelled) setProfileLoaded(true);
      }
    }

    loadProfile();
    return () => { cancelled = true; };
  }, [supabase, authGate, seedLocation]);

  // If account had no saved address, fall back to header map location (still editable).
  useEffect(() => {
    if (!profileLoaded) return;
    const fromLoc = formatLocationAddress(location);
    if (!fromLoc) return;
    setShipping((prev) => {
      if (prev.shippingAddress.trim()) return prev;
      return { ...prev, shippingAddress: fromLoc };
    });
  }, [profileLoaded, location, formatLocationAddress]);

  // ── Use my precise location (GPS → reverse-geocode → fill address) ────
  const handleUsePreciseLocation = useCallback(async () => {
    setLocationFillError(null);
    setLocationFillBusy(true);
    try {
      const result = await detectLocationDetailed();
      if (!result.location) {
        setLocationFillError(locationErrorMessage(result.error));
        return;
      }

      const line = formatLocationAddress(result.location);
      if (!line) {
        setLocationFillError("Location found, but no address text. Please type your street / area.");
        return;
      }

      setShipping((s) => ({ ...s, shippingAddress: line }));
      setErrors((e) => {
        if (!e.shippingAddress) return e;
        const next = { ...e };
        delete next.shippingAddress;
        return next;
      });
    } finally {
      setLocationFillBusy(false);
    }
  }, [detectLocationDetailed, formatLocationAddress]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (couponTimerRef.current) clearTimeout(couponTimerRef.current);
    };
  }, []);

  // ── Step Handlers ───────────────────────────────────────────────────────
  const handleGoToShipping = useCallback(() => {
    setStep("shipping");
  }, []);

  const handleGoBackToReview = useCallback(() => {
    setStep("review");
    setErrors({});
  }, []);

  const handleShippingSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const validationErrors = validateShipping(shipping);
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length > 0) return;

      // Pickup needs no GPS pin — the customer is collecting from the shop.
      if (!isPickup) {
        // Live map pin is required so the rider can find the customer. A manually
        // selected city resolves to a city centroid (not the customer's street),
        // so it doesn't count as an exact pin — force a fresh high-accuracy read.
        let hasPin =
          !!location?.coordinates &&
          location.source === "gps" &&
          Number.isFinite(location.coordinates.latitude) &&
          Number.isFinite(location.coordinates.longitude);
        if (!hasPin) {
          setLocationFillBusy(true);
          setLocationFillError(null);
          try {
            const fresh = await detectLocationDetailed();
            const c = fresh.location?.coordinates;
            if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
              hasPin = true;
              const line = formatLocationAddress(fresh.location);
              if (line) {
                setShipping((s) => ({
                  ...s,
                  shippingAddress: s.shippingAddress.trim() || line,
                }));
              }
            } else {
              setLocationFillError(
                locationErrorMessage(fresh.error) ||
                  "Location is required for delivery. Turn on GPS and tap Use my precise location.",
              );
              setLocationFillBusy(false);
              return;
            }
          } catch {
            setLocationFillError(
              "Location is required for delivery. Turn on GPS and tap Use my precise location.",
            );
            setLocationFillBusy(false);
            return;
          }
          setLocationFillBusy(false);
        }
      }

      // Email verification only — no paid SMS / phone OTP.
      const gate = await requireVerifiedEmailSession();
      if (!gate.ok) {
        setAuthGate(gate.reason === "unverified" ? "verify" : "login");
        setStep("auth");
        return;
      }

      setStep("confirm");
    },
    [shipping, location, detectLocationDetailed, formatLocationAddress, isPickup],
  );

  // ── Order Submission ────────────────────────────────────────────────────
  const handlePlaceOrder = useCallback(async () => {
    const gate = await requireVerifiedEmailSession();
    if (!gate.ok) {
      setAuthGate(gate.reason === "unverified" ? "verify" : "login");
      setStep("auth");
      return;
    }

    setIsSubmitting(true);
    setOrderError(null);

    try {
      if (belowMinimumOrder) {
        throw new Error(
          `Minimum order for this shop is ${formatRupees(minOrderAmount)}. Add more items to continue.`,
        );
      }
      if (shopClosed) {
        throw new Error(
          `This shop is closed right now (${shopHours.hoursText}). Try again during open hours.`,
        );
      }
      if (outsideServiceRadius) {
        throw new Error(
          coverageMode === "city"
            ? "You are outside this shop's delivery area (city)."
            : `You are outside this shop's delivery radius (${radiusKm} km).`,
        );
      }

      // Prefer cart WhatsApp; if stale/empty, refresh from shop row so checkout still works.
      let merchantPhone = phone;
      if (!merchantPhone && shop.id) {
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { data: shopRow } = await supabase
            .from("shops")
            .select("whatsapp_number")
            .eq("id", shop.id)
            .maybeSingle();
          merchantPhone = toWhatsAppDigits(
            (shopRow?.whatsapp_number as string | undefined) ?? "",
          );
        } catch {
          /* ignore — fall through to validation */
        }
      }
      if (!merchantPhone) {
        throw new Error(
          "This shop does not have a valid WhatsApp number configured. Ask the merchant to update it in Store Settings.",
        );
      }

      // 1. Persist order to Supabase (effective unit price + qty — tier-aware)
      const orderItems: OrderItemType[] = items.map(item => {
        const oQty = Math.max(1, Math.round(quantities[item.id] ?? item.quantity));
        const oTotal = itemLineTotal(item, oQty);
        return {
          product_id: item.productId,
          name: item.name,
          price: Math.round(oTotal / Math.max(1, oQty)),
          ...(item.originalPrice != null && item.originalPrice > (item.price ?? 0)
            ? { original_price: item.originalPrice }
            : {}),
          quantity: oQty,
          variant: item.variant,
          notes: item.notes,
        };
      });

      // Pickup needs no GPS pin — the customer is collecting from the shop.
      let pinLat: number | null = null;
      let pinLng: number | null = null;
      if (!isPickup) {
        // Prefer an exact GPS pin from checkout (never a city centroid); fall back
        // to a fresh high-accuracy detect — the rider needs the real location.
        pinLat =
          location?.source === "gps" ? location?.coordinates?.latitude ?? null : null;
        pinLng =
          location?.source === "gps" ? location?.coordinates?.longitude ?? null : null;
        if (pinLat == null || pinLng == null) {
          try {
            const fresh = await detectLocationDetailed();
            const c = fresh.location?.coordinates;
            if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
              pinLat = c.latitude;
              pinLng = c.longitude;
            }
          } catch {
            /* handled below */
          }
        }
        if (
          pinLat == null ||
          pinLng == null ||
          !Number.isFinite(pinLat) ||
          !Number.isFinite(pinLng)
        ) {
          throw new Error(
            "Your live location is required so the rider can find you. Turn on GPS, tap Use my precise location, then try again.",
          );
        }
      }

      const orderResult = await withTimeout(
        createOrder({
          shopId: shop.id,
          customerName: shipping.customerName.trim(),
          customerPhone:
            toPkWhatsAppDigits(shipping.customerPhone) ||
            normalizePkPhoneDigits(shipping.customerPhone),
          items: orderItems,
          discountAmount,
          deliveryFee,
          notes: shipping.deliveryNotes,
          couponCode: couponResult?.valid ? couponCode : undefined,
          orderType: isPickup ? "pickup" : "delivery",
          customerLat: pinLat,
          customerLng: pinLng,
          customerCity: location?.city ?? undefined,
          idempotencyKey,
        }),
        15_000,
        "Order request timed out. Please check your connection and try again.",
      );

      // Debuggability: log the raw API result so a "stuck" order is traceable.
      console.log("[Checkout] createOrder response:", orderResult);

      if (!orderResult.success) {
        throw new Error(orderResult.error);
      }

      // Success — reset the idempotency token so a future order gets a fresh one.
      setIdempotencyKey("");

      const ref = orderResult.data.id;
      setOrderRef(ref);

      // Save to local history (items array so the orders page can render it)
      saveOrderRecord({
        shopId: shop.id,
        shopName: shop.name,
        productName: items.map(i => i.name).join(", "),
        quantity: Object.values(quantities).reduce((a, b) => a + b, 0),
        totalAmount: grandTotal,
        discountAmount,
        couponCode,
        notes: shipping.deliveryNotes,
        items: items.map((i) => ({
          product_id: i.productId,
          name: i.name,
          price: i.price,
          quantity: quantities[i.id] ?? i.quantity,
        })),
        status: "Pending",
      });

      // Build WhatsApp message (TrendMart product links + Maps pin)
      const whatsappText = buildWhatsAppMessage(
        shop,
        items,
        quantities,
        shipping,
        subtotal,
        discountAmount,
        deliveryFee,
        grandTotal,
        couponCode,
        ref,
        { latitude: pinLat ?? 0, longitude: pinLng ?? 0 },
        isPickup ? "pickup" : "delivery",
      );

      const whatsappUrl = `https://wa.me/${merchantPhone}?text=${encodeURIComponent(whatsappText)}`;
      setPendingWhatsAppUrl(whatsappUrl);

      // WhatsApp-first: order placed → open the merchant chat immediately, then
      // close with a single confirmation toast. If the popup is blocked, fall
      // back to the success screen so the shopper can still open it with one tap.
      let opened: Window | null = null;
      try {
        opened = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      } catch {
        opened = null;
      }

      setIsSubmitting(false);
      addToast("Order placed — WhatsApp chat opened.", "success");

      if (opened) {
        onOrderPlaced();
      } else {
        setStep("success");
      }
    } catch (err) {
      console.error("[Checkout] Order failed:", err);
      setOrderError(
        err instanceof Error
          ? err.message
          : "Failed to place order. Please try again.",
      );
      setIsSubmitting(false);
    }
  }, [
    phone,
    items,
    shop,
    shipping,
    subtotal,
    discountAmount,
    deliveryFee,
    grandTotal,
    couponCode,
    couponResult,
    quantities,
    belowMinimumOrder,
    minOrderAmount,
    shopClosed,
    shopHours.hoursText,
    outsideServiceRadius,
    radiusKm,
    location,
    detectLocationDetailed,
    addToast,
    onOrderPlaced,
    coverageMode,
    idempotencyKey,
    isPickup,
  ]);

  const finishOrder = useCallback(() => {
    onOrderPlaced();
  }, [onOrderPlaced]);

  const openWhatsAppAndFinish = useCallback(() => {
    if (pendingWhatsAppUrl) {
      window.open(pendingWhatsAppUrl, "_blank", "noopener,noreferrer");
    }
    finishOrder();
  }, [pendingWhatsAppUrl, finishOrder]);

  // ── Render (portal to body so transform/overflow ancestors can't clip) ──

  if (!portalReady) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={step === "success" ? undefined : onClose}
    >
      <div
        className="flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <StoreIcon />
              </span>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {step === "auth" && (authGate === "verify" ? "Verify Your Email" : "Sign In Required")}
                {step === "review" && "WhatsApp Checkout"}
                {step === "shipping" && "Delivery Details"}
                {step === "confirm" && "Confirm Order"}
                {step === "success" && "Order placed"}
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {step === "auth" &&
                (authGate === "verify"
                  ? "Confirm your email before placing an order"
                  : "Create or sign in with a verified email to checkout")}
              {step === "review" && `Sending order to ${shop.name}`}
              {step === "shipping" && "Enter your delivery information"}
              {step === "confirm" && "Review everything before sending"}
              {step === "success" && "Tap Open WhatsApp to message the shop — this is how they receive your order."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* ── Progress Steps ────────────────────────────────────────────── */}
        {step !== "auth" && (
          <div className="flex items-center justify-center gap-1 px-6 py-3">
            {(["review", "shipping", "confirm"] as const).map((s, idx, arr) => {
              const order = ["review", "shipping", "confirm"] as const;
              const stepIdx = step === "success" ? order.length : order.indexOf(step as typeof order[number]);
              const sIdx = order.indexOf(s);
              const isActive = step === s;
              const isDone = step === "success" || stepIdx > sIdx;
              return (
                <div key={s} className="flex items-center gap-1">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      isActive
                        ? `${accentBg} text-white`
                        : isDone
                          ? `bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400`
                          : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  {idx < arr.length - 1 && <div className="h-px w-6 bg-zinc-200 dark:bg-zinc-700" />}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Step: Auth / email gate ───────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {step === "auth" && (
          <div className="px-6 py-8 text-center">
            <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${accentLight} ${accentText}`}>
              <LockIcon />
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {authGate === "checking" && "Checking your account..."}
              {authGate === "login" &&
                "Browsing is free — to place an order you need an account with a verified email."}
              {authGate === "verify" &&
                "Your account email is not verified yet. Verify it, then come back to checkout."}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              {authGate === "login" && (
                <>
                  <Link
                    href="/login?redirect=/"
                    className={`rounded-full ${accentBg} px-5 py-2.5 text-sm font-semibold text-white ${accentBgHover}`}
                    onClick={() => {
                      try {
                        sessionStorage.setItem("tm_resume_checkout", "1");
                      } catch {
                        /* ignore */
                      }
                      onClose();
                    }}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup?redirect=/"
                    className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    onClick={() => {
                      try {
                        sessionStorage.setItem("tm_resume_checkout", "1");
                      } catch {
                        /* ignore */
                      }
                      onClose();
                    }}
                  >
                    Create account
                  </Link>
                </>
              )}
              {authGate === "verify" && (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      sessionStorage.setItem("tm_resume_checkout", "1");
                    } catch {
                      /* ignore */
                    }
                    onClose();
                    router.push("/auth/verify-notice?redirect=/");
                  }}
                  className={`rounded-full ${accentBg} px-5 py-2.5 text-sm font-semibold text-white ${accentBgHover}`}
                >
                  Verify email
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-5 py-2.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Keep browsing
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Review Cart ─────────────────────────────────────────── */}
        {step === "review" && (
          <div>
            {/* Order-type selector — only channels the shop has enabled */}
            <div className="px-6 pt-4">
              <div className="flex rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
                {canDeliver && (
                  <button
                    type="button"
                    onClick={() => setOrderType("delivery")}
                    className={`flex-1 rounded-full px-2 py-2 text-xs font-semibold transition-all ${
                      !isPickup
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    🚚 Delivery
                  </button>
                )}
                {canPickup && (
                  <button
                    type="button"
                    onClick={() => setOrderType("pickup")}
                    className={`flex-1 rounded-full px-2 py-2 text-xs font-semibold transition-all ${
                      isPickup
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    🛍️ Pickup
                  </button>
                )}
              </div>
              {isPickup && (
                <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                  You&apos;ll collect your order from <strong>{shop.location || shop.name}</strong> — no
                  delivery fee applies.
                </p>
              )}
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto px-6 py-4">
              {items.map(item => {
                const qty = quantities[item.id] ?? item.quantity;
                const itemTotal = itemLineTotal(item, qty);
                const tierUnit = hasPriceTiers(item.priceTiers)
                  ? Math.round(itemTotal / Math.max(1, qty))
                  : item.price;
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                    {/* Thumbnail */}
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-700">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center"><PackageIcon /></div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.name}</p>
                      {item.variant && <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.variant}</p>}
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{formatRupees(tierUnit)}</p>
                        {item.originalPrice && item.originalPrice > tierUnit && (
                          <p className="text-[0.6rem] text-zinc-400 line-through">{formatRupees(item.originalPrice)}</p>
                        )}
                        <p className="text-xs text-zinc-400">× {qty} = {formatRupees(itemTotal)}</p>
                      </div>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, -1)}
                        disabled={(quantities[item.id] ?? 1) <= 1}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        aria-label={`Decrease quantity of ${item.name}`}
                      >
                        <MinusIcon />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100">{qty}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, 1)}
                        disabled={(quantities[item.id] ?? 1) >= 99}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        aria-label={`Increase quantity of ${item.name}`}
                      >
                        <PlusIcon />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Coupon Toggle */}
            <div className="px-6 pb-4">
              {!showCouponField ? (
                <button
                  type="button"
                  onClick={toggleCouponField}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400"
                >
                  <TagIcon /> Have a coupon code?
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => handleCouponChange(e.target.value.toUpperCase())}
                      placeholder="Enter code"
                      maxLength={20}
                      className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-900 placeholder:font-normal placeholder:tracking-normal focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    {couponValidating && <SpinnerIcon />}
                    {couponCode && !couponValidating && couponResult && (
                      <span className="text-xs font-medium">
                        {couponResult.valid ? <CheckIcon /> : <span className="text-red-500">Invalid</span>}
                      </span>
                    )}
                    {couponCode && (
                      <button type="button" onClick={handleClearCoupon} className="text-xs text-zinc-400 hover:text-red-500">Clear</button>
                    )}
                  </div>
                  {availableCoupons.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {availableCoupons.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleCouponChange(c.code)}
                          className="rounded-full border border-dashed border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                        >
                          {c.code}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Totals & CTA */}
            <div className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
              <div className="mb-4 space-y-1 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-800 dark:text-emerald-200">Subtotal</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">{formatRupees(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm border-t border-emerald-200/50 pt-1 dark:border-emerald-700/50">
                    <span className="text-emerald-700 dark:text-emerald-300">Coupon Discount</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">-{formatRupees(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-emerald-200/50 pt-1 dark:border-emerald-700/50">
                  <span className="text-emerald-700 dark:text-emerald-300">Delivery Fee</span>
                  <span className={`font-semibold ${deliveryFee === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-emerald-700 dark:text-emerald-300"}`}>
                    {deliveryFee === 0 ? "FREE" : formatRupees(deliveryFee)}
                  </span>
                </div>
                <div className="flex justify-between text-sm border-t border-emerald-200/50 pt-1 dark:border-emerald-700/50">
                  <span className="font-bold text-emerald-800 dark:text-emerald-200">Total</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">{formatRupees(grandTotal)}</span>
                </div>
              </div>

              {/* Free delivery nudge — delivery only */}
              {!isPickup && !qualifiesForFreeDelivery && shop.free_delivery_threshold != null && shop.free_delivery_threshold > 0 && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs dark:bg-emerald-900/20">
                  <InfoIcon />
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Add {formatRupees(shop.free_delivery_threshold - subtotal)} more to unlock FREE delivery!
                  </span>
                </div>
              )}

              {/* Minimum order warning */}
              {belowMinimumOrder && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs dark:bg-amber-900/20">
                  <InfoIcon />
                  <span className="text-amber-700 dark:text-amber-400">
                    Minimum order for {shop.name} is {formatRupees(minOrderAmount)}. Add {formatRupees(minOrderAmount - subtotal)} more to checkout.
                  </span>
                </div>
              )}

              {/* Distance-based delivery needs GPS — delivery only */}
              {!isPickup && missingDistanceForFee && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs dark:bg-amber-900/20">
                  <InfoIcon />
                  <span className="text-amber-700 dark:text-amber-400">
                    This shop charges per-km delivery. Share your location (or set it in Settings)
                    for an accurate fee — right now only the flat fee ({formatRupees(shop.delivery_fee_flat ?? 0)}) is applied.
                  </span>
                </div>
              )}

              {shopClosed && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs dark:bg-red-900/20">
                  <InfoIcon />
                  <span className="text-red-700 dark:text-red-400">
                    Shop is closed now ({shopHours.hoursText}). You can browse, but checkout is paused.
                  </span>
                </div>
              )}

              {outsideServiceRadius && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs dark:bg-red-900/20">
                  <InfoIcon />
                  <span className="text-red-700 dark:text-red-400">
                    {coverageMode === "city"
                      ? "This shop only delivers within its selected city, which doesn't match your current location."
                      : `You are about ${distanceKm?.toFixed(1)} km away — this shop delivers within ${radiusKm} km only.`}
                  </span>
                </div>
              )}

              {noFulfillment && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs dark:bg-red-900/20">
                  <InfoIcon />
                  <span className="text-red-700 dark:text-red-400">
                    This shop has paused delivery &amp; pickup right now. Try again later or contact them directly.
                  </span>
                </div>
              )}

              {/* Shop info reminder */}
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs dark:bg-blue-900/20">
                <InfoIcon />
                <span className="text-blue-700 dark:text-blue-400">
                  Your {isPickup ? "pickup " : ""}order will be sent to <strong>{shop.name}</strong> via WhatsApp
                </span>
              </div>

              <button
                type="button"
                onClick={handleGoToShipping}
                disabled={items.length === 0 || belowMinimumOrder || shopClosed || outsideServiceRadius || noFulfillment}
                className={`w-full rounded-full ${accentBg} py-3 text-sm font-semibold text-white shadow-lg shadow-${accentColor}-600/25 transition-all ${accentBgHover} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {noFulfillment
                  ? "Orders Paused — Try Later"
                  : shopClosed
                    ? "Shop Closed — Come Back Later"
                    : outsideServiceRadius
                      ? "Outside Delivery Area"
                      : belowMinimumOrder
                        ? "Add More Items to Continue"
                        : isPickup
                          ? "Continue to Pickup Details →"
                          : "Continue to Delivery Details →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Shipping Details ────────────────────────────────────── */}
        {step === "shipping" && (
          <form onSubmit={handleShippingSubmit}>
            <div className="space-y-4 px-6 py-5">
              {autofilledFromAccount && (
                <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                  <InfoIcon />
                  <span>
                    Filled from your saved account details — you can edit anything before continuing.
                  </span>
                </div>
              )}

              {/* Name */}
              <div>
                <label htmlFor="wc-customer-name" className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Full Name *</label>
                <input
                  id="wc-customer-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={shipping.customerName}
                  onChange={(e) => {
                    setAutofilledFromAccount(false);
                    setShipping(s => ({ ...s, customerName: e.target.value }));
                  }}
                  placeholder="Full name"
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                    errors.customerName
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : `border-zinc-200 focus:border-${accentColor}-500 ${accentRing}/20`
                  } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
                {errors.customerName && <p className="mt-1 text-xs text-red-500">{errors.customerName}</p>}
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="wc-customer-phone" className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Phone Number *</label>
                <input
                  id="wc-customer-phone"
                  type="tel"
                  required
                  inputMode="numeric"
                  autoComplete="tel"
                  value={shipping.customerPhone}
                  onChange={(e) => {
                    setAutofilledFromAccount(false);
                    setShipping((s) => ({
                      ...s,
                      customerPhone: formatPkPhoneInput(e.target.value),
                    }));
                  }}
                  placeholder={PK_PHONE_PLACEHOLDER}
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                    errors.customerPhone
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : `border-zinc-200 focus:border-${accentColor}-500 focus:ring-${accentColor}-500/20`
                  } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
                {errors.customerPhone && <p className="mt-1 text-xs text-red-500">{errors.customerPhone}</p>}
                <p className="mt-1 text-[0.65rem] text-zinc-400">
                  Format: {PK_PHONE_PLACEHOLDER} — spaces, dashes, or +92 all work.
                </p>
              </div>

              {/* Address — required for delivery, optional/hidden emphasis for pickup */}
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor="wc-shipping-address" className="flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    <MapPinIcon /> {isPickup ? "Pickup note" : "Delivery Address"}{" "}
                    {isPickup ? (
                      <span className="font-normal text-zinc-400">(optional)</span>
                    ) : (
                      <span className="font-normal text-zinc-400">(recommended — helps the shop find you)</span>
                    )}
                  </label>
                  {!isPickup && (
                    <button
                      type="button"
                      onClick={handleUsePreciseLocation}
                      disabled={locationFillBusy || isDetecting}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.65rem] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                    >
                      {(locationFillBusy || isDetecting) ? (
                        <>
                          <SpinnerIcon /> Detecting…
                        </>
                      ) : (
                        <>
                          <MapPinIcon /> Use my precise location
                        </>
                      )}
                    </button>
                  )}
                </div>
                {isPickup ? (
                  <>
                    <input
                      id="wc-shipping-address"
                      type="text"
                      value={shipping.shippingAddress}
                      onChange={(e) => {
                        setAutofilledFromAccount(false);
                        setShipping(s => ({ ...s, shippingAddress: e.target.value }));
                      }}
                      placeholder="Anything the shop should know about collection (optional)"
                      className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                        errors.shippingAddress
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                          : `border-zinc-200 focus:border-${accentColor}-500 focus:ring-${accentColor}-500/20`
                      } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                    />
                    <p className="mt-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                      🛍️ You&apos;ll collect this order from <strong>{shop.location || shop.name}</strong>. No delivery
                      fee, no GPS needed.
                    </p>
                  </>
                ) : (
                  <>
                    <input
                      id="wc-shipping-address"
                      type="text"
                      autoComplete="street-address"
                      value={shipping.shippingAddress}
                      onChange={(e) => {
                        setAutofilledFromAccount(false);
                        setLocationFillError(null);
                        setShipping(s => ({ ...s, shippingAddress: e.target.value }));
                      }}
                      placeholder="Full address"
                      className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                        errors.shippingAddress
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                          : `border-zinc-200 focus:border-${accentColor}-500 focus:ring-${accentColor}-500/20`
                      } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                    />
                    {errors.shippingAddress && <p className="mt-1 text-xs text-red-500">{errors.shippingAddress}</p>}
                    {locationFillError && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{locationFillError}</p>
                    )}
                    {!location?.coordinates && !locationFillError && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                        Live location is required for delivery. Tap <strong>Use my precise location</strong> so the rider gets a Maps pin.
                      </p>
                    )}
                    {location?.coordinates && (
                      <p className="mt-1 text-[0.65rem] text-emerald-600 dark:text-emerald-400">
                        Location pin ready — it will be sent to the shop on WhatsApp.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="wc-delivery-notes" className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  {isPickup ? "Pickup Notes" : "Delivery Notes"} <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <textarea
                  id="wc-delivery-notes"
                  rows={2}
                  value={shipping.deliveryNotes}
                  onChange={(e) => setShipping(s => ({ ...s, deliveryNotes: e.target.value }))}
                  placeholder={isPickup ? "E.g. I'll call when I arrive" : "Delivery instructions"}
                  className={`w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-${accentColor}-500 focus:outline-none focus:ring-2 focus:ring-${accentColor}-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 flex gap-2 border-t border-zinc-100 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                onClick={handleGoBackToReview}
                className="rounded-full px-6 py-3 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                ← Back
              </button>
              <button
                type="submit"
                className={`flex-1 rounded-full ${accentBg} py-3 text-sm font-semibold text-white shadow-lg shadow-${accentColor}-600/25 transition-all ${accentBgHover}`}
              >
                Continue →
              </button>
            </div>
          </form>
        )}

        {/* ── Step: Confirm Order ───────────────────────────────────────── */}
        {step === "confirm" && (
          <div>
            <div className="max-h-80 overflow-y-auto px-6 py-5 space-y-4">
              {/* Order Summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Order Summary</h4>
                {items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {item.name} {item.variant ? `(${item.variant})` : ""} × {quantities[item.id] ?? item.quantity}
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {formatRupees(itemLineTotal(item, quantities[item.id] ?? item.quantity))}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pricing Breakdown */}
              <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-800 dark:text-emerald-200">Subtotal</span>
                  <span className="font-semibold">{formatRupees(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm border-t border-emerald-200/50 pt-1 dark:border-emerald-700/50">
                    <span className="text-emerald-700 dark:text-emerald-300">Coupon: {couponCode.toUpperCase()}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">-{formatRupees(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-emerald-200/50 pt-1 dark:border-emerald-700/50">
                  <span className="text-emerald-700 dark:text-emerald-300">Delivery Fee</span>
                  <span className="font-semibold">{deliveryFee === 0 ? "FREE" : formatRupees(deliveryFee)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-emerald-200/50 pt-1 dark:border-emerald-700/50">
                  <span className="text-emerald-800 dark:text-emerald-200">Grand Total</span>
                  <span className="text-emerald-700 dark:text-emerald-300">{formatRupees(grandTotal)}</span>
                </div>
              </div>

              {/* Delivery / Pickup Info */}
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50 space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {isPickup ? "Pickup Information" : "Delivery Information"}
                </h4>
                <p className="text-sm text-zinc-900 dark:text-zinc-100"><strong>{shipping.customerName}</strong></p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {shipping.customerPhone}
                </p>
                {isPickup ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    🛍️ Collecting from <strong>{shop.location || shop.name}</strong>
                  </p>
                ) : (
                  <>
                    {shipping.shippingAddress && <p className="text-sm text-zinc-600 dark:text-zinc-400">📍 {shipping.shippingAddress}</p>}
                    {location?.coordinates ? (
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        📌 Live Maps pin will be sent for the rider
                      </p>
                    ) : (
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        ⚠️ Live location missing — go back and tap Use my precise location
                      </p>
                    )}
                  </>
                )}
                {shipping.deliveryNotes && (
                  <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                    📝 {shipping.deliveryNotes}
                  </p>
                )}
              </div>

              {/* Merchant Info */}
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                <div className="flex items-center gap-2">
                  <StoreIcon />
                  <div>
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">{shop.name}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">📍 {shop.location}</p>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {orderError && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  {orderError}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 flex gap-2 border-t border-zinc-100 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setStep("shipping")}
                disabled={isSubmitting}
                className="rounded-full px-6 py-3 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                ← Edit
              </button>
              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={isSubmitting || !phone || belowMinimumOrder || shopClosed || outsideServiceRadius || noFulfillment}
                className={`flex flex-1 items-center justify-center gap-2 rounded-full ${accentBg} py-3 text-sm font-semibold text-white shadow-lg shadow-${accentColor}-600/25 transition-all ${accentBgHover} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isSubmitting ? (
                  <><SpinnerIcon /> Placing Order...</>
                ) : (
                  <><WhatsAppIcon /> Send via WhatsApp</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Success — stays open until WhatsApp or Close ─────────── */}
        {step === "success" && (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <ShieldCheckIcon />
            </div>
            <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Order Placed Successfully!</h4>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Your order is saved. The shop only sees it when you tap Open WhatsApp and send the message.
              </p>
              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                Tracking stays on Pending until the shop updates it in their dashboard.
              </p>
            {orderRef && (
              <p className="mt-3 inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-mono text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                Ref: {orderRef.slice(0, 8).toUpperCase()}
              </p>
            )}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
              {pendingWhatsAppUrl ? (
                <button
                  type="button"
                  onClick={openWhatsAppAndFinish}
                  className={`inline-flex items-center justify-center gap-2 rounded-full ${accentBg} px-6 py-3 text-sm font-semibold text-white transition-all ${accentBgHover}`}
                >
                  <WhatsAppIcon /> Open WhatsApp
                </button>
              ) : null}
              {orderRef ? (
                <Link
                  href={`/orders/tracking?orderId=${orderRef}`}
                  onClick={onClose}
                  className="rounded-full border border-zinc-200 px-6 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Track order →
                </Link>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-6 py-3 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Close without WhatsApp
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body,
  );
}