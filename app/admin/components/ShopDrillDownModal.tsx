"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import ShopQrCode from "@/components/ShopQrCode";
import {
  fetchShopProductsForAdmin,
  fetchShopOrdersForAdmin,
} from "@/services/adminService";
import type { AdminMerchantRecord, Product, Order } from "@/types";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Per-Shop Drill-Down Modal (Super-Admin)                        */
/*  Opens from the Merchants table: QR code, product list, recent orders,      */
/*  and a quick storefront link for any merchant on the platform.              */
/* -------------------------------------------------------------------------- */

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-PK")}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Processing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Dispatched: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${STATUS_COLORS[status] ?? STATUS_COLORS.Pending}`}>
      {status}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="border-b border-zinc-100 px-4 py-3 text-sm font-bold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
        {title}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function ShopDrillDownModal({
  merchant,
  onClose,
}: {
  merchant: AdminMerchantRecord;
  onClose: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const [pRes, oRes] = await Promise.all([
        fetchShopProductsForAdmin(merchant.shop_id),
        fetchShopOrdersForAdmin(merchant.shop_id),
      ]);
      if (cancelled) return;
      if (pRes.success) setProducts(pRes.data);
      if (oRes.success) setOrders(oRes.data);
      if (!pRes.success && !oRes.success) {
        setError(pRes.error || oRes.error || "Couldn't load shop details.");
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [merchant.shop_id]);

  const inStockCount = products.filter((p) => p.is_available !== false).length;
  const liveOrderCount = orders.filter((o) => o.status !== "Cancelled" && o.status !== "Delivered").length;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Manage ${merchant.shop_name}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-zinc-50 shadow-2xl sm:rounded-2xl dark:bg-[color:var(--tm-surface)]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">
              Merchant drill-down
            </p>
            <h2 className="truncate text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {merchant.shop_name}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {merchant.category} · {merchant.location || "No location set"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/shop/${merchant.shop_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              View storefront ↗
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              ✕ Close
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {/* Summary chips */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{merchant.product_count}</p>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">Products</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{inStockCount}</p>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">In stock</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{orders.length}</p>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">Orders</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{liveOrderCount}</p>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">Open</p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* QR */}
          <ShopQrCode shopId={merchant.shop_id} shopName={merchant.shop_name} />

          {/* Products */}
          <SectionCard title={`Products (${products.length})`}>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">No products listed yet.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
                {products.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="h-10 w-10 shrink-0 rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                        📦
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{p.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatCurrency(p.price)}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${
                        p.is_available === false
                          ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      }`}
                    >
                      {p.is_available === false ? "Out of stock" : "In stock"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Recent orders */}
          <SectionCard title={`Recent Orders (${orders.length})`}>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">No orders yet.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
                {orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="font-mono text-xs text-zinc-400">#{o.id.slice(0, 8)}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">
                      {o.customer_name || "Guest"} · {o.customer_phone || "—"}
                    </span>
                    <StatusPill status={o.status} />
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(o.total_amount)}
                    </span>
                    <span className="shrink-0 text-right text-xs text-zinc-400">{timeAgo(o.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
