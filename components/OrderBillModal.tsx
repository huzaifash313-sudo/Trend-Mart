"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Professional Order Bill / Thermal Receipt                      */
/*                                                                            */
/*  Generates a professional 80mm thermal-printer receipt for ANY order —      */
/*  dine-in, delivery or pickup — with TrendMart + shop branding, itemised     */
/*  lines, fees, discounts and totals.                                         */
/*                                                                            */
/*  Printing: "Print Bill" calls window.print(); @media print CSS hides        */
/*  everything except the receipt and sizes the page to 80mm × auto.           */
/* -------------------------------------------------------------------------- */

import { useEffect, useMemo, useState } from "react";
import type { Order, OrderItem, Shop } from "@/types";

interface OrderBillModalProps {
  order: Order;
  shop: Shop;
  onClose: () => void;
}

/** Numeric order columns that exist on newer schemas but aren't in the type. */
function orderMoney(order: Order, key: "subtotal_amount" | "delivery_fee" | "discount_amount"): number {
  const raw = (order as unknown as Record<string, unknown>)[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatRs(n: number): string {
  return `Rs ${Math.round(n || 0).toLocaleString("en-PK")}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (v: number) => v.toString().padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DASH = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
const THIN = "──────────────────────────────";

/** Render a single bill line with right-aligned amount (thermal layout). */
function BillRow({ qty, name, meta, amount, originalAmount }: {
  qty?: number;
  name: string;
  meta?: string;
  amount?: number;
  /** Pre-discount line total — shown as a strikethrough "was" price. */
  originalAmount?: number;
}) {
  const left = `${qty && qty > 1 ? `${qty}x ` : ""}${name}`;
  const amountText = amount != null ? formatRs(amount) : "";
  const hasMarkdown =
    originalAmount != null && amount != null && originalAmount > amount;
  return (
    <div className="flex items-start justify-between gap-2 text-[11px] leading-snug">
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-zinc-900">
        {left}
        {meta ? <span className="text-zinc-500"> ({meta})</span> : null}
      </span>
      <span className="shrink-0 whitespace-nowrap text-right text-zinc-900">
        {hasMarkdown ? (
          <span className="block text-[10px] text-zinc-400 line-through">
            was {formatRs(originalAmount as number)}
          </span>
        ) : null}
        {amountText}
      </span>
    </div>
  );
}

export default function OrderBillModal({ order, shop, onClose }: OrderBillModalProps) {
  const [printed, setPrinted] = useState(false);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape key closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo(() => (order.items_json ?? []) as OrderItem[], [order]);

  const lineTotal = (item: OrderItem) =>
    (item.price ?? 0) * (item.quantity ?? 1);

  const itemsSubtotal = useMemo(
    () => rows.reduce((sum, it) => sum + lineTotal(it), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );

  const subtotalCol = orderMoney(order, "subtotal_amount") || itemsSubtotal;
  const storedDeliveryFee = orderMoney(order, "delivery_fee");
  const discount = orderMoney(order, "discount_amount");
  const couponCode = (order as unknown as Record<string, unknown>).coupon_code as string | undefined;
  const grandTotal = order.total_amount ?? Math.max(0, subtotalCol - discount + storedDeliveryFee);

  const orderTypeLabel =
    order.order_type === "dine_in"
      ? order.table_code
        ? `DINE-IN · ${order.table_code}`
        : "DINE-IN"
      : order.order_type === "pickup"
        ? "PICKUP"
        : "DELIVERY";

  const isPickup = order.order_type === "pickup";
  const isDineIn = order.order_type === "dine_in";
  const paymentLabel = isDineIn || isPickup ? "Pay at counter" : "Cash on delivery";

  // Legacy / fallback rows stored the delivery charge inside total_amount but
  // left delivery_fee empty (older schema, or the API's column-drop fallback).
  // Recover the true fee from the arithmetic so the bill never shows "FREE"
  // while actually charging. Pickup / dine-in always stay Rs 0.
  const deliveryFee =
    !isPickup && !isDineIn && storedDeliveryFee <= 0 && subtotalCol > 0 && grandTotal > subtotalCol - discount
      ? Math.max(0, Math.round(grandTotal - subtotalCol + discount))
      : storedDeliveryFee;

  // Item-level savings (deal / markdown pricing) so the bill shows the deal
  // as "Was Rs X → Rs Y" and a total savings line when applicable.
  const itemSavings = useMemo(
    () =>
      rows.reduce((sum, it) => {
        const orig = it.original_price != null ? it.original_price : 0;
        const unit = it.price ?? 0;
        const qty = it.quantity ?? 1;
        return orig > unit ? sum + (orig - unit) * qty : sum;
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );

  const orderShort = order.id.slice(0, 10).toUpperCase();

  const printBill = () => {
    setPrinted(true);
    // Allow React to paint the "printed" state, then print.
    window.setTimeout(() => window.print(), 60);
  };

  const shopLogo = shop.logo_url;
  const shopBrand = shop.name?.trim() || "Shop";

  return (
    <>
      {/* Print-only CSS — only the receipt prints, sized for 80mm thermal. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #tm-bill-receipt, #tm-bill-receipt * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #tm-bill-receipt {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          @page {
            size: 80mm auto;
            margin: 0;
          }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Order bill"
      >
        <div
          className="flex max-h-[94vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-zinc-100 shadow-2xl dark:bg-zinc-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Order Bill</h2>
              <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">
                Thermal 80mm · TrendMart + {shopBrand}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={printBill}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" rx="1" />
                </svg>
                Print Bill
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Printer tip */}
          <div className="mx-3 mb-2 rounded-xl bg-emerald-50 px-3 py-2 text-[0.65rem] leading-relaxed text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            💡 <strong>Print:</strong> koi bhi printer chalta hai — USB/Bluetooth thermal ya normal.
            Print dialog mein apna thermal printer select karein aur paper size{" "}
            <strong>80mm</strong> (margins: none) set karein.
          </div>

          {/* Receipt body — this is what prints */}
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <div
              id="tm-bill-receipt"
              className="mx-auto w-full max-w-[300px] bg-white px-2.5 py-3 font-mono text-[11px] leading-snug text-zinc-900 shadow-sm"
              style={{ width: "80mm" }}
            >
              {/* ── Brand header ─────────────────────────────────────── */}
              <div className="text-center">
                <p className="text-[15px] font-bold tracking-tight text-emerald-700">
                  🛒 TRENDMART
                </p>
                <p className="mt-0.5 text-[8px] uppercase tracking-[0.3em] text-zinc-400">
                  Order Receipt · Tax Invoice
                </p>
              </div>

              <p className="mt-2 text-center">{DASH}</p>

              {/* ── Shop branding ────────────────────────────────────── */}
              <div className="mt-2 text-center">
                {shopLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shopLogo}
                    alt={shopBrand}
                    className="mx-auto mb-1 h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <p className="text-base font-bold">{shopBrand}</p>
                )}
                {shopLogo ? (
                  <p className="text-xs font-bold">{shopBrand}</p>
                ) : null}
                {shop.location ? (
                  <p className="mt-0.5 text-[10px] text-zinc-600">{shop.location}</p>
                ) : null}
                {shop.whatsapp_number ? (
                  <p className="mt-0.5 text-[10px] text-zinc-600">📞 {shop.whatsapp_number}</p>
                ) : null}
              </div>

              <p className="mt-2 text-center">{DASH}</p>

              {/* ── Meta ─────────────────────────────────────────────── */}
              <div className="mt-2 space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Order #</span>
                  <span className="font-bold">#{orderShort}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Date</span>
                  <span>{formatDateTime(order.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Type</span>
                  <span className="font-bold">{orderTypeLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Status</span>
                  <span className="font-semibold">{order.status ?? "Pending"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Customer</span>
                  <span className="font-semibold">{order.customer_name || "Guest"}</span>
                </div>
                {order.customer_phone ? (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Phone</span>
                    <span>{order.customer_phone}</span>
                  </div>
                ) : null}
              </div>

              <p className="mt-2">{THIN}</p>

              {/* ── Itemised lines ───────────────────────────────────── */}
              <div className="mt-1.5 space-y-1">
                {rows.length === 0 ? (
                  <p className="text-center text-zinc-500">No items</p>
                ) : (
                  rows.map((item, idx) => {
                    const qty = item.quantity ?? 1;
                    const orig = item.original_price != null ? item.original_price : 0;
                    return (
                      <BillRow
                        key={idx}
                        qty={qty}
                        name={item.name}
                        meta={item.variant}
                        amount={lineTotal(item)}
                        originalAmount={orig > (item.price ?? 0) ? orig * qty : undefined}
                      />
                    );
                  })
                )}
              </div>

              <p className="mt-2">{THIN}</p>

              {/* ── Totals ───────────────────────────────────────────── */}
              <div className="mt-1.5 space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Subtotal</span>
                  <span>{formatRs(subtotalCol)}</span>
                </div>
                {!isPickup && !isDineIn && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Delivery fee</span>
                    <span>{deliveryFee > 0 ? formatRs(deliveryFee) : "FREE"}</span>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount{couponCode ? ` (${couponCode})` : ""}</span>
                    <span>-{formatRs(discount)}</span>
                  </div>
                )}
                {itemSavings > 0 && discount <= 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>You saved on deals</span>
                    <span>-{formatRs(itemSavings)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-dashed border-zinc-400 pt-1 text-[13px] font-bold">
                  <span>TOTAL</span>
                  <span>{formatRs(grandTotal)}</span>
                </div>
              </div>

              <p className="mt-2 text-center">{DASH}</p>

              {/* ── Footer ───────────────────────────────────────────── */}
              <div className="mt-2 space-y-1 text-center text-[9px] text-zinc-500">
                <p>Payment: {paymentLabel}</p>
                {order.notes ? (
                  <p className="whitespace-pre-wrap break-words text-zinc-700">Note: {order.notes}</p>
                ) : null}
                <p className="pt-1 text-[10px] font-semibold text-zinc-700">
                  Thank you for ordering from {shopBrand}!
                </p>
                <p>
                  {shop.slug ? `trendmart.shop/${shop.slug}` : "Powered by TrendMart"}
                </p>
                {printed ? (
                  <p className="text-[8px] text-zinc-400">— Printed via TrendMart —</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
