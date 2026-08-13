"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function CloseIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 text-emerald-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  currency?: string;
  imageUrl?: string | null;
}

interface OrderConfirmationModalProps {
  item: OrderItem;
  shopName: string;
  whatsappNumber: string;
  shopId?: string;
  onClose: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatCurrency(amount: number, currency: string = "PKR"): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Build a richly-structured WhatsApp pre-filled message with the order summary,
 * including applied coupon discount details.
 */
function buildWhatsAppMessage(
  shopName: string,
  itemName: string,
  imageUrl: string | null | undefined,
  quantity: number,
  notes: string,
  subtotal: number,
  discountAmount: number,
  finalTotal: number,
  couponCode: string,
  currency: string,
): string {
  const safeImageUrl =
    imageUrl && /^https?:\/\//i.test(imageUrl.trim())
      ? imageUrl.trim().slice(0, 500)
      : "";

  const lines: string[] = [
    `🛒 *New Order via TrendMart*`,
    ``,
    `🏪 *Shop:* ${shopName}`,
    `📦 *Product:* ${itemName}`,
    `🔢 *Quantity:* ${quantity}`,
    `💰 *Unit Price:* ${formatCurrency(subtotal / quantity, currency)}`,
    `💵 *Subtotal:* ${formatCurrency(subtotal, currency)}`,
  ];

  if (safeImageUrl) {
    lines.push(`🖼️ *Photo:* ${safeImageUrl}`);
  }

  if (discountAmount > 0) {
    lines.push(``);
    lines.push(`🏷️ *Coupon Applied:* ${couponCode.toUpperCase()}`);
    lines.push(`🔻 *Discount:* -${formatCurrency(discountAmount, currency)}`);
    lines.push(`✅ *Grand Total:* ${formatCurrency(finalTotal, currency)}`);
  } else {
    lines.push(`💵 *Total:* ${formatCurrency(finalTotal, currency)}`);
  }

  if (notes.trim()) {
    lines.push(``);
    lines.push(`📝 *Notes:* ${notes.trim()}`);
  }

  lines.push(``);
  lines.push(`_Sent via TrendMart — Your Local Shopping Hub_`);

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function OrderConfirmationModal({
  item,
  shopName,
  whatsappNumber,
  shopId,
  onClose,
}: OrderConfirmationModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [showCouponField, setShowCouponField] = useState(false);
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponResult, setCouponResult] = useState<{
    valid: boolean;
    discountAmount: number;
    message: string;
  } | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<Array<{ id: string; code: string }>>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phone = whatsappNumber?.replace(/\D/g, "") ?? "";
  const currency = item.currency ?? "PKR";
  const subtotal = useMemo(
    () => item.price * quantity,
    [item.price, quantity],
  );

  // Applied discount amount
  const discountAmount = useMemo(
    () => (couponResult?.valid ? couponResult.discountAmount : 0),
    [couponResult],
  );

  // Final grand total after discount
  const grandTotal = useMemo(
    () => Math.max(0, subtotal - discountAmount),
    [subtotal, discountAmount],
  );

  // Load coupons helper
  const loadCouponsForShop = useCallback(async () => {
    if (!shopId) return;
    setLoadingCoupons(true);
    try {
      const { fetchCouponsByShopId } = await import("@/services/couponService");
      const result = await fetchCouponsByShopId(shopId);
      if (result.success) {
        const active = result.data
          .filter((c) => c.is_active)
          .map((c) => ({ id: c.id, code: c.code }));
        setAvailableCoupons(active);
      }
    } finally {
      setLoadingCoupons(false);
    }
  }, [shopId]);

  // Load coupons when coupon field is shown
  const handleShowCouponField = useCallback(() => {
    setShowCouponField(true);
    if (availableCoupons.length === 0) {
      loadCouponsForShop();
    }
  }, [availableCoupons.length, loadCouponsForShop]);

  // Debounced coupon validation triggered by input change
  const handleCouponChange = useCallback(
    (value: string) => {
      setCouponCode(value);
      const trimmed = value.trim();
      if (validateTimerRef.current) {
        clearTimeout(validateTimerRef.current);
        validateTimerRef.current = null;
      }
      if (!trimmed || !shopId) {
        setCouponResult(null);
        return;
      }
      setCouponValidating(true);
      validateTimerRef.current = setTimeout(async () => {
        const { validateCoupon } = await import("@/services/couponService");
        const result = await validateCoupon(shopId!, trimmed, subtotal);
        setCouponResult({
          valid: result.valid,
          discountAmount: result.discountAmount ?? 0,
          message: result.message ?? "",
        });
        setCouponValidating(false);
      }, 500);
    },
    [shopId, subtotal],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (validateTimerRef.current) {
        clearTimeout(validateTimerRef.current);
      }
    };
  }, []);

  const handleDecrement = useCallback(() => {
    setQuantity((prev) => Math.max(1, prev - 1));
  }, []);

  const handleIncrement = useCallback(() => {
    setQuantity((prev) => Math.min(99, prev + 1));
  }, []);

  const handleQuantityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (isNaN(val)) {
        setQuantity(1);
        return;
      }
      setQuantity(Math.max(1, Math.min(99, val)));
    },
    [],
  );

  const handleSelectCoupon = useCallback(
    (code: string) => {
      setCouponCode(code);
    },
    [],
  );

  const handleClearCoupon = useCallback(() => {
    setCouponCode("");
    setCouponResult(null);
  }, []);

  const handleSendOrder = useCallback(() => {
    if (!phone) return;

    setIsSubmitting(true);

    const text = buildWhatsAppMessage(
      shopName,
      item.name,
      item.imageUrl,
      quantity,
      notes,
      subtotal,
      discountAmount,
      grandTotal,
      couponCode,
      currency,
    );

    // Slight delay for the animation to play
    setTimeout(() => {
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
        "_blank",
      );
      onClose();
    }, 200);
  }, [phone, shopName, item.name, item.imageUrl, quantity, notes, subtotal, discountAmount, grandTotal, couponCode, currency, onClose]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Confirm Your Order
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Review your item before sending via WhatsApp
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

        {/* ── Product Card ──────────────────────────────────────────────── */}
        <div className="px-6 py-5">
          <div className="flex gap-4 rounded-xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
            {/* Thumbnail */}
            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-700">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <PackageIcon />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-1 flex-col justify-between min-w-0">
              <div>
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {item.name}
                </h4>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {shopName}
                </p>
              </div>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(item.price, currency)}
              </p>
            </div>
          </div>
        </div>

        {/* ── Quantity Selector ──────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
          <label
            htmlFor="order-quantity"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
          >
            Quantity
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDecrement}
              disabled={quantity <= 1}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Decrease quantity"
            >
              <MinusIcon />
            </button>
            <input
              id="order-quantity"
              type="number"
              min={1}
              max={99}
              value={quantity}
              onChange={handleQuantityChange}
              className="h-10 w-16 rounded-lg border border-zinc-200 bg-white text-center text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={handleIncrement}
              disabled={quantity >= 99}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Increase quantity"
            >
              <PlusIcon />
            </button>
          </div>
        </div>

        {/* ── Coupon Code Entry ──────────────────────────────────────────── */}
        {shopId && (
          <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
            {!showCouponField ? (
              <button
                type="button"
                onClick={handleShowCouponField}
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400"
              >
                <TagIcon />
                Have a coupon code?
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="coupon-code"
                    className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
                  >
                    <TagIcon />
                    Coupon Code
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCouponField(false);
                      handleClearCoupon();
                    }}
                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    Remove
                  </button>
                </div>

                <div className="relative">
                  <input
                    id="coupon-code"
                    type="text"
                    value={couponCode}
                    onChange={(e) => handleCouponChange(e.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                    maxLength={20}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-10 text-sm font-medium uppercase tracking-wider text-zinc-900 placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    <TagIcon />
                  </span>
                  {couponValidating && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                      <SpinnerIcon />
                    </span>
                  )}
                  {!couponValidating && couponResult?.valid && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      <CheckIcon />
                    </span>
                  )}
                  {couponCode && !couponValidating && (
                    <button
                      type="button"
                      onClick={handleClearCoupon}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600"
                      aria-label="Clear coupon"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Validation message */}
                {!couponValidating && couponResult && (
                  <div
                    className={`rounded-lg px-3 py-2 text-xs font-medium ${
                      couponResult.valid
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                        : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                    }`}
                  >
                    {couponResult.message}
                  </div>
                )}

                {/* Available coupons dropdown */}
                {availableCoupons.length > 0 && !couponResult?.valid && (
                  <div>
                    <p className="mb-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Available coupons:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {availableCoupons.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCoupon(c.code)}
                          className="rounded-full border border-dashed border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                        >
                          {c.code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {loadingCoupons && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <SpinnerIcon />
                    Loading available coupons...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Notes / Special Instructions ───────────────────────────────── */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
          <label
            htmlFor="order-notes"
            className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
          >
            <NoteIcon />
            Special Instructions
          </label>
          <textarea
            id="order-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Size, color, delivery preferences..."
            className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500/40"
          />
        </div>

        {/* ── Order Summary & CTA ────────────────────────────────────────── */}
        <div className="border-t border-zinc-100 px-6 py-5 dark:border-zinc-800">
          {/* Total */}
          <div className="mb-4 flex flex-col gap-2 rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-900/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                Subtotal ({quantity} {quantity === 1 ? "item" : "items"})
              </span>
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(subtotal, currency)}
              </span>
            </div>

            {discountAmount > 0 && (
              <div className="flex items-center justify-between border-t border-emerald-200/50 pt-2 dark:border-emerald-700/50">
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Discount ({couponCode.toUpperCase()})
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  - {formatCurrency(discountAmount, currency)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-emerald-200/50 pt-2 dark:border-emerald-700/50">
              <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                Grand Total
              </span>
              <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(grandTotal, currency)}
              </span>
            </div>
          </div>

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSendOrder}
            disabled={!phone || isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 hover:shadow-emerald-600/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none dark:focus:ring-offset-zinc-900"
          >
            <WhatsAppIcon />
            {isSubmitting ? "Opening WhatsApp..." : "Order via WhatsApp"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full rounded-full py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}