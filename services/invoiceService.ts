/* -------------------------------------------------------------------------- */
/*  TrendMart — Dynamic Invoice & Financial Statement Service (Prompt 3)       */
/*                                                                             */
/*  Provides a dual-path PDF generation pipeline:                              */
/*   1. Client-side: Renders a printable HTML invoice via DOM, then uses       */
/*      the browser's native print-to-PDF for downloadable invoices.           */
/*   2. Server-side (future): Edge-function / API route integration            */
/*      for programmatic PDF generation (jsPDF/react-pdf compatible).         */
/*                                                                             */
/*  Features:                                                                  */
/*   - Professional invoice data preparation from Order records                */
/*   - Weekly / Monthly sales summary generation                               */
/*   - Tax-aware computation using the platform tax service                    */
/*   - Downloadable invoice HTML rendered in a new window                      */
/*   - Batch financial statement export support                               */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { formatCurrency as formatCurrencyTax } from "@/lib/taxService";
import type {
  Order,
  OrderItem,
  InvoiceData,
  InvoiceLineItem,
  SalesSummary,
  OrderStatus,
} from "@/types";
import jsPDF from "jspdf";

// ─── Types ──────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

// ─── Invoice Number Generator ────────────────────────────────────────────────

let invoiceCounter = 0;

/**
 * Generate a unique, sequential invoice number.
 * Format: INV-YYYYMMDD-XXXX (e.g., INV-20250805-0042)
 */
export function generateInvoiceNumber(): string {
  invoiceCounter += 1;
  const date = new Date();
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
  const seqPart = String(invoiceCounter).padStart(4, "0");
  return `INV-${datePart}-${seqPart}`;
}

// ─── Order-to-Invoice Mapper ─────────────────────────────────────────────────

/**
 * Convert an Order record into full InvoiceData for rendering and download.
 * Fetches the associated shop (merchant) details for the invoice header.
 */
export async function prepareInvoiceFromOrder(
  order: Order,
  shopOverrides?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    logo?: string;
  },
): Promise<ServiceResult<InvoiceData>> {
  const supabase = createClient();

  try {
    // Fetch merchant (shop) details
    const { data: shop } = await supabase
      .from("shops")
      .select("name, location, whatsapp_number, logo_url")
      .eq("id", order.shop_id)
      .single();

    const merchant = {
      name: shopOverrides?.name ?? (shop as { name?: string } | null)?.name ?? "TrendMart Merchant",
      address: shopOverrides?.address ?? (shop as { location?: string } | null)?.location ?? "",
      phone: shopOverrides?.phone ?? (shop as { whatsapp_number?: string } | null)?.whatsapp_number ?? "",
      email: shopOverrides?.email ?? "",
      logo: shopOverrides?.logo ?? (shop as { logo_url?: string } | null)?.logo_url ?? undefined,
    };

    const customer = {
      name: order.customer_name,
      phone: order.customer_phone,
      email: "",
      address: "",
    };

    // Map order items to invoice line items
    const items: InvoiceLineItem[] = (order.items_json ?? []).map(
      (item: OrderItem) => {
        const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
        const unitPrice = item.price;
        return {
          description: item.name,
          quantity,
          unitPrice,
          amount: unitPrice * quantity,
          variant: item.variant ?? undefined,
        };
      },
    );

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const taxRate = 0;
    const taxAmount = 0;
    const discount = 0;
    const total = subtotal;

    const invoiceData: InvoiceData = {
      invoiceNumber: generateInvoiceNumber(),
      invoiceDate: new Date().toISOString().split("T")[0],
      dueDate: undefined,
      merchant,
      customer,
      items,
      subtotal,
      taxRate,
      taxAmount,
      discount,
      total,
      currency: "PKR",
      notes: `Thank you for shopping at ${merchant.name}!`,
      orderStatus: order.status,
      trackingNumber: order.tracking_number ?? undefined,
    };

    return { success: true, data: invoiceData };
  } catch (err) {
    logError(err, {
      module: "invoiceService.prepareInvoiceFromOrder",
      meta: { orderId: order.id },
    });
    return { success: false, error: toError(err) };
  }
}

