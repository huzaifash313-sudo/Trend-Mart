"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — QR Table Manager (/dashboard/tables)                           */
/*                                                                             */
/*  Merchant side of dine-in ordering: create tables, each with its own QR     */
/*  code, download a print-ready PDF per table, pause/delete tables.           */
/* -------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { createClient } from "@/lib/supabase/client";
import { fetchMyShop } from "@/services/shopService";
import {
  createTables,
  deleteTable,
  fetchTablesByShopId,
  setTableActive,
} from "@/services/dineInService";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmProvider";
import { isDineInCategory } from "@/types";
import type { DineInTable, Shop } from "@/types";

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

export default function MerchantTablesPage() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [tables, setTables] = useState<DineInTable[]>([]);
  const [name, setName] = useState("");
  const [bulkCount, setBulkCount] = useState(5);
  const [adding, setAdding] = useState(false);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState<string | null>(null);

  const origin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }, []);

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
        const shopResult = await fetchMyShop();
        if (!shopResult.success || !shopResult.data) {
          if (!cancelled) {
            addToast("Register a store first to manage tables.", "info");
            window.location.replace("/account/become-merchant");
          }
          return;
        }
        if (cancelled) return;
        setShop(shopResult.data);
        const tablesResult = await fetchTablesByShopId(shopResult.data.id);
        if (!cancelled && tablesResult.success) setTables(tablesResult.data);
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
    const count = Math.min(50, Math.max(1, Math.round(bulkCount) || 1));
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
    if (!origin) return;
    setDownloading(table.id);
    try {
      const url = `${origin}/t/${table.qr_token}`;
      const qr = await QRCode.toDataURL(url, { width: 512, margin: 2 });
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a6" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      // Shop + table header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(shop?.name ?? "TrendMart", pageW / 2, 18, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.text(table.name, pageW / 2, 26, { align: "center" });

      // QR centered
      const qrSize = Math.min(pageW - 24, pageH - 62);
      const qrX = (pageW - qrSize) / 2;
      doc.addImage(qr, "PNG", qrX, 32, qrSize, qrSize);

      // Instruction
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(90);
      doc.text("Scan to view the menu & order from your table", pageW / 2, pageH - 12, { align: "center" });
      doc.setTextColor(0);

      doc.save(`${table.name.toLowerCase().replace(/\s+/g, "-")}-qr.pdf`);
    } catch {
      addToast("Could not generate the QR PDF.", "error");
    } finally {
      setDownloading(null);
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
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              QR Table Ordering
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              Print each table&apos;s QR and stick it on the table. Customers scan, order and pay at the table.
            </p>
          </div>
          <Link
            href="/dashboard/kitchen"
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Kitchen board
          </Link>
        </div>

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
              type="number"
              min={1}
              max={50}
              value={bulkCount}
              onChange={(e) => setBulkCount(Number(e.target.value))}
              className="w-16 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-center text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tables.map((table) => (
              <div
                key={table.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]"
              >
                <div className="relative flex flex-col items-center justify-center bg-zinc-50 py-4 dark:bg-zinc-900">
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
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{table.name}</p>
                    <label className="flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={table.is_active}
                        onChange={() => void handleToggle(table)}
                        className="h-4 w-4 accent-emerald-600"
                        title="Pause/resume ordering from this table"
                      />
                    </label>
                  </div>
                  <div className="flex gap-1.5">
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
        )}
      </div>
    </div>
  );
}
