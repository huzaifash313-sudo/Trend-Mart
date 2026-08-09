"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Enterprise Checkout & WhatsApp Order Dispatcher                */
/*                                                                             */
/*  Features:                                                                  */
/*   - Multi-item cart checkout with quantity controls                         */
/*   - Client-side shipping detail verification (name, phone, address)         */
/*   - Real-time coupon code validation & discount calculation                 */
/*   - Automatic WhatsApp order message generation                             */
/*   - Atomic order persistence to Supabase orders table                       */
/*   - Status tracking: Pending → Processing → Completed → Cancelled           */
/*   - Post-checkout order summary with WhatsApp deep-link                    */
/*   - Optimistic UI with loading states and error recovery                    */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { createOrder } from "@/services/orderService";
import { validateCoupon, fetchCouponsByShopId } from "@/services/couponService";
import type { OrderItem as OrderItemType, Shop } from "@/types";
import { toWhatsAppDigits, normalizePkPhoneDigits } from "@/lib/sanitization";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CheckoutCartItem {
  id: string;
  productId: string;
  shopId: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  quantity: number;
  variant?: string;
  currency?: string;
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

interface CheckoutModalProps {
  /** Items from the cart (grouped by shop) */
  items: CheckoutCartItem[];
  /** The shop these items belong to */
  shop: Shop;
  /** Called when user closes or cancels */
  onClose: () => void;
  /** Called after successful order placement */
  onOrderPlaced: () => void;
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

// ─── Constants ──────────────────────────────────────────────────────────────

const INITIAL_SHIPPING: ShippingDetails = {
  customerName: "",
  customerPhone: "",
  shippingAddress: "",
  deliveryNotes: "",
};

/**
 * Formats a number as PKR currency.
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Build a structured WhatsApp order message for the merchant.
 */
function buildWhatsAppMessage(
  shopName: string,
  items: CheckoutCartItem[],
  shipping: ShippingDetails,
  subtotal: number,
  discount: number,
  grandTotal: number,
  couponCode: string,
): string {
  const lines: string[] = [
    `🛒 *New Order via TrendMart*`,
    ``,
    `🏪 *Shop:* ${shopName}`,
    ``,
    `📦 *Order Details:*`,
  ];

  for (const item of items) {
    const variantLabel = item.variant ? ` (${item.variant})` : "";
    const itemTotal = item.price * item.quantity;
    lines.push(
      `   • ${item.name}${variantLabel} × ${item.quantity} = ${formatCurrency(itemTotal)}`,
    );
  }

  lines.push(``);
  lines.push(`💵 *Subtotal:* ${formatCurrency(subtotal)}`);

  if (discount > 0) {
    lines.push(`🏷️ *Coupon:* ${couponCode.toUpperCase()} — Discount: -${formatCurrency(discount)}`);
    lines.push(`✅ *Grand Total:* ${formatCurrency(grandTotal)}`);
  } else {
    lines.push(`💵 *Total:* ${formatCurrency(grandTotal)}`);
  }

  lines.push(``);
  lines.push(`👤 *Customer:* ${shipping.customerName}`);
  lines.push(`📱 *Phone:* ${shipping.customerPhone}`);

  if (shipping.shippingAddress.trim()) {
    lines.push(`📍 *Address:* ${shipping.shippingAddress.trim()}`);
  }

  if (shipping.deliveryNotes.trim()) {
    lines.push(`📝 *Notes:* ${shipping.deliveryNotes.trim()}`);
  }

  lines.push(``);
  lines.push(`_Sent via TrendMart — Your Local Shopping Hub_`);
  lines.push(`_Order Date: ${new Date().toLocaleString()}_`);

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
    errors.customerName = "Name is required.";
  } else if (details.customerName.trim().length < 2) {
    errors.customerName = "Name must be at least 2 characters.";
  }

  const phone = details.customerPhone.replace(/\D/g, "");
  if (!phone) {
    errors.customerPhone = "Phone number is required.";
  } else if (phone.length < 10) {
    errors.customerPhone = "Enter a valid phone number (min 10 digits).";
  } else if (phone.length > 15) {
    errors.customerPhone = "Phone number is too long.";
  }

  // Address is optional but if provided, must be reasonable
  if (details.shippingAddress.trim() && details.shippingAddress.trim().length < 5) {
    errors.shippingAddress = "Address seems too short. Please provide more detail.";
  }

  return errors;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CheckoutModal({
  items,
  shop,
  onClose,
  onOrderPlaced,
}: CheckoutModalProps) {
  const supabase = useMemo(() => createClient(), []);

  // ── State ───────────────────────────────────────────────────────────────
  const [step, setStep] = useState<"review" | "shipping" | "confirm" | "success">("review");
  const [shipping, setShipping] = useState<ShippingDetails>(INITIAL_SHIPPING);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

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

  const grandTotal = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);

  const phone = toWhatsAppDigits(shop.whatsapp_number ?? "");

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
    // Load available coupons once
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

    if (Object.keys(validationErrors).length === 0) {
      setStep("confirm");
    }
  }, [shipping]);

  // ── Order Submission ────────────────────────────────────────────────────
  const handlePlaceOrder = useCallback(async () => {
    if (!phone) {
      setOrderError("This shop does not have a valid WhatsApp number.");
      return;
    }

    setIsSubmitting(true);
    setOrderError(null);

    try {
      // 1. Persist order to Supabase (unit price + qty)
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
      });

      if (!orderResult.success) {
        throw new Error(orderResult.error);
      }

      // 2. Build WhatsApp message
      const whatsappText = buildWhatsAppMessage(
        shop.name,
        items.map(item => ({
          ...item,
          quantity: quantities[item.id] ?? item.quantity,
        })),
        shipping,
        subtotal,
        discountAmount,
        grandTotal,
        couponCode,
      );

      // 3. Show success state, then open WhatsApp
      setStep("success");

      // Small delay for success animation
      setTimeout(() => {
        window.open(
          `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`,
          "_blank",
        );
        onOrderPlaced();
      }, 800);
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
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {step === "review" && "Checkout"}
              {step === "shipping" && "Delivery Details"}
              {step === "confirm" && "Confirm Order"}
              {step === "success" && "Order Sent! 🎉"}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {step === "review" && "Review your cart items"}
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
        <div className="flex items-center justify-center gap-1 px-6 py-3">
          {(["review", "shipping", "confirm"] as const).map((s, idx) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  step === s
                    ? "bg-emerald-600 text-white"
                    : step === "success" || (s === "review" && (step === "shipping" || step === "confirm"))
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                }`}
              >
                {idx + 1}
              </div>
              {idx < 2 && <div className="h-px w-6 bg-zinc-200 dark:bg-zinc-700" />}
            </div>
          ))}
        </div>

        {/* ── Step: Review Cart ─────────────────────────────────────────── */}
        {step === "review" && (
          <div>
            <div className="max-h-64 space-y-2 overflow-y-auto px-6 py-4">
              {items.map(item => (
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
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(item.price)}</p>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, -1)}
                      disabled={(quantities[item.id] ?? 1) <= 1}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <MinusIcon />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100">{quantities[item.id] ?? 1}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, 1)}
                      disabled={(quantities[item.id] ?? 1) >= 99}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                </div>
              ))}
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
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm border-t border-emerald-200/50 pt-1 dark:border-emerald-700/50">
                    <span className="text-emerald-700 dark:text-emerald-300">Discount</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-emerald-200/50 pt-1 dark:border-emerald-700/50">
                  <span className="font-bold text-emerald-800 dark:text-emerald-200">Total</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoToShipping}
                disabled={items.length === 0}
                className="w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue to Delivery Details →
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Shipping Details ────────────────────────────────────── */}
        {step === "shipping" && (
          <form onSubmit={handleShippingSubmit}>
            <div className="space-y-4 px-6 py-5">
              {/* Name */}
              <div>
                <label htmlFor="customer-name" className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Full Name *</label>
                <input
                  id="customer-name"
                  type="text"
                  required
                  value={shipping.customerName}
                  onChange={(e) => setShipping(s => ({ ...s, customerName: e.target.value }))}
                  placeholder="Ahmed Khan"
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                    errors.customerName
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : "border-zinc-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                  } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
                {errors.customerName && <p className="mt-1 text-xs text-red-500">{errors.customerName}</p>}
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="customer-phone" className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Phone Number *</label>
                <input
                  id="customer-phone"
                  type="tel"
                  required
                  value={shipping.customerPhone}
                  onChange={(e) => setShipping(s => ({ ...s, customerPhone: e.target.value }))}
                  placeholder="+92 300 1234567"
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                    errors.customerPhone
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : "border-zinc-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                  } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
                {errors.customerPhone && <p className="mt-1 text-xs text-red-500">{errors.customerPhone}</p>}
              </div>

              {/* Address */}
              <div>
                <label htmlFor="shipping-address" className="mb-1 flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <MapPinIcon /> Delivery Address <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  id="shipping-address"
                  type="text"
                  value={shipping.shippingAddress}
                  onChange={(e) => setShipping(s => ({ ...s, shippingAddress: e.target.value }))}
                  placeholder="House 123, Street 4, Gulberg, Lahore"
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                    errors.shippingAddress
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : "border-zinc-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                  } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
                {errors.shippingAddress && <p className="mt-1 text-xs text-red-500">{errors.shippingAddress}</p>}
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="delivery-notes" className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Delivery Notes <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <textarea
                  id="delivery-notes"
                  rows={2}
                  value={shipping.deliveryNotes}
                  onChange={(e) => setShipping(s => ({ ...s, deliveryNotes: e.target.value }))}
                  placeholder="e.g., Ring bell, leave at gate, call before delivery..."
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
                className="flex-1 rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700"
              >
                Review Order →
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
                      {item.name} × {quantities[item.id] ?? item.quantity}
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(item.price * (quantities[item.id] ?? item.quantity))}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pricing Breakdown */}
              <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-800 dark:text-emerald-200">Subtotal</span>
                  <span className="font-semibold">{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm border-t border-emerald-200/50 pt-1 dark:border-emerald-700/50">
                    <span className="text-emerald-700 dark:text-emerald-300">Coupon: {couponCode.toUpperCase()}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t border-emerald-200/50 pt-1 dark:border-emerald-700/50">
                  <span className="text-emerald-800 dark:text-emerald-200">Grand Total</span>
                  <span className="text-emerald-700 dark:text-emerald-300">{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              {/* Delivery Info */}
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50 space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Delivery Information</h4>
                <p className="text-sm text-zinc-900 dark:text-zinc-100"><strong>{shipping.customerName}</strong></p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{shipping.customerPhone}</p>
                {shipping.shippingAddress && <p className="text-sm text-zinc-600 dark:text-zinc-400">{shipping.shippingAddress}</p>}
                {shipping.deliveryNotes && (
                  <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                    📝 {shipping.deliveryNotes}
                  </p>
                )}
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
                disabled={isSubmitting || !phone}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-full px-8 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}