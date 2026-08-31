/* -------------------------------------------------------------------------- */
/*  TrendsMart — Automated CSV Sales & Inventory Data Export Service            */
/*  Prompt 5: Comprehensive client-side CSV export with sales history,         */
/*           order reports, inventory levels, and merchant accounting data.     */
/* -------------------------------------------------------------------------- */

import type { Product, Order, VariantGroup } from "@/types";
import {
  escapeCSVField,
  buildCSVDocument,
  sanitizeLight,
  sanitizePathSegment,
} from "@/lib/sanitization";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ProductExportRow {
  name: string;
  description: string;
  price: number;
  currency: string;
  is_available: string;
  /** Variant breakdown (e.g. "Size S: 5 in stock, Size M: 3 in stock"). */
  variants: string;
  /** Total stock across all variants. */
  total_stock: string;
  created_at: string;
}

export interface OrderExportRow {
  order_id: string;
  customer_name: string;
  customer_phone: string;
  items: string;
  item_count: number;
  subtotal: number;
  discount: number;
  grand_total: number;
  status: string;
  /** Payment method (always "WhatsApp Order" for now). */
  payment_method: string;
  created_at: string;
  updated_at: string;
  /** Customer delivery address if available. */
  shipping_address: string;
  /** Order notes if available. */
  notes: string;
}

export interface InventoryExportRow {
  product_name: string;
  variant_group: string;
  variant_label: string;
  sku: string;
  stock: number;
  low_stock_threshold: number;
  is_available: string;
  price: number;
  /** "Low Stock" / "In Stock" / "Out of Stock" / "Unavailable" */
  stock_status: string;
}

export interface SalesSummaryExportRow {
  order_id: string;
  date: string;
  customer: string;
  phone: string;
  items: string;
  total: number;
  status: string;
}

export type ExportFormat = "csv" | "json";

/* -------------------------------------------------------------------------- */
/*  CSV Helpers (using shared sanitization library)                             */
/* -------------------------------------------------------------------------- */

/**
 * Sanitize a value for CSV export — prevents formula injection
 * AND escapes CSV special characters. Wraps the shared utility.
 */
function sanitizeCSVValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Strip HTML/scripts first, then apply CSV escaping
  const cleaned = typeof value === "string" ? sanitizeLight(value) : String(value);
  return escapeCSVField(cleaned);
}

/**
 * Build a CSV string from headers and rows with full sanitization.
 * Each field is sanitized against HTML/XSS first, then CSV-escaped.
 */
function buildCSV(headers: string[], rows: string[][]): string {
  return buildCSVDocument(
    headers.map((h) => sanitizeLight(h)),
    rows,
  );
}

/**
 * Format date as YYYY-MM-DD.
 */
function formatDateOnly(iso: string): string {
  try {
    return new Date(iso).toISOString().split("T")[0];
  } catch {
    return iso;
  }
}

/**
 * Format date-time for full timestamp reporting.
 */
function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-PK", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/* -------------------------------------------------------------------------- */
/*  Variant Stock Aggregation                                                  */
/* -------------------------------------------------------------------------- */

function getVariantSummary(variants: VariantGroup[] | null | undefined): {
  summary: string;
  totalStock: number;
} {
  if (!variants || variants.length === 0) {
    return { summary: "No variants", totalStock: -1 };
  }

  const parts: string[] = [];
  let totalStock = 0;

  for (const group of variants) {
    for (const opt of group.options) {
      const stock = opt.stock ?? 0;
      totalStock += stock;
      parts.push(
        `${group.name} ${opt.label}: ${stock}${opt.sku ? ` (SKU: ${opt.sku})` : ""}`,
      );
    }
  }

  return {
    summary: parts.join("; ") || "No variants",
    totalStock,
  };
}

function getVariantStockStatus(stock: number, threshold: number, isAvailable: boolean): string {
  if (!isAvailable) return "Unavailable";
  if (stock <= 0) return "Out of Stock";
  if (stock <= threshold) return "Low Stock";
  return "In Stock";
}

/* -------------------------------------------------------------------------- */
/*  Product Exports                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Format products array into enhanced CSV string for download.
 * Includes variant stock breakdown and total stock counts.
 */
export function exportProductsToCSV(products: Product[]): string {
  const headers = [
    "Name",
    "Description",
    "Price (PKR)",
    "Currency",
    "Available",
    "Variants",
    "Total Stock",
    "Created At",
  ];

  const rows = products.map((p) => {
    const { summary, totalStock } = getVariantSummary(p.variants);
    return [
      sanitizeCSVValue(p.name),
      sanitizeCSVValue(p.description),
      p.price.toString(),
      sanitizeCSVValue(p.currency ?? "PKR"),
      p.is_available ? "Yes" : "No",
      sanitizeCSVValue(summary),
      totalStock >= 0 ? totalStock.toString() : "N/A",
      p.created_at ? formatDateOnly(p.created_at) : "",
    ];
  });

  return buildCSV(headers, rows);
}

