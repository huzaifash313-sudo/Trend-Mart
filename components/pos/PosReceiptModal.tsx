"use client";

/**
 * TrendsMart POS — shop-first 80mm thermal receipt (retail / medical / kiryana style).
 * Supports: browser print dialog · Web Bluetooth ESC/POS · Web Serial USB.
 */

import { useEffect, useMemo, useState } from "react";
import type { Order, OrderItem, Shop } from "@/types";
import { buildEscPosReceipt } from "@/lib/pos/escpos";
import {
  getPrintTarget,
  printRawEscPos,
  setPrintTarget,
  type ThermalPrintTarget,
} from "@/lib/pos/thermalPrinter";

export interface PosReceiptModalProps {
  order: Order;
  shop: Shop;
  footerNote?: string;
  cashierLabel?: string;
  /** Open print shortly after mount */
  autoPrint?: boolean;
  /** Preferred print path from POS settings */
  printTarget?: ThermalPrintTarget;
  /** 58 or 80 mm paper */
  printWidthMm?: 58 | 80;
  onClose: () => void;
}

function formatRs(n: number): string {
  return `Rs ${Math.round(n || 0).toLocaleString("en-PK")}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (v: number) => v.toString().padStart(2, "0");
  const h24 = d.getHours();
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(h12)}:${pad(d.getMinutes())} ${ampm}`;
}