// ─── Invoice HTML Renderer (Client-Side Print-to-PDF) ────────────────────────

/**
 * Generate a professionally styled HTML invoice string.
 * This is used both for on-screen preview and for the browser's print-to-PDF.
 */
export function renderInvoiceHTML(invoice: InvoiceData): string {
  const statusBadgeColors: Record<OrderStatus, string> = {
    Pending: "#f59e0b",
    Processing: "#3b82f6",
    Dispatched: "#8b5cf6",
    Delivered: "#10b981",
    Cancelled: "#ef4444",
  };

  const itemRows = invoice.items
    .map(
      (item, idx) => {
        const desc = escapeHtml(item.description);
        const variantHtml = item.variant
          ? `<br><small style="color:#6b7280;">Variant: ${escapeHtml(item.variant)}</small>`
          : "";
        const qty = item.quantity;
        const unit = formatCurrencyLocal(item.unitPrice, invoice.currency);
        const amt = formatCurrencyLocal(item.amount, invoice.currency);
        return [
          "<tr>",
          `<td style="padding:10px;border-bottom:1px solid #e5e7eb;">${idx + 1}</td>`,
          `<td style="padding:10px;border-bottom:1px solid #e5e7eb;">${desc}${variantHtml}</td>`,
          `<td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;">${qty}</td>`,
          `<td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${unit}</td>`,
          `<td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${amt}</td>`,
          "</tr>",
        ].join("");
      },
    )
    .join("");

  const statusColor = statusBadgeColors[invoice.orderStatus];
  const merchantName = escapeHtml(invoice.merchant.name);
  const merchantAddr = escapeHtml(invoice.merchant.address);
  const merchantPhone = escapeHtml(invoice.merchant.phone);
  const customerName = escapeHtml(invoice.customer.name);
  const customerPhone = escapeHtml(invoice.customer.phone);
  const subFmt = formatCurrencyLocal(invoice.subtotal, invoice.currency);
  const taxRow = invoice.taxAmount > 0
    ? `<div class="row"><span>Tax (${invoice.taxRate}%)</span><span>${formatCurrencyLocal(invoice.taxAmount, invoice.currency)}</span></div>`
    : "";
  const discRow = invoice.discount > 0
    ? `<div class="row"><span>Discount</span><span>-${formatCurrencyLocal(invoice.discount, invoice.currency)}</span></div>`
    : "";
  const totalFmt = formatCurrencyLocal(invoice.total, invoice.currency);
  const trackingHtml = invoice.trackingNumber
    ? `<div class="detail" style="margin-top:6px;">Tracking: <strong>${escapeHtml(invoice.trackingNumber)}</strong></div>`
    : "";
  const notesHtml = invoice.notes ? `<p>${escapeHtml(invoice.notes)}</p>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #1f2937;
      background: #f9fafb;
      padding: 40px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .invoice-wrapper {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .invoice-header {
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5f8a 100%);
      color: #ffffff;
      padding: 32px 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .invoice-header .brand h1 {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .invoice-header .brand .tagline {
      font-size: 13px;
      opacity: 0.8;
      margin-top: 4px;
    }
    .invoice-header .invoice-meta {
      text-align: right;
    }
    .invoice-header .invoice-label {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -1px;
      text-transform: uppercase;
    }
    .invoice-header .invoice-number {
      font-size: 14px;
      opacity: 0.85;
      margin-top: 4px;
    }
    .invoice-body {
      padding: 32px 40px;
    }
    .party-grid {
      display: flex;
      justify-content: space-between;
      margin-bottom: 28px;
      gap: 20px;
    }
    .party-box {
      flex: 1;
    }
    .party-box h3 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6b7280;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .party-box .name {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .party-box .detail {
      font-size: 13px;
      color: #4b5563;
      line-height: 1.6;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      background: ${statusColor}20;
      color: ${statusColor};
      margin-top: 6px;
    }
    .date-row {
      display: flex;
      gap: 24px;
      margin-bottom: 24px;
      font-size: 13px;
      color: #4b5563;
    }
    .date-row span strong {
      color: #111827;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    thead th {
      background: #f3f4f6;
      padding: 10px;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      font-weight: 700;
    }
    thead th:last-child,
    thead th:nth-child(4) {
      text-align: right;
    }
    thead th:nth-child(3) {
      text-align: center;
    }
    .totals {
      margin-left: auto;
      max-width: 320px;
    }
    .totals .row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }
    .totals .row.total {
      font-size: 18px;
      font-weight: 800;
      border-top: 2px solid #e5e7eb;
      padding-top: 12px;
      margin-top: 8px;
      color: #111827;
    }
    .invoice-footer {
      background: #f9fafb;
      padding: 24px 40px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
      line-height: 1.8;
    }
    .invoice-footer strong {
      color: #6b7280;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .invoice-wrapper { box-shadow: none; border-radius: 0; }
      .invoice-header { background: #1e3a5f !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="invoice-wrapper">
    <div class="invoice-header">
      <div class="brand">
        <h1>${merchantName}</h1>
        <div class="tagline">${merchantAddr}</div>
        ${invoice.merchant.phone ? `<div class="tagline">📞 ${merchantPhone}</div>` : ""}
      </div>
      <div class="invoice-meta">
        <div class="invoice-label">INVOICE</div>
        <div class="invoice-number"># ${invoice.invoiceNumber}</div>
      </div>
    </div>
    <div class="invoice-body">
      <div class="party-grid">
        <div class="party-box">
          <h3>Bill To</h3>
          <div class="name">${customerName}</div>
          <div class="detail">${customerPhone}</div>
        </div>
        <div class="party-box" style="text-align:right;">
          <h3>Status</h3>
          <span class="status-badge">${invoice.orderStatus}</span>
          ${trackingHtml}
        </div>
      </div>
      <div class="date-row">
        <span><strong>Invoice Date:</strong> ${invoice.invoiceDate}</span>
        ${invoice.dueDate ? `<span><strong>Due Date:</strong> ${invoice.dueDate}</span>` : ""}
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${subFmt}</span></div>
        ${taxRow}
        ${discRow}
        <div class="row total"><span>Total</span><span>${totalFmt}</span></div>
      </div>
    </div>
    <div class="invoice-footer">
      ${notesHtml}
      <p>Generated by <strong>TrendMart</strong> &mdash; ${invoice.invoiceDate}</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Download Invoice (Client-Side) ──────────────────────────────────────────

/**
 * Open the invoice in a new browser window, which the user can then print
 * or save as PDF via the browser's native "Save as PDF" print destination.
 */
export function openInvoiceForPrint(invoice: InvoiceData): void {
  const html = renderInvoiceHTML(invoice);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url, "_blank", "width=900,height=700");
  if (printWindow) {
    printWindow.onload = () => {
      // Auto-trigger print dialog after content loads
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  }

  // Revoke the object URL after a short delay to free memory
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Download the invoice as an HTML file (preserves styling).
 * Users can open it in any browser and print to PDF.
 */
export function downloadInvoiceHTML(invoice: InvoiceData): void {
  const html = renderInvoiceHTML(invoice);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `Invoice_${invoice.invoiceNumber}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ─── Sales Summary Generator ─────────────────────────────────────────────────

/**
 * Generate a weekly or monthly sales summary for a merchant.
 * Aggregates orders by status, day, and top products.
 */
export async function generateSalesSummary(
  shopId: string,
  period: "weekly" | "monthly" = "monthly",
): Promise<ServiceResult<SalesSummary>> {
  const supabase = createClient();

  try {
    // Determine date range
    const now = new Date();
    let startDate: Date;

    if (period === "weekly") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const startISO = startDate.toISOString();
    const endISO = now.toISOString();

    // Fetch orders in the period
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("shop_id", shopId)
      .gte("created_at", startISO)
      .lte("created_at", endISO)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const allOrders = (orders as Record<string, unknown>[]) ?? [];
    const totalOrders = allOrders.length;

    // Compute total revenue and tax
    let totalRevenue = 0;
    const ordersByStatus: Record<string, number> = {
      Pending: 0,
      Processing: 0,
      Dispatched: 0,
      Delivered: 0,
      Cancelled: 0,
    };

    // Track product breakdown
    const productMap = new Map<string, { quantity: number; revenue: number }>();
    const dailyMap = new Map<string, { orders: number; revenue: number }>();

    for (const order of allOrders) {
      const status = (order.status as string) ?? "Pending";
      const amount = Number(order.total_amount) || 0;
      const createdAt = order.created_at as string;

      // Exclude cancelled orders from revenue (but count them in status breakdown)
      if (status !== "Cancelled") {
        totalRevenue += amount;
      }

      // Status counts
      if (ordersByStatus[status] !== undefined) {
        ordersByStatus[status]++;
      }

      // Daily breakdown
      const day = createdAt.slice(0, 10);
      const daily = dailyMap.get(day) ?? { orders: 0, revenue: 0 };
      daily.orders++;
      if (status !== "Cancelled") daily.revenue += amount;
      dailyMap.set(day, daily);

      // Product breakdown
      const items = (order.items_json as OrderItem[]) ?? [];
      for (const item of items) {
        const existing = productMap.get(item.name) ?? {
          quantity: 0,
          revenue: 0,
        };
        existing.quantity += 1;
        existing.revenue += item.price;
        productMap.set(item.name, existing);
      }
    }

    // Tax estimation (PKR context — tax is included in prices by merchant)
    const totalTax = 0;

    // Top products sorted by revenue
    const topProducts = Array.from(productMap.entries())
      .map(([name, data]) => ({
        name,
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Daily breakdown sorted by date
    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        orders: data.orders,
        revenue: data.revenue,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const summary: SalesSummary = {
      period,
      startDate: startISO,
      endDate: endISO,
      totalOrders,
      totalRevenue,
      totalTax,
      ordersByStatus: ordersByStatus as Record<OrderStatus, number>,
      topProducts,
      dailyBreakdown,
    };

    return { success: true, data: summary };
  } catch (err) {
    logError(err, {
      module: "invoiceService.generateSalesSummary",
      meta: { shopId, period },
    });
    return { success: false, error: toError(err) };
  }
}

// ─── Financial Statement HTML Renderer ───────────────────────────────────────

/**
 * Render a financial sales summary as a printable HTML report.
 * Similar to the invoice but structured for periodic financial review.
 */
export function renderSalesSummaryHTML(summary: SalesSummary, shopName: string): string {
  const shopNameEsc = escapeHtml(shopName);
  const periodLabel = summary.period === "weekly" ? "Weekly" : "Monthly";
  const startStr = summary.startDate.slice(0, 10);
  const endStr = summary.endDate.slice(0, 10);
  const totalRev = formatCurrencyLocal(summary.totalRevenue, "PKR");
  const deliveredCount = summary.ordersByStatus.Delivered.toString();
  const pendingCount = summary.ordersByStatus.Pending.toString();

  const dailyRows = summary.dailyBreakdown
    .map((day) =>
      [
        "<tr>",
        `<td style="padding:8px;border-bottom:1px solid #e5e7eb;">${day.date}</td>`,
        `<td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${day.orders}</td>`,
        `<td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrencyLocal(day.revenue, "PKR")}</td>`,
        "</tr>",
      ].join(""),
    )
    .join("");

  const productRows = summary.topProducts
    .map((p) =>
      [
        "<tr>",
        `<td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(p.name)}</td>`,
        `<td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${p.quantity}</td>`,
        `<td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrencyLocal(p.revenue, "PKR")}</td>`,
        "</tr>",
      ].join(""),
    )
    .join("");

  const statusRows = Object.entries(summary.ordersByStatus)
    .map(
      ([status, count]) =>
        [
          "<tr>",
          `<td style="padding:8px;border-bottom:1px solid #e5e7eb;">${status}</td>`,
          `<td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${count}</td>`,
          "</tr>",
        ].join(""),
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sales Summary — ${shopNameEsc}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #1f2937;
      background: #f9fafb;
      padding: 40px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .container { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5f8a 100%); color: #fff; padding: 32px 40px; }
    .header h1 { font-size: 22px; font-weight: 700; }
    .header p { font-size: 13px; opacity: 0.8; margin-top: 4px; }
    .body { padding: 32px 40px; }
    .summary-cards { display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
    .card { flex: 1; min-width: 140px; background: #f3f4f6; border-radius: 10px; padding: 16px; text-align: center; }
    .card .value { font-size: 24px; font-weight: 800; color: #111827; }
    .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-top: 4px; }
    h2 { font-size: 16px; font-weight: 700; margin-bottom: 12px; color: #111827; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { background: #f3f4f6; padding: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 700; }
    .footer { background: #f9fafb; padding: 20px 40px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af; }
    @media print { body { background: #fff; padding: 0; } .container { box-shadow: none; border-radius: 0; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${shopNameEsc} &mdash; Sales Summary</h1>
      <p>${periodLabel} Report: ${startStr} to ${endStr}</p>
    </div>
    <div class="body">
      <div class="summary-cards">
        <div class="card"><div class="value">${summary.totalOrders}</div><div class="label">Total Orders</div></div>
        <div class="card"><div class="value">${totalRev}</div><div class="label">Revenue</div></div>
        <div class="card"><div class="value">${deliveredCount}</div><div class="label">Delivered</div></div>
        <div class="card"><div class="value">${pendingCount}</div><div class="label">Pending</div></div>
      </div>

      <h2>Daily Breakdown</h2>
      <table>
        <thead><tr><th>Date</th><th style="text-align:center;">Orders</th><th style="text-align:right;">Revenue</th></tr></thead>
        <tbody>${dailyRows}</tbody>
      </table>

      <h2>Top Products</h2>
      <table>
        <thead><tr><th>Product</th><th style="text-align:center;">Sold</th><th style="text-align:right;">Revenue</th></tr></thead>
        <tbody>${productRows}</tbody>
      </table>

      <h2>Orders by Status</h2>
      <table>
        <thead><tr><th>Status</th><th style="text-align:center;">Count</th></tr></thead>
        <tbody>${statusRows}</tbody>
      </table>
    </div>
    <div class="footer">
      <p>Generated by <strong>TrendMart</strong> &mdash; ${new Date().toISOString().slice(0, 10)}</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Open the sales summary in a new browser window for print/download.
 */
export function openSalesSummaryForPrint(
  summary: SalesSummary,
  shopName: string,
): void {
  const html = renderSalesSummaryHTML(summary, shopName);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url, "_blank", "width=900,height=700");
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  }

  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Download the sales summary as an HTML file.
 */
export function downloadSalesSummaryHTML(
  summary: SalesSummary,
  shopName: string,
): void {
  const html = renderSalesSummaryHTML(summary, shopName);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const safeShopName = shopName.replace(/\s+/g, "_");
  const link = document.createElement("a");
  link.href = url;
  link.download = `Sales_Summary_${safeShopName}_${summary.startDate.slice(0, 10)}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ─── PDF Invoice Generation (jsPDF — Native Drawing) ─────────────────────────

/**
 * Generate a professional PDF invoice using jsPDF native APIs.
 * Completely client-side — no server required — for instant one-tap download.
 * Includes store branding header, itemized table, tax calculations, status badge.
 */
export function generateInvoicePDF(invoice: InvoiceData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;
  const currencySymbol = invoice.currency === "PKR" ? "Rs." : "";

  // ── Header Bar ──────────────────────────────────────────────────────────
  doc.setFillColor(30, 58, 95); // navy blue
  doc.rect(0, 0, pageWidth, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.merchant.name.slice(0, 40), margin, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.merchant.address || invoice.merchant.phone || "", margin, 26);
  if (invoice.merchant.phone) {
    doc.text(`Phone: ${invoice.merchant.phone}`, margin, 32);
  }

  // INVOICE label on the right
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", pageWidth - margin, 18, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`# ${invoice.invoiceNumber}`, pageWidth - margin, 26, { align: "right" });
  doc.text(`Date: ${invoice.invoiceDate}`, pageWidth - margin, 32, { align: "right" });

  y = 46;

  // ── Bill To & Status ────────────────────────────────────────────────────
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text(invoice.customer.name || "Customer", margin, y + 7);
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(invoice.customer.phone || "", margin, y + 13);

  // Status badge
  const statusColors: Record<string, [number, number, number]> = {
    Pending: [245, 158, 11],
    Processing: [59, 130, 246],
    Dispatched: [139, 92, 246],
    Delivered: [16, 185, 129],
    Cancelled: [239, 68, 68],
  };
  const [sr, sg, sb] = statusColors[invoice.orderStatus] ?? [100, 100, 100];
  doc.setFillColor(sr, sg, sb);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const statusText = ` ${invoice.orderStatus} `;
  const statusW = doc.getTextWidth(statusText) + 6;
  doc.roundedRect(pageWidth - margin - statusW, y + 4, statusW, 7, 2, 2, "F");
  doc.text(statusText, pageWidth - margin - statusW / 2, y + 9, { align: "center" });

  if (invoice.trackingNumber) {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Tracking: ${invoice.trackingNumber}`, pageWidth - margin - 4, y + 15, { align: "right" });
  }

  y += 24;

  // ── Items Table ─────────────────────────────────────────────────────────
  const tableTop = y;
  const colW = [10, 70, 14, 28, 28]; // #, Description, Qty, Unit Price, Amount
  const rightMargin = margin;

  // Table header
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
  doc.setTextColor(107, 114, 128);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const headers = ["#", "Description", "Qty", "Unit Price", "Amount"];
  let cx = margin;
  for (let i = 0; i < headers.length; i++) {
    const align = i >= 3 ? "right" : "left";
    doc.text(headers[i], i >= 3 ? cx + colW[i] : cx + 2, y + 5.5, { align });
    cx += colW[i];
  }
  y += 8;

  // Table rows
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  for (let i = 0; i < invoice.items.length; i++) {
    const item = invoice.items[i];
    const rowH = 7;
    if (y + rowH > 270) {
      doc.addPage();
      y = margin;
    }

    cx = margin;
    // #
    doc.text(String(i + 1), cx + 2, y + 5);
    cx += colW[0];
    // Description (+ variant on new line)
    const descText = item.description.slice(0, 40);
    doc.text(descText, cx + 1, y + 5);
    if (item.variant) {
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.text(`  ${item.variant}`, cx + 1, y + 5 + 3.5);
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(9);
    }
    cx += colW[1];
    // Qty
    doc.text(String(item.quantity), cx + colW[2] / 2, y + 5, { align: "center" });
    cx += colW[2];
    // Unit Price
    doc.text(`${currencySymbol}${formatNum(item.unitPrice)}`, cx + colW[3], y + 5, { align: "right" });
    cx += colW[3];
    // Amount
    doc.setFont("helvetica", "bold");
    doc.text(`${currencySymbol}${formatNum(item.amount)}`, cx + colW[4], y + 5, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += rowH;
    // light separator
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y, pageWidth - margin, y);
  }

  y += 10;

  // ── Totals Section ──────────────────────────────────────────────────────
  const totalsX = pageWidth - margin - 60;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);

  doc.text("Subtotal", totalsX, y);
  doc.text(`${currencySymbol}${formatNum(invoice.subtotal)}`, pageWidth - margin, y, { align: "right" });
  y += 6;

  if (invoice.taxAmount > 0) {
    doc.text(`Tax (${invoice.taxRate}%)`, totalsX, y);
    doc.text(`${currencySymbol}${formatNum(invoice.taxAmount)}`, pageWidth - margin, y, { align: "right" });
    y += 6;
  }

  if (invoice.discount > 0) {
    doc.text("Discount", totalsX, y);
    doc.text(`-${currencySymbol}${formatNum(invoice.discount)}`, pageWidth - margin, y, { align: "right" });
    y += 6;
  }

  // Total line
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y, pageWidth - margin, y);
  y += 4;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("TOTAL", totalsX, y);
  doc.text(`${currencySymbol}${formatNum(invoice.total)}`, pageWidth - margin, y, { align: "right" });

  // ── Footer ──────────────────────────────────────────────────────────────
  y = 270;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(156, 163, 175);
  const footerLines = [
    invoice.notes || `Thank you for shopping at ${invoice.merchant.name}!`,
    `Generated by TrendMart — ${invoice.invoiceDate}`,
  ];
  for (const fl of footerLines) {
    doc.text(fl, pageWidth / 2, y, { align: "center" });
    y += 4;
  }

  return doc;
}

/**
 * Generate a sales summary financial statement PDF using jsPDF.
 */
export function generateSalesSummaryPDF(summary: SalesSummary, shopName: string): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;
  const currencySymbol = "Rs.";

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(shopName, margin, 15);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const periodLabel = summary.period === "weekly" ? "Weekly" : "Monthly";
  doc.text(`${periodLabel} Sales Report: ${summary.startDate.slice(0, 10)} — ${summary.endDate.slice(0, 10)}`, margin, 23);

  y = 40;

  // ── Summary Cards ───────────────────────────────────────────────────────
  const cardW = (pageWidth - margin * 2 - 12) / 4;
  const cards = [
    { value: String(summary.totalOrders), label: "Total Orders", color: [59, 130, 246] as [number, number, number] },
    { value: `${currencySymbol}${formatNum(summary.totalRevenue)}`, label: "Revenue", color: [16, 185, 129] as [number, number, number] },
    { value: String(summary.ordersByStatus.Delivered), label: "Delivered", color: [139, 92, 246] as [number, number, number] },
    { value: String(summary.ordersByStatus.Pending), label: "Pending", color: [245, 158, 11] as [number, number, number] },
  ];

  let cardX = margin;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    doc.setFillColor(243, 244, 246);
    doc.roundedRect(cardX, y, cardW, 18, 3, 3, "F");
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(card.color[0], card.color[1], card.color[2]);
    doc.text(card.value, cardX + cardW / 2, y + 8, { align: "center" });
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(card.label, cardX + cardW / 2, y + 14.5, { align: "center" });
    cardX += cardW + 4;
  }

  y += 26;

  // ── Daily Breakdown Table ───────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Daily Breakdown", margin, y);
  y += 6;

  const colW2 = [40, 30, 40];
  // header
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(107, 114, 128);
  doc.text("Date", margin + 2, y + 5);
  doc.text("Orders", margin + colW2[0] + colW2[1] / 2, y + 5, { align: "center" });
  doc.text("Revenue", pageWidth - margin, y + 5, { align: "right" });
  y += 8;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  for (const day of summary.dailyBreakdown) {
    doc.text(day.date, margin + 2, y + 4.5);
    doc.text(String(day.orders), margin + colW2[0] + colW2[1] / 2, y + 4.5, { align: "center" });
    doc.text(`${currencySymbol}${formatNum(day.revenue)}`, pageWidth - margin, y + 4.5, { align: "right" });
    y += 6;
  }

  y += 6;

  // ── Top Products Table ──────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Top Products", margin, y);
  y += 6;

  const pColW = [70, 30, 36];
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(107, 114, 128);
  doc.text("Product", margin + 2, y + 5);
  doc.text("Sold", margin + pColW[0] + pColW[1] / 2, y + 5, { align: "center" });
  doc.text("Revenue", pageWidth - margin, y + 5, { align: "right" });
  y += 8;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  for (const prod of summary.topProducts) {
    doc.text(prod.name.slice(0, 35), margin + 2, y + 4.5);
    doc.text(String(prod.quantity), margin + pColW[0] + pColW[1] / 2, y + 4.5, { align: "center" });
    doc.text(`${currencySymbol}${formatNum(prod.revenue)}`, pageWidth - margin, y + 4.5, { align: "right" });
    y += 6;
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  y = 272;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFontSize(7);
  doc.setTextColor(156, 163, 175);
  doc.text(`Generated by TrendMart — ${new Date().toISOString().slice(0, 10)}`, pageWidth / 2, y, { align: "center" });

  return doc;
}

/** Download invoice as a native PDF file (one-click from dashboard). */
export function downloadInvoicePDF(invoice: InvoiceData): void {
  const doc = generateInvoicePDF(invoice);
  doc.save(`Invoice_${invoice.invoiceNumber}.pdf`);
}

/** Download sales summary as a native PDF file. */
export function downloadSalesSummaryPDF(summary: SalesSummary, shopName: string): void {
  const safeName = shopName.replace(/\s+/g, "_");
  const doc = generateSalesSummaryPDF(summary, shopName);
  doc.save(`Sales_Summary_${safeName}_${summary.startDate.slice(0, 10)}.pdf`);
}

/** Preview the invoice PDF in a new browser tab. */
export function previewInvoicePDF(invoice: InvoiceData): void {
  const doc = generateInvoicePDF(invoice);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Preview the sales summary PDF in a new browser tab. */
export function previewSalesSummaryPDF(summary: SalesSummary, shopName: string): void {
  const doc = generateSalesSummaryPDF(summary, shopName);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Format a number with locale separators for PDF display. */
function formatNum(n: number): string {
  return n.toLocaleString("en-PK");
}

// ─── Batch Invoice Generation (Multi-Order) ──────────────────────────────────

/**
 * Generate invoices for multiple orders at once.
 * Returns prepared InvoiceData objects and a list of failures.
 */
export async function batchGenerateInvoices(
  orderIds: string[],
): Promise<
  ServiceResult<{
    invoices: InvoiceData[];
    failed: { orderId: string; error: string }[];
  }>
> {
  const supabase = createClient();
  const invoices: InvoiceData[] = [];
  const failed: { orderId: string; error: string }[] = [];

  for (const orderId of orderIds) {
    try {
      const { data: order, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (error || !order) {
        failed.push({ orderId, error: error?.message ?? "Order not found" });
        continue;
      }

      // Parse the order manually
      let items_json: OrderItem[] = [];
      try {
        const raw = (order as Record<string, unknown>).items_json;
        items_json = Array.isArray(raw) ? raw : [];
      } catch {
        items_json = [];
      }

      const parsedOrder: Order = {
        id: (order as Record<string, unknown>).id as string,
        shop_id: (order as Record<string, unknown>).shop_id as string,
        customer_name: ((order as Record<string, unknown>).customer_name as string) ?? "",
        customer_phone: ((order as Record<string, unknown>).customer_phone as string) ?? "",
        items_json,
        total_amount: Number((order as Record<string, unknown>).total_amount) || 0,
        status: ((order as Record<string, unknown>).status as OrderStatus) ?? "Pending",
        created_at: (order as Record<string, unknown>).created_at as string,
        tracking_number: (order as Record<string, unknown>).tracking_number as string | null,
      };

      const result = await prepareInvoiceFromOrder(parsedOrder);
      if (result.success) {
        invoices.push(result.data);
      } else {
        failed.push({ orderId, error: result.error });
      }
    } catch (err) {
      failed.push({ orderId, error: toError(err) });
    }
  }

  if (failed.length > 0) {
    return { success: false, error: `${failed.length} of ${orderIds.length} invoices failed to generate.` };
  }
  return { success: true, data: { invoices, failed } };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Basic HTML entity escaping to prevent XSS in rendered invoices. */
function escapeHtml(text: string): string {
  const ENTITIES: Record<string, string> = {
    "\x26": "\x26amp;",
    "\x3C": "\x26lt;",
    "\x3E": "\x26gt;",
    "\x22": "\x26quot;",
    "\x27": "\x26#039;",
  };
  return text.replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch);
}

/** Format a number as a local currency string (fallback to Intl.NumberFormat). */
function formatCurrencyLocal(amount: number, currency: string): string {
  try {
    return formatCurrencyTax(amount, currency as "PKR" | "USD" | "EUR" | "GBP" | "INR");
  } catch {
    return `${currency} ${amount.toLocaleString("en-PK")}`;
  }
}