/**
 * Export products as detailed inventory CSV with per-variant breakdown.
 * Each row represents one variant of one product (for granular tracking).
 */
export function exportInventoryToCSV(products: Product[]): string {
  const headers = [
    "Product Name",
    "Variant Group",
    "Variant Label",
    "SKU",
    "Stock",
    "Low Stock Threshold",
    "Available",
    "Price (PKR)",
    "Stock Status",
  ];

  const rows: string[][] = [];

  for (const product of products) {
    const variants = product.variants ?? [];

    if (variants.length === 0) {
      // Product has no variants — export as a single row
      rows.push([
        sanitizeCSVValue(product.name),
        "N/A",
        "Default",
        "",
        "N/A",
        "5",
        product.is_available ? "Yes" : "No",
        product.price.toString(),
        product.is_available ? "In Stock" : "Unavailable",
      ]);
    } else {
      for (const group of variants) {
        for (const opt of group.options) {
          rows.push([
            sanitizeCSVValue(product.name),
            sanitizeCSVValue(group.name),
            sanitizeCSVValue(opt.label),
            sanitizeCSVValue(opt.sku ?? ""),
            (opt.stock ?? 0).toString(),
            (opt.low_stock_threshold ?? 5).toString(),
            (opt.is_available ?? true) ? "Yes" : "No",
            (product.price + (opt.price_adj ?? 0)).toString(),
            getVariantStockStatus(opt.stock ?? 0, opt.low_stock_threshold ?? 5, opt.is_available ?? true),
          ]);
        }
      }
    }
  }

  return buildCSV(headers, rows);
}

/* -------------------------------------------------------------------------- */
/*  Order Exports                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Format orders array into enriched CSV string for download.
 * Includes customer details, items breakdown, discount info, and timestamps.
 */
export function exportOrdersToCSV(orders: Order[]): string {
  const headers = [
    "Order ID",
    "Customer Name",
    "Customer Phone",
    "Items",
    "Item Count",
    "Subtotal (PKR)",
    "Discount (PKR)",
    "Grand Total (PKR)",
    "Status",
    "Payment Method",
    "Created At",
    "Last Updated",
    "Shipping Address",
    "Notes",
  ];

  const rows = orders.map((o) => {
    const items = o.items_json ?? [];
    const itemNames = items.map((i) => `${sanitizeLight(i.name)}${i.variant ? ` (${sanitizeLight(i.variant)})` : ""} @ ${i.price}`).join("; ");
    const itemCount = items.length;

    return [
      sanitizeCSVValue(o.id.slice(0, 8).toUpperCase()),
      sanitizeCSVValue(o.customer_name),
      sanitizeCSVValue(o.customer_phone),
      itemNames || "No items",
      itemCount.toString(),
      o.total_amount.toString(),
      "0", // Discount not tracked on order currently — extend schema for this
      o.total_amount.toString(),
      sanitizeCSVValue(o.status),
      "WhatsApp Order",
      formatDateTime(o.created_at),
      o.updated_at ? formatDateTime(o.updated_at) : "",
      "", // Address not tracked on order
      "", // Notes not tracked on order
    ];
  });

  return buildCSV(headers, rows);
}

/**
 * Export a sales summary/report CSV — one row per order with clean accounting columns.
 * Suitable for offline accounting and P&L analysis.
 */
