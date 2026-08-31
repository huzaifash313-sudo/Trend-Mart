"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — QR Table Manager (/dashboard/tables)                           */
/*                                                                             */
/*  Merchant side of dine-in ordering: create tables, each with its own QR     */
/*  code, download a print-ready PDF per table, pause/delete tables.           */
/* -------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { createClient } from "@/lib/supabase/client";
import { getPublicAppUrl } from "@/lib/appUrl";
import {
  createTables,
  deleteTable,
  fetchMyDineInShop,
  fetchTablesByShopId,
  fetchTodayDineStats,
  fetchKitchenOrders,
  setTableActive,
} from "@/services/dineInService";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmProvider";
import OrderBillModal from "@/components/OrderBillModal";
import { isDineInCategory } from "@/types";
import type { DineInTable, Order, Shop } from "@/types";

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

async function renderTableQrPage(
  doc: jsPDF,
  table: DineInTable,
  shop: Shop,
  origin: string,
  isFirstPage: boolean,
) {
  if (!isFirstPage) doc.addPage();
  const url = `${origin}/t/${table.qr_token}`;
  const qr = await QRCode.toDataURL(url, { width: 512, margin: 2 });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const shopName = (shop.name ?? "TrendsMart").slice(0, 28);
  const shopLocation = (shop.location ?? "").slice(0, 34);
  const shopPhone = shop.whatsapp_number ?? "";

  doc.setFillColor(6, 95, 70);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(shopName, pageW / 2, 13, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let hdrY = 20;
  if (shopLocation) {
    doc.text(shopLocation, pageW / 2, hdrY, { align: "center" });
    hdrY += 4.5;
  }
  if (shopPhone) {
    doc.text(shopPhone, pageW / 2, hdrY, { align: "center" });
  }
  doc.setTextColor(0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(table.name, pageW / 2, 42, { align: "center" });

  const qrSize = Math.min(pageW - 26, pageH - 42 - 24 - 16);
  const qrX = (pageW - qrSize) / 2;
  doc.addImage(qr, "PNG", qrX, 48, qrSize, qrSize);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  doc.text("Scan to view the menu & order from your table", pageW / 2, pageH - 12, { align: "center" });
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text("Powered by TrendsMart", pageW / 2, pageH - 7, { align: "center" });
  doc.setTextColor(0);
}

async function buildTablesPdf(
  targetTables: DineInTable[],
  shop: Shop,
  origin: string,
): Promise<jsPDF | null> {
  if (targetTables.length === 0) return null;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a6" });
  for (let i = 0; i < targetTables.length; i++) {
    await renderTableQrPage(doc, targetTables[i], shop, origin, i === 0);
  }
  return doc;
}

export default function MerchantTablesPage() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [tables, setTables] = useState<DineInTable[]>([]);
  const [name, setName] = useState("");
  const [bulkCountInput, setBulkCountInput] = useState("5");
  const [adding, setAdding] = useState(false);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState<string | "bulk" | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [todayStats, setTodayStats] = useState<{ orders: number; revenue: number } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [billOrder, setBillOrder] = useState<Order | null>(null);

  const origin = useMemo(() => getPublicAppUrl(), []);

  /** Latest active (non-cancelled) dine-in order for a table. */
  const latestOrderFor = useCallback(
    (table: DineInTable): Order | undefined =>
      orders.find(
        (o) =>
          o.dine_status !== "Cancelled" &&
          (o.table_id === table.id ||
            (o.table_code != null &&
              o.table_code.trim().toLowerCase() === table.name.trim().toLowerCase())),
      ),
    [orders],
  );

  /** Recent non-cancelled dine-in orders, newest first, for the bills list. */
  const recentBills = useMemo(
    () =>
      orders
        .filter((o) => o.dine_status !== "Cancelled")
        .sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        )
        .slice(0, 20),
    [orders],
  );

  const selectedTables = useMemo(
    () => tables.filter((t) => selectedIds.has(t.id)),
    [tables, selectedIds],
  );

  const allSelected = tables.length > 0 && selectedIds.size === tables.length;

  function toggleSelect(tableId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(tables.map((t) => t.id)));
  }

  function parseBulkCount(): number {
    const parsed = Number.parseInt(bulkCountInput.trim(), 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(50, Math.max(1, parsed));
  }

  const load = useCallback(async () => {
    const result = await fetchTablesByShopId(shop?.id ?? "");
    if (result.success) setTables(result.data);
  }, [shop?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.replace("/login?redirect=/dashboard/tables");
          return;
        }
        const shopResult = await fetchMyDineInShop();
        if (!shopResult.success || !shopResult.data) {
          if (!cancelled) {
            addToast("Register a restaurant store first to manage tables.", "info");
            window.location.replace("/account/become-merchant");
          }
          return;
        }
        if (cancelled) return;
        setShop(shopResult.data);
        const tablesResult = await fetchTablesByShopId(shopResult.data.id);
        if (!cancelled && tablesResult.success) setTables(tablesResult.data);
        fetchTodayDineStats(shopResult.data.id).then((r) => {
          if (!cancelled && r.success) setTodayStats(r.data);
        });
        const ordersResult = await fetchKitchenOrders(shopResult.data.id);
        if (!cancelled && ordersResult.success) setOrders(ordersResult.data);
      } catch {
        /* handled by empty state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addToast]);

  // Lazy-generate QR previews for visible tables.
  useEffect(() => {
    if (!origin || !shop) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        tables.map(async (t) => {
          const url = `${origin}/t/${t.qr_token}`;
          const dataUrl = await QRCode.toDataURL(url, {
            width: 256,
            margin: 1,
            color: { dark: "#065f46", light: "#ffffff" },
          }).catch(() => "");
          return [t.id, dataUrl] as const;
        }),
      );
      if (cancelled) return;
      setQrDataUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [tables, origin, shop]);

  async function handleAdd() {
    if (!shop) return;
    const trimmed = name.trim();
    if (!trimmed) {
      addToast("Enter a table name first.", "info");
      return;
    }
    setAdding(true);
    const res = await createTables(shop.id, [trimmed]);
    setAdding(false);
    if (res.success) {
      addToast("Table added — QR ready to print.", "success");
      setName("");
      await load();
    } else {
      addToast(res.error, "error");
    }
  }

  async function handleBulkAdd() {
    if (!shop) return;
    const count = parseBulkCount();
    const existingNames = new Set(tables.map((t) => t.name));
    const names: string[] = [];
    let i = 1;
    while (names.length < count) {
      const candidate = `Table ${i}`;
      if (!existingNames.has(candidate)) names.push(candidate);
      i++;
    }
    setAdding(true);
    const res = await createTables(shop.id, names);
    setAdding(false);
    if (res.success) {
      addToast(`${res.data.length} tables added with QR codes.`, "success");
      await load();
    } else {
      addToast(res.error, "error");
    }
  }

  async function handleToggle(table: DineInTable) {
    const res = await setTableActive(table.id, !table.is_active);
    if (res.success) {
      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, is_active: !table.is_active } : t)),
      );
    } else {
      addToast(res.error, "error");
    }
  }

  async function handleDelete(table: DineInTable) {
    const ok = await confirm({
      title: "Delete table?",
      message: `Delete "${table.name}"? Its QR code will stop working.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const res = await deleteTable(table.id);
    if (res.success) {
      setTables((prev) => prev.filter((t) => t.id !== table.id));
      addToast("Table deleted.", "success");
    } else {
      addToast(res.error, "error");
    }
  }

  async function handleDownload(table: DineInTable) {
    if (!origin || !shop) return;
    setDownloading(table.id);
    try {
      const doc = await buildTablesPdf([table], shop, origin);
      if (!doc) return;
      doc.save(`${table.name.toLowerCase().replace(/\s+/g, "-")}-qr.pdf`);
    } catch {
      addToast("Could not generate the QR PDF.", "error");
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadMany(targetTables: DineInTable[], filename: string) {
    if (!origin || !shop || targetTables.length === 0) return;
    setDownloading("bulk");
    try {
      const doc = await buildTablesPdf(targetTables, shop, origin);
      if (!doc) return;
      doc.save(filename);
      addToast(`${targetTables.length} table QR PDF${targetTables.length === 1 ? "" : "s"} downloaded.`, "success");
    } catch {
      addToast("Could not generate QR PDFs.", "error");
    } finally {
      setDownloading(null);
    }
  }

  async function handlePrintMany(targetTables: DineInTable[]) {
    if (!origin || !shop || targetTables.length === 0) return;
    setDownloading("bulk");
    try {
      const doc = await buildTablesPdf(targetTables, shop, origin);
      if (!doc) return;
      doc.autoPrint();
      const blobUrl = doc.output("bloburl");
      window.open(blobUrl, "_blank");
      addToast(`Print dialog opened for ${targetTables.length} table${targetTables.length === 1 ? "" : "s"}.`, "success");
    } catch {
      addToast("Could not open print dialog.", "error");
    } finally {
      setDownloading(null);
    }
  }

  async function handleDeleteMany(targetTables: DineInTable[]) {
    if (targetTables.length === 0) return;
    const ok = await confirm({
      title: targetTables.length === 1 ? "Delete table?" : `Delete ${targetTables.length} tables?`,
      message:
        targetTables.length === 1
          ? `Delete "${targetTables[0].name}"? Its QR code will stop working.`
          : `Delete ${targetTables.length} tables? Their QR codes will stop working.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    const ids = new Set(targetTables.map((t) => t.id));
    const failures: string[] = [];
    for (const table of targetTables) {
      const res = await deleteTable(table.id);
      if (!res.success) failures.push(table.name);
    }

    setTables((prev) => prev.filter((t) => !ids.has(t.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });

    if (failures.length === 0) {
      addToast(`${targetTables.length} table${targetTables.length === 1 ? "" : "s"} deleted.`, "success");
    } else {
      addToast(`Some tables could not be deleted: ${failures.join(", ")}`, "error");
    }
  }

  async function handleCopyLink(table: DineInTable) {
    if (!origin) return;
    try {
      await navigator.clipboard.writeText(`${origin}/t/${table.qr_token}`);
      addToast("Link copied.", "success");
    } catch {
      addToast("Could not copy link.", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <p className="text-sm text-zinc-500">No store found.</p>
      </div>
    );
  }

  if (!isDineInCategory(shop.category)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-[color:var(--tm-surface)]">
        <div className="max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            QR Table Ordering is for restaurants & cafes
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            This feature is available for{" "}
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Fast Food & Restaurants</span> and{" "}
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Bakery & Sweets</span>{" "}
            shops. Your store category is &ldquo;{shop.category}&rdquo;.
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-4 inline-block text-xs font-semibold text-emerald-600 underline"
          >
            Open store settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tm-dashboard-page min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <div className="mx-auto max-w-3xl px-4 py-6 pb-safe-nav">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="tm-font-display text-xl font-extrabold text-zinc-900 dark:text-zinc-50">
              QR Table Ordering
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              Print each table&apos;s QR and stick it on the table. Customers scan, order and pay at the table.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Link
              href="/dashboard"
              className="min-h-11 flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-center text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:flex-none"
            >
              ← Dashboard
            </Link>
            <Link
              href="/dashboard/kitchen"
              className="min-h-11 flex-1 rounded-xl bg-zinc-900 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white sm:flex-none"
            >
              Kitchen board
            </Link>
          </div>
        </div>

        {/* Today's stats strip */}
        {todayStats && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-900/10">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Today
            </span>
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {todayStats.orders} dine-in orders
            </span>
            <span className="ml-auto text-sm font-bold text-emerald-700 dark:text-emerald-400">
              Rs. {Math.round(todayStats.revenue).toLocaleString()}
            </span>
          </div>
        )}

        {/* Add table */}
        <div className="mb-6 rounded-2xl border border-zinc-100 bg-white p-4 dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1">
              <label className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Table name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                }}
                placeholder="e.g. Table 1 or Balcony 2"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <button
              type="button"
              disabled={adding}
              onClick={() => void handleAdd()}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <PlusIcon /> Add table
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Quick setup:</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={bulkCountInput}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, "");
                setBulkCountInput(next);
              }}
              onBlur={() => {
                if (!bulkCountInput.trim()) setBulkCountInput("1");
              }}
              className="w-16 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-center text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              aria-label="Number of tables to add"
            />
            <button
              type="button"
              disabled={adding}
              onClick={() => void handleBulkAdd()}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Add tables (Table 1…N)
            </button>
          </div>
        </div>

        {/* Table list */}
        {tables.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 py-16 text-center dark:border-zinc-700">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No tables yet</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-500 dark:text-zinc-400">
              Add your first table above. Each table gets its own QR code that
              takes customers straight to your menu.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-3 dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]">
              <label className="mr-1 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 accent-emerald-600"
                />
                Select all ({selectedIds.size}/{tables.length})
              </label>
              <button
                type="button"
                disabled={downloading === "bulk"}
                onClick={() => void handleDownloadMany(tables, "all-tables-qr.pdf")}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                Download all PDFs
              </button>
              <button
                type="button"
                disabled={downloading === "bulk"}
                onClick={() => void handlePrintMany(tables)}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              >
                Print all
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0 || downloading === "bulk"}
                onClick={() => void handleDownloadMany(selectedTables, "selected-tables-qr.pdf")}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                PDF selected
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0 || downloading === "bulk"}
                onClick={() => void handlePrintMany(selectedTables)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Print selected
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => void handleDeleteMany(selectedTables)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
              >
                Delete selected
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteMany(tables)}
                className="ml-auto rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
              >
                Delete all
              </button>
            </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tables.map((table) => (
              <div
                key={table.id}
                className={`flex flex-col overflow-hidden rounded-2xl border bg-white dark:bg-[color:var(--tm-surface)] ${
                  selectedIds.has(table.id)
                    ? "border-emerald-400 ring-1 ring-emerald-400/60 dark:border-emerald-600"
                    : "border-zinc-100 dark:border-zinc-800"
                }`}
              >
                <div className="relative flex flex-col items-center justify-center bg-zinc-50 py-4 dark:bg-zinc-900">
                  <label className="absolute left-2 top-2 flex cursor-pointer items-center rounded-md bg-white/90 p-0.5 shadow-sm dark:bg-zinc-900/90">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(table.id)}
                      onChange={() => toggleSelect(table.id)}
                      className="h-4 w-4 accent-emerald-600"
                      aria-label={`Select ${table.name}`}
                    />
                  </label>
                  {qrDataUrls[table.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrDataUrls[table.id]}
                      alt={`QR for ${table.name}`}
                      className="h-24 w-24"
                    />
                  ) : (
                    <div className="h-24 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                  )}
                  <p className="mt-1.5 max-w-[10rem] truncate px-2 text-[9px] text-zinc-400 dark:text-zinc-500" title={`${origin}/t/${table.qr_token}`}>
                    /t/{table.qr_token.slice(0, 10)}…
                  </p>
                  {!table.is_active && (
                    <span className="absolute left-2 top-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                      Paused
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{table.name}</p>
                    <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                      <span>Active</span>
                      <input
                        type="checkbox"
                        checked={table.is_active}
                        onChange={() => void handleToggle(table)}
                        className="h-3.5 w-3.5 accent-emerald-600"
                        title="Pause/resume ordering from this table"
                      />
                    </label>
                  </div>
                  <div className="flex gap-1.5">
                    {latestOrderFor(table) && (
                      <button
                        type="button"
                        onClick={() => setBillOrder(latestOrderFor(table)!)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                      >
                        🧾 Bill
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={downloading === table.id}
                      onClick={() => void handleDownload(table)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <DownloadIcon /> PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyLink(table)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <LinkIcon /> Link
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(table)}
                      className="flex items-center justify-center rounded-lg border border-zinc-200 px-2 py-1.5 text-zinc-500 transition hover:border-red-300 hover:text-red-500 dark:border-zinc-700 dark:hover:border-red-800"
                      aria-label={`Delete ${table.name}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}

        {/* Recent dine-in orders — print bills from here */}
        {recentBills.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Recent orders — print bills
            </h2>
            <div className="space-y-2">
              {recentBills.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      {order.table_code ?? "Table"} · {order.customer_name || "Guest"}
                      {order.customer_phone ? ` · ${order.customer_phone}` : ""}
                    </p>
                    <p className="mt-0.5 text-[0.65rem] text-zinc-400">
                      {new Date(order.created_at).toLocaleString()} · #{order.id.slice(0, 8)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      Rs. {Math.round(order.total_amount ?? 0).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBillOrder(order)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      🧾 Bill
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {billOrder && shop && (
        <OrderBillModal order={billOrder} shop={shop} onClose={() => setBillOrder(null)} />
      )}
    </div>
  );
}