function orderMoney(order: Order, key: string): number {
  const raw = (order as unknown as Record<string, unknown>)[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function invoiceNo(order: Order): string {
  const src = (order.source || "").toLowerCase() === "pos" ? "POS" : "INV";
  return `${src}-${order.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function paymentLabel(order: Order): string {
  const split = order.payment_split;
  if (split && typeof split === "object") {
    const parts = Object.entries(split)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `${k.toUpperCase()} ${formatRs(Number(v))}`);
    if (parts.length) return parts.join(" + ");
  }
  const m = (order.payment_method || "").trim();
  if (m) return m.toUpperCase();
  if (order.order_type === "delivery") return "COD / DELIVERY";
  return "CASH";
}

export default function PosReceiptModal({
  order,
  shop,
  footerNote,
  cashierLabel = "Cashier",
  autoPrint = false,
  printTarget,
  printWidthMm = 80,
  onClose,
}: PosReceiptModalProps) {
  const [printed, setPrinted] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [printMsg, setPrintMsg] = useState("");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo(() => (order.items_json ?? []) as OrderItem[], [order]);

  const itemsSubtotal = useMemo(
    () => rows.reduce((sum, it) => sum + (it.price ?? 0) * (it.quantity ?? 1), 0),
    [rows],
  );

  const subtotal = orderMoney(order, "subtotal_amount") || itemsSubtotal;
  const discount = orderMoney(order, "discount_amount");
  const deliveryFee = orderMoney(order, "delivery_fee");
  const grand =
    order.total_amount ?? Math.max(0, subtotal - discount + deliveryFee);

  const shopBrand = shop.name?.trim() || "Shop";
  const address =
    (shop.address_display || "").trim() || (shop.location || "").trim();
  const phone = (shop.whatsapp_number || "").trim();
  const itemCount = rows.reduce((n, it) => n + (it.quantity ?? 1), 0);

  const typeLabel =
    order.order_type === "delivery"
      ? "DELIVERY"
      : order.order_type === "dine_in"
        ? `DINE-IN${order.table_code ? ` · ${order.table_code}` : ""}`
        : "COUNTER / PICKUP";

  const effectiveTarget: ThermalPrintTarget =
    printTarget || getPrintTarget() || "browser";

  const printBrowser = () => {
    setPrinted(true);
    window.setTimeout(() => window.print(), 80);
  };

  const printThermal = async () => {
    setPrintBusy(true);
    setPrintMsg("");
    setPrintTarget(effectiveTarget);
    const cols = printWidthMm === 58 ? 32 : 42;
    const bytes = buildEscPosReceipt({
      shopName: shopBrand,
      address: address || undefined,
      phone: phone || undefined,
      invoiceNo: invoiceNo(order),
      dateLabel: formatDateTime(order.created_at),
      typeLabel,
      cashier: cashierLabel,
      customerName: order.customer_name || "Walk-in",
      customerPhone:
        order.customer_phone && order.customer_phone !== "00000000000"
          ? order.customer_phone
          : undefined,
      items: rows.map((it) => ({
        name: it.name || "Item",
        qty: it.quantity ?? 1,
        rate: it.price ?? 0,
        amount: (it.price ?? 0) * (it.quantity ?? 1),
        variant: it.variant,
      })),
      itemCount,
      subtotal,
      discount,
      deliveryFee,
      total: grand,
      paymentLabel: paymentLabel(order),
      footerNote: footerNote?.trim() || `Thank you for shopping at ${shopBrand}!`,
      cols,
    });
    const res = await printRawEscPos(bytes);
    setPrintBusy(false);
    if (!res.ok) {
      setPrintMsg(res.error);
      return;
    }
    setPrinted(true);
    setPrintMsg(`Printed via ${res.via}`);
  };

  const printBill = () => {
    if (effectiveTarget === "browser") {
      printBrowser();
      return;
    }
    void printThermal();
  };

  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => printBill(), 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- print once on open
  }, [autoPrint]);

  return (
    <>
      <style>{`
        @media print {
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          #tm-pos-receipt, #tm-pos-receipt * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #tm-pos-receipt {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 3mm 3mm 4mm !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #000 !important;
          }
          .tm-pos-no-print { display: none !important; }
          @page { size: 80mm auto; margin: 0; }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[210] flex items-end justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:items-center"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Sale receipt"
      >
        <div
          className="flex max-h-[94vh] w-full max-w-[380px] flex-col overflow-hidden rounded-2xl bg-zinc-100 shadow-2xl dark:bg-zinc-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tm-pos-no-print flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Sale receipt</h2>
              <p className="text-[10px] text-zinc-500">
                {printWidthMm}mm thermal · {effectiveTarget} · {shopBrand}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={printBusy}
                onClick={printBill}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                {printBusy ? "Printing…" : "Print"}
              </button>
              {effectiveTarget !== "browser" ? (
                <button
                  type="button"
                  onClick={printBrowser}
                  className="rounded-xl border border-zinc-300 px-2.5 py-2 text-[10px] font-semibold text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
                >
                  Browser
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
              >
                Close
              </button>
            </div>
          </div>

          <p className="tm-pos-no-print mx-3 mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[10px] leading-relaxed text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            {effectiveTarget === "browser"
              ? "Print dialog mein apna thermal / USB / Bluetooth printer select karein · paper 80mm · margins None."
              : effectiveTarget === "bluetooth"
                ? "Bluetooth ESC/POS printer — Chrome/Edge pe pair karein (POS Setup → Printer)."
                : "USB Serial ESC/POS — Chrome desktop pe cable se connect (POS Setup → Printer)."}
          </p>
          {printMsg ? (
            <p className="tm-pos-no-print mx-3 mt-1 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
              {printMsg}
            </p>
          ) : null}

          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div
              id="tm-pos-receipt"
              className="mx-auto bg-white px-2.5 py-3 font-mono text-[11px] leading-[1.35] text-black shadow-sm"
              style={{ width: "80mm", maxWidth: "100%" }}
            >
              <div className="text-center">
                {shop.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shop.logo_url}
                    alt=""
                    className="mx-auto mb-1.5 h-14 w-14 rounded-md object-cover"
                  />
                ) : null}
                <p className="text-[16px] font-black uppercase tracking-wide text-black">
                  {shopBrand}
                </p>
                {address ? (
                  <p className="mt-1 text-[9px] leading-snug text-zinc-700">{address}</p>
                ) : null}
                {phone ? (
                  <p className="mt-0.5 text-[10px] font-semibold text-zinc-800">Tel: {phone}</p>
                ) : null}
                <p className="mt-1 text-[8px] uppercase tracking-[0.2em] text-zinc-500">
                  Sale invoice
                </p>
              </div>

              <p className="my-2 text-center text-[10px] tracking-widest">
                ========================================
              </p>

              <div className="space-y-0.5 text-[10px]">
                <div className="flex justify-between gap-2">
                  <span>Invoice #</span>
                  <span className="font-bold">{invoiceNo(order)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Date</span>
                  <span>{formatDateTime(order.created_at)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Type</span>
                  <span className="font-semibold">{typeLabel}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Cashier</span>
                  <span>{cashierLabel}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Customer</span>
                  <span className="font-semibold">{order.customer_name || "Walk-in"}</span>
                </div>
                {order.customer_phone && order.customer_phone !== "00000000000" ? (
                  <div className="flex justify-between gap-2">
                    <span>Phone</span>
                    <span>{order.customer_phone}</span>
                  </div>
                ) : null}
              </div>

              <p className="my-2 text-center text-[10px]">----------------------------------------</p>

              <div className="grid grid-cols-[minmax(0,1fr)_2rem_2.75rem_3.25rem] gap-1 text-[9px] font-bold uppercase text-zinc-600">
                <span className="whitespace-nowrap">Item</span>
                <span className="whitespace-nowrap text-right">Qty</span>
                <span className="whitespace-nowrap text-right">Rate</span>
                <span className="whitespace-nowrap text-right">Amt</span>
              </div>
              <p className="mb-1 text-center text-[10px]">----------------------------------------</p>

              <div className="space-y-1.5">
                {rows.map((it, idx) => {
                  const qty = it.quantity ?? 1;
                  const rate = it.price ?? 0;
                  const amt = rate * qty;
                  return (
                    <div key={idx}>
                      <p className="text-[10px] font-semibold leading-tight">{it.name}</p>
                      {it.variant ? (
                        <p className="text-[8px] text-zinc-600">{it.variant}</p>
                      ) : null}
                      <div className="grid grid-cols-[minmax(0,1fr)_2rem_2.75rem_3.25rem] gap-1 text-[10px]">
                        <span className="text-zinc-500" />
                        <span className="text-right tabular-nums">{qty}</span>
                        <span className="text-right tabular-nums">{Math.round(rate)}</span>
                        <span className="text-right font-semibold tabular-nums">
                          {Math.round(amt).toLocaleString("en-PK")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="my-2 text-center text-[10px]">----------------------------------------</p>

              <div className="space-y-0.5 text-[10px]">
                <div className="flex justify-between">
                  <span>Items</span>
                  <span>{itemCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatRs(subtotal)}</span>
                </div>
                {discount > 0 ? (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span>-{formatRs(discount)}</span>
                  </div>
                ) : null}
                {deliveryFee > 0 ? (
                  <div className="flex justify-between">
                    <span>Delivery</span>
                    <span>{formatRs(deliveryFee)}</span>
                  </div>
                ) : null}
                <div className="mt-1 flex justify-between border-y border-dashed border-zinc-800 py-1.5 text-[13px] font-black">
                  <span>TOTAL</span>
                  <span>{formatRs(grand)}</span>
                </div>
                <div className="flex justify-between pt-0.5 font-semibold">
                  <span>Payment</span>
                  <span>{paymentLabel(order)}</span>
                </div>
              </div>

              <p className="my-2 text-center text-[10px] tracking-widest">
                ========================================
              </p>

              <div className="space-y-1 text-center text-[9px] text-zinc-700">
                <p className="font-semibold text-black">
                  {footerNote?.trim() || `Thank you for shopping at ${shopBrand}!`}
                </p>
                <p className="pt-2 text-[8px] uppercase tracking-[0.25em] text-zinc-500">
                  Powered by
                </p>
                <p className="text-[11px] font-black tracking-wide text-emerald-800">
                  TrendsMart
                </p>
                <p className="text-[8px] text-zinc-500">
                  {shop.slug
                    ? `trendsmart.shop/${shop.slug}`
                    : "Local shops · Online + Counter"}
                </p>
                {printed ? (
                  <p className="pt-1 text-[7px] text-zinc-400">— Printed via TrendsMart POS —</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
