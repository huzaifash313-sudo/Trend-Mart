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
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createOrder } from "@/services/orderService";
import { validateCoupon, fetchCouponsByShopId } from "@/services/couponService";
import { saveOrderRecord } from "@/services/orderHistoryService";
import type { OrderItem as OrderItemType, Shop } from "@/types";
import { formatRupees } from "@/lib/formatters";
import { sanitizeText } from "@/lib/validations";
import { useLocation } from "@/context/LocationContext";
import { getDistanceToShop, locationErrorMessage } from "@/services/geoRadiusService";
import { requireVerifiedEmailSession } from "@/services/authService";
import { toWhatsAppDigits, normalizePkPhoneDigits } from "@/lib/sanitization";
import Link from "next/link";

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
  currency?: string;
  /** Original price before discount (for showing savings). */
  originalPrice?: number;
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

/**
 * Build a meticulously formatted WhatsApp order message for the merchant.
 * All inputs undergo strict sanitation before being embedded in the payload.
 */
function buildWhatsAppMessage(
  shopName: string,
  shopLocation: string,
  items: WhatsAppCartItem[],
  quantities: Record<string, number>,
  shipping: ShippingDetails,
  subtotal: number,
  discount: number,
  deliveryFee: number,
  grandTotal: number,
  couponCode: string,
  orderRef: string,
): string {
  // ── Sanitize all inputs ──────────────────────────────────────────────
  const safeShopName = sanitizePayloadString(shopName, 100);
  const safeLocation = sanitizePayloadString(shopLocation, 100);
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

  const lines: string[] = [
    `🛒 *New Order via TrendMart*`,
    ``,
    `🏪 *Shop:* ${safeShopName}`,
    `📍 *Location:* ${safeLocation}`,
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
    const itemTotal = safePrice * qty;
    const safeOriginalPrice = item.originalPrice ? sanitizePayloadNumber(item.originalPrice) : 0;

    const variantLabel = safeVariant ? ` (${safeVariant})` : "";
    const originalPriceStr = safeOriginalPrice > safePrice
      ? ` (Was ${formatRupees(safeOriginalPrice)})`
      : "";

    lines.push(`• ${safeItemName}${variantLabel}`);
    lines.push(`  ${qty} x ${formatRupees(safePrice)} = ${formatRupees(itemTotal)}${originalPriceStr}`);
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

  if (safeAddress) {
    lines.push(`   Address: ${safeAddress}`);
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

  const phone = details.customerPhone.replace(/\D/g, "");
  if (!phone) {
    errors.customerPhone = "Phone number is required.";
  } else if (phone.length < 10) {
    errors.customerPhone = "Enter a valid phone number (min 10 digits).";
  } else if (phone.length > 15) {
    errors.customerPhone = "Phone number is too long.";
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
  accentHex = "#10b981",
}: WhatsAppCheckoutModalProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { location, isDetecting, detectLocationDetailed } = useLocation();

  // ── State ───────────────────────────────────────────────────────────────
  const [step, setStep] = useState<"review" | "shipping" | "confirm" | "success" | "auth">("review");
  const [authGate, setAuthGate] = useState<"checking" | "ok" | "login" | "verify">("checking");
  const [shipping, setShipping] = useState<ShippingDetails>(INITIAL_SHIPPING);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderRef, setOrderRef] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [autofilledFromAccount, setAutofilledFromAccount] = useState(false);
  const [locationFillError, setLocationFillError] = useState<string | null>(null);
  const [locationFillBusy, setLocationFillBusy] = useState(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [showCouponField, setShowCouponField] = useState(false);
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponResult, setCouponResult] = useState<CouponValidationResult | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<Array<{ id: string; code: string }>>([]);
  const couponTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      return sum + item.price * qty;
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

  const minOrderAmount = shop.min_order_amount ?? 0;
  const belowMinimumOrder = minOrderAmount > 0 && subtotal > 0 && subtotal < minOrderAmount;

  const deliveryFee = useMemo(() => {
    const freeThreshold = shop.free_delivery_threshold;
    if (freeThreshold != null && freeThreshold > 0 && subtotal >= freeThreshold) return 0;
    const flat = shop.delivery_fee_flat ?? 0;
    const perKm = shop.delivery_fee_per_km ?? 0;
    const distanceCharge = distanceKm != null && perKm > 0 ? distanceKm * perKm : 0;
    return Math.round((flat + distanceCharge) * 100) / 100;
  }, [shop, subtotal, distanceKm]);

  const qualifiesForFreeDelivery =
    shop.free_delivery_threshold != null && shop.free_delivery_threshold > 0 && subtotal >= shop.free_delivery_threshold;

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
  const accentBorder = `border-${accentColor}-200/50`;
  const accentText = `text-${accentColor}-700`;
  const accentTextDark = `dark:text-${accentColor}-400`;

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
            .select("full_name, phone, address")
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

        const nextName =
          savedAddr?.full_name ||
          profile?.full_name ||
          user.user_metadata?.full_name ||
          "";
        const nextPhone =
          savedAddr?.phone_number ||
          profile?.phone ||
          user.user_metadata?.phone ||
          "";
        const nextAddress = line || profile?.address || "";
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
  }, [supabase, authGate]);

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

  const handleShippingSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    const validationErrors = validateShipping(shipping);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    setStep("confirm");
  }, [shipping]);

  // ── Order Submission ────────────────────────────────────────────────────
  const handlePlaceOrder = useCallback(async () => {
    if (!phone) {
      setOrderError("This shop does not have a valid WhatsApp number configured.");
      return;
    }

    const gate = await requireVerifiedEmailSession();
    if (!gate.ok) {
      setAuthGate(gate.reason === "unverified" ? "verify" : "login");
      setStep("auth");
      return;
    }

    setIsSubmitting(true);
    setOrderError(null);

    try {
      // 1. Persist order to Supabase (unit price + qty — stock deducts correctly)
      const orderItems: OrderItemType[] = items.map(item => ({
        product_id: item.productId,
        name: item.name,
        price: item.price,
        quantity: quantities[item.id] ?? item.quantity,
        variant: item.variant,
      }));

      const orderResult = await createOrder({
        shopId: shop.id,
        customerName: shipping.customerName.trim(),
        customerPhone:
          normalizePkPhoneDigits(shipping.customerPhone) ||
          shipping.customerPhone.replace(/\D/g, ""),
        items: orderItems,
        discountAmount,
        deliveryFee,
        notes: shipping.deliveryNotes,
        couponCode: couponResult?.valid ? couponCode : undefined,
      });

      if (!orderResult.success) {
        throw new Error(orderResult.error);
      }

      const ref = orderResult.data.id;
      setOrderRef(ref);

      // 2. Save to local history
      saveOrderRecord({
        shopId: shop.id,
        shopName: shop.name,
        productName: items.map(i => i.name).join(", "),
        quantity: Object.values(quantities).reduce((a, b) => a + b, 0),
        totalAmount: grandTotal,
        discountAmount,
        couponCode,
        notes: shipping.deliveryNotes,
      });

      // 3. Build WhatsApp message
      const whatsappText = buildWhatsAppMessage(
        shop.name,
        shop.location,
        items,
        quantities,
        shipping,
        subtotal,
        discountAmount,
        deliveryFee,
        grandTotal,
        couponCode,
        ref,
      );

      // 4. Show success state, then open WhatsApp
      setStep("success");

      setTimeout(() => {
        window.open(
          `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`,
          "_blank",
        );
        onOrderPlaced();
      }, 1000);
    } catch (err) {
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
    quantities,
    onOrderPlaced,
  ]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
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
                {step === "success" && "Order Sent!"}
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
              {step === "success" && "Opening WhatsApp for you..."}
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
                    onClick={onClose}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup?redirect=/"
                    className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    onClick={onClose}
                  >
                    Create account
                  </Link>
                </>
              )}
              {authGate === "verify" && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push("/auth/verify-notice");
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
            <div className="max-h-64 space-y-2 overflow-y-auto px-6 py-4">
              {items.map(item => {
                const qty = quantities[item.id] ?? item.quantity;
                const itemTotal = item.price * qty;
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
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{formatRupees(item.price)}</p>
                        {item.originalPrice && item.originalPrice > item.price && (
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

              {/* Free delivery nudge */}
              {!qualifiesForFreeDelivery && shop.free_delivery_threshold != null && shop.free_delivery_threshold > 0 && (
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

              {/* Shop info reminder */}
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs dark:bg-blue-900/20">
                <InfoIcon />
                <span className="text-blue-700 dark:text-blue-400">
                  Your order will be sent to <strong>{shop.name}</strong> via WhatsApp
                </span>
              </div>

              <button
                type="button"
                onClick={handleGoToShipping}
                disabled={items.length === 0 || belowMinimumOrder}
                className={`w-full rounded-full ${accentBg} py-3 text-sm font-semibold text-white shadow-lg shadow-${accentColor}-600/25 transition-all ${accentBgHover} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {belowMinimumOrder ? "Add More Items to Continue" : "Continue to Delivery Details →"}
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
                  placeholder="Ahmed Khan"
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
                  autoComplete="tel"
                  value={shipping.customerPhone}
                  onChange={(e) => {
                    setAutofilledFromAccount(false);
                    setShipping(s => ({ ...s, customerPhone: e.target.value }));
                  }}
                  placeholder="+92 300 1234567"
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                    errors.customerPhone
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : `border-zinc-200 focus:border-${accentColor}-500 focus:ring-${accentColor}-500/20`
                  } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
                {errors.customerPhone && <p className="mt-1 text-xs text-red-500">{errors.customerPhone}</p>}
                <p className="mt-1 text-[0.65rem] text-zinc-400">
                  Unverified numbers go to a quick SMS check on the next step.
                </p>
              </div>

              {/* Address */}
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor="wc-shipping-address" className="flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    <MapPinIcon /> Delivery Address <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
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
                </div>
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
                  placeholder="House 123, Street 4, Gulberg, Lahore"
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
                {!locationFillError && (
                  <p className="mt-1 text-[0.65rem] text-zinc-400">
                    Autofill from account / map pin, or tap precise location — always editable.
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="wc-delivery-notes" className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Delivery Notes <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <textarea
                  id="wc-delivery-notes"
                  rows={2}
                  value={shipping.deliveryNotes}
                  onChange={(e) => setShipping(s => ({ ...s, deliveryNotes: e.target.value }))}
                  placeholder="e.g., Ring bell, leave at gate, call before delivery..."
                  className={`w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-${accentColor}-500 focus:outline-none focus:ring-2 focus:ring-${accentColor}-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
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
                      {formatRupees(item.price * (quantities[item.id] ?? item.quantity))}
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

              {/* Delivery Info */}
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50 space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Delivery Information</h4>
                <p className="text-sm text-zinc-900 dark:text-zinc-100"><strong>{shipping.customerName}</strong></p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {shipping.customerPhone}
                </p>
                {shipping.shippingAddress && <p className="text-sm text-zinc-600 dark:text-zinc-400">📍 {shipping.shippingAddress}</p>}
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
            <div className="flex gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
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
                disabled={isSubmitting || !phone || belowMinimumOrder}
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

        {/* ── Step: Success ─────────────────────────────────────────────── */}
        {step === "success" && (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <ShieldCheckIcon />
            </div>
            <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Order Placed Successfully!</h4>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              WhatsApp is opening with your order details.
            </p>
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              Your order has been logged for {shop.name}{"'s"} records.
            </p>
            {orderRef && (
              <p className="mt-1 rounded-full bg-zinc-100 px-3 py-1 text-xs font-mono text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                Ref: {orderRef.slice(0, 8).toUpperCase()}
              </p>
            )}
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-6 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Close
              </button>
              {orderRef && (
                <Link
                  href={`/orders/tracking?orderId=${orderRef}`}
                  onClick={onClose}
                  className={`rounded-full ${accentBg} px-6 py-2.5 text-sm font-semibold text-white transition-all ${accentBgHover}`}
                >
                  Track Live →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}