export function exportSalesSummaryToCSV(orders: Order[], shopName?: string): string {
  const now = new Date().toLocaleDateString("en-PK", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const headers = [
    "Report: Sales Summary",
    shopName ? `Shop: ${shopName}` : "All Shops",
    `Generated: ${now}`,
  ];

  const dataHeaders = [
    "Order Ref",
    "Date",
    "Customer",
    "Phone",
    "Items",
    "Quantity",
    "Total (PKR)",
    "Status",
  ];

  const rows = orders.map((o) => {
    const items = o.items_json ?? [];
    const itemNames = items.map((i) => sanitizeLight(i.name)).join(", ");
    const totalQty = items.length;

    return [
      sanitizeCSVValue(o.id.slice(0, 8).toUpperCase()),
      formatDateOnly(o.created_at),
      sanitizeCSVValue(o.customer_name),
      sanitizeCSVValue(o.customer_phone),
      itemNames || "N/A",
      totalQty.toString(),
      o.total_amount.toString(),
      sanitizeCSVValue(o.status),
    ];
  });

  // Summary rows
  const totalRevenue = orders
    .filter((o) => o.status !== "Cancelled")
    .reduce((sum, o) => sum + o.total_amount, 0);
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === "Pending").length;
  const completedOrders = orders.filter((o) => o.status === "Delivered").length;

  const summaryRows = [
    [""],
    ["SUMMARY"],
    ["Total Orders", totalOrders.toString()],
    ["Completed Orders", completedOrders.toString()],
    ["Pending Orders", pendingOrders.toString()],
    ["Total Revenue (PKR)", totalRevenue.toString()],
    ["Average Order Value (PKR)", totalOrders > 0 ? Math.round(totalRevenue / totalOrders).toString() : "0"],
  ];

  const headerSection = headers.map((h) => sanitizeLight(h)).map((h) => escapeCSVField(h)).join(",");
  const dataHeaderLine = dataHeaders.map((h) => escapeCSVField(h)).join(",");
  const dataLines = rows.map((row) => row.map((cell) => escapeCSVField(cell)).join(","));
  const summaryLines = summaryRows.map((row) => row.map((cell) => escapeCSVField(cell)).join(","));

  return [
    headerSection,
    "",
    dataHeaderLine,
    ...dataLines,
    ...summaryLines,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Inventory Report                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Generate a formatted text inventory report.
 */
export function generateInventoryReport(products: Product[]): string {
  const now = new Date().toLocaleString("en-PK");
  const lines: string[] = [
    "═════════════════════════════════════",
    "   TRENDSMART INVENTORY REPORT",
    `   Generated: ${now}`,
    "═════════════════════════════════════",
    "",
    `Total Products: ${products.length}`,
    `Available: ${products.filter((p) => p.is_available).length}`,
    `Sold Out: ${products.filter((p) => !p.is_available).length}`,
    "",
    "─────────────────────────────────────",
    "   PRODUCT LISTING (with Variants)",
    "─────────────────────────────────────",
  ];

  products.forEach((p, idx) => {
    const status = p.is_available ? "✓ AVAILABLE" : "✗ SOLD OUT";
    lines.push("");
    lines.push(`${idx + 1}. ${p.name}`);
    lines.push(`   Price: Rs. ${p.price.toLocaleString()}${p.currency ? ` ${p.currency}` : ""}`);
    lines.push(`   Status: ${status}`);

    if (p.variants && p.variants.length > 0) {
      lines.push("   Variants:");
      for (const group of p.variants) {
        for (const opt of group.options) {
          const stockStatus =
            !opt.is_available
              ? "Unavailable"
              : (opt.stock ?? 0) <= 0
                ? "❌ Out of Stock"
                : (opt.stock ?? 0) <= (opt.low_stock_threshold ?? 5)
                  ? "⚠ Low Stock"
                  : "✓ In Stock";
          lines.push(
            `     ${group.name} ${opt.label}: ${opt.stock ?? 0} in stock ${stockStatus}${opt.sku ? ` (SKU: ${opt.sku})` : ""}`,
          );
        }
      }
    }

    if (p.description) {
      lines.push(`   Description: ${p.description.slice(0, 100)}${p.description.length > 100 ? "..." : ""}`);
    }
  });

  lines.push("");
  lines.push("═════════════════════════════════════");
  lines.push("   End of Report – TrendsMart");

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  JSON Export (for API consumers)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Export sales data as structured JSON.
 */
export function exportSalesAsJSON(orders: Order[]): string {
  const data = orders.map((o) => ({
    order_id: o.id,
    customer: {
      name: o.customer_name,
      phone: o.customer_phone,
    },
    items: (o.items_json ?? []).map((i) => ({
      name: i.name,
      variant: i.variant ?? null,
      price: i.price,
      product_id: i.product_id ?? null,
    })),
    total_amount: o.total_amount,
    status: o.status,
    created_at: o.created_at,
    updated_at: o.updated_at ?? null,
  }));

  return JSON.stringify(data, null, 2);
}

/**
 * Export inventory data as structured JSON.
 */
export function exportInventoryAsJSON(products: Product[]): string {
  const data = products.map((p) => {
    const { totalStock } = getVariantSummary(p.variants);
    return {
      product_id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency ?? "PKR",
      is_available: p.is_available,
      total_stock: totalStock >= 0 ? totalStock : null,
      variants: (p.variants ?? []).map((group) => ({
        group: group.name,
        options: group.options.map((opt) => ({
          label: opt.label,
          stock: opt.stock ?? 0,
          low_stock_threshold: opt.low_stock_threshold ?? 5,
          is_available: opt.is_available ?? true,
          sku: opt.sku ?? null,
          price_adjustment: opt.price_adj ?? 0,
        })),
      })),
      created_at: p.created_at ?? null,
    };
  });

  return JSON.stringify(data, null, 2);
}

/* -------------------------------------------------------------------------- */
/*  Download Helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Trigger a browser file download for text content.
 * Safe for both client and server (no-op on server).
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = "text/csv",
): void {
  if (typeof window === "undefined") return;

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate a timestamped filename.
 */
function timestampedFilename(prefix: string, ext: string): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "-");
  // Sanitize the prefix to prevent path traversal in download filenames
  const safePrefix = sanitizePathSegment(prefix, 80);
  return `${safePrefix}-${date}_${time}.${ext}`;
}

// ─── Product Downloads ────────────────────────────────────────────────────

/**
 * Download products as CSV.
 */
export function downloadProductsCSV(products: Product[], shopName?: string): void {
  const content = exportProductsToCSV(products);
  const name = shopName
    ? sanitizePathSegment(shopName.toLowerCase(), 60)
    : "products";
  downloadFile(
    content,
    timestampedFilename(`${name}-inventory`, "csv"),
  );
}

/**
 * Download products as JSON.
 */
export function downloadProductsJSON(products: Product[], shopName?: string): void {
  const content = exportInventoryAsJSON(products);
  const name = shopName
    ? sanitizePathSegment(shopName.toLowerCase(), 60)
    : "products";
  downloadFile(
    content,
    timestampedFilename(`${name}-inventory`, "json"),
    "application/json",
  );
}

// ─── Order Downloads ──────────────────────────────────────────────────────

/**
 * Download orders as CSV.
 */
export function downloadOrdersCSV(orders: Order[], shopName?: string): void {
  const content = exportOrdersToCSV(orders);
  const name = shopName
    ? sanitizePathSegment(shopName.toLowerCase(), 60)
    : "orders";
  downloadFile(
    content,
    timestampedFilename(`${name}-orders`, "csv"),
  );
}

/**
 * Download sales summary report as CSV.
 */
export function downloadSalesSummaryCSV(orders: Order[], shopName?: string): void {
  const content = exportSalesSummaryToCSV(orders, shopName);
  const name = shopName
    ? sanitizePathSegment(shopName.toLowerCase(), 60)
    : "sales";
  downloadFile(
    content,
    timestampedFilename(`${name}-sales-summary`, "csv"),
  );
}

/**
 * Download orders as JSON.
 */
export function downloadOrdersJSON(orders: Order[], shopName?: string): void {
  const content = exportSalesAsJSON(orders);
  const name = shopName
    ? sanitizePathSegment(shopName.toLowerCase(), 60)
    : "orders";
  downloadFile(
    content,
    timestampedFilename(`${name}-orders`, "json"),
    "application/json",
  );
}

// ─── Inventory Downloads ──────────────────────────────────────────────────

/**
 * Download detailed inventory CSV (per-variant breakdown).
 */
export function downloadInventoryCSV(products: Product[], shopName?: string): void {
  const content = exportInventoryToCSV(products);
  const name = shopName
    ? sanitizePathSegment(shopName.toLowerCase(), 60)
    : "inventory";
  downloadFile(
    content,
    timestampedFilename(`${name}-inventory-detail`, "csv"),
  );
}

/**
 * Download text inventory report.
 */
export function downloadInventoryReport(
  products: Product[],
  shopName?: string,
): void {
  const content = generateInventoryReport(products);
  const name = shopName
    ? sanitizePathSegment(shopName.toLowerCase(), 60)
    : "inventory";
  downloadFile(
    content,
    timestampedFilename(`${name}-report`, "txt"),
    "text/plain",
  );
}

/* -------------------------------------------------------------------------- */
/*  Batch Export: All data at once                                             */
/* -------------------------------------------------------------------------- */

/**
 * Export all merchant data (products + orders) as a ZIP-like bundle.
 * Since we can't create actual ZIPs client-side without a library,
 * we provide individual CSV downloads in rapid succession.
 */
export async function downloadAllMerchantData(
  products: Product[],
  orders: Order[],
  shopName?: string,
): Promise<void> {
  // Sanitize shop name for filenames
  const safeName = shopName ? sanitizePathSegment(shopName.toLowerCase(), 60) : "trendsmart";

  // Small delay between downloads to prevent browser blocking
  downloadProductsCSV(products, safeName);
  await new Promise((r) => setTimeout(r, 300));
  downloadInventoryCSV(products, safeName);
  await new Promise((r) => setTimeout(r, 300));
  downloadOrdersCSV(orders, safeName);
  await new Promise((r) => setTimeout(r, 300));
  downloadSalesSummaryCSV(orders, safeName);
}

/* -------------------------------------------------------------------------- */
/*  Convenience: export URLs for sharing                                       */
/* -------------------------------------------------------------------------- */

/**
 * Convert CSV content to a data URL that can be shared or embedded.
 * Useful for generating preview links or sharing reports via messaging.
 */
export function csvToDataURL(csvContent: string): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
}

/**
 * Generate a downloadable link for use in anchor elements.
 */
export function csvToBlobURL(csvContent: string): string {
  if (typeof window === "undefined") return "";
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  return URL.createObjectURL(blob);
}