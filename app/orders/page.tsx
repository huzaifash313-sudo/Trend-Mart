"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Order, OrderItem } from "@/types";
import { fetchOrdersByPhone } from "@/services/orderService";
import { fetchShops } from "@/services/shopService";
import { getOrderHistory } from "@/services/orderHistoryService";
import type { Shop } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function SearchIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 9.4L7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.29 7 12 12 20.71 7" /><line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Status Badge                                                               */
/* -------------------------------------------------------------------------- */

function getStatusConfig(status: string) {
  switch (status) {
    case "Pending":
      return { label: "Pending", bg: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", dot: "bg-amber-500" };
    case "Processing":
      return { label: "Processing", bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", dot: "bg-blue-500" };
    case "Dispatched":
      return { label: "Dispatched", bg: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", dot: "bg-purple-500" };
    case "Delivered":
    case "Completed": // legacy status value from pre-tracking-module orders
      return { label: status === "Completed" ? "Completed" : "Delivered", bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", dot: "bg-emerald-500" };
    case "Cancelled":
      return { label: "Cancelled", bg: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", dot: "bg-red-500" };
    default:
      return { label: status, bg: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300", dot: "bg-zinc-400" };
  }
}

function StatusBadge({ status }: { status: string }) {
  const cfg = getStatusConfig(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  OrderCard                                                                  */
/* -------------------------------------------------------------------------- */

function OrderCard({ order, shopMap }: { order: Order; shopMap: Map<string, Shop> }) {
  const shop = shopMap.get(order.shop_id);
  const items: OrderItem[] = order.items_json ?? [];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
          <ClockIcon />
          {new Date(order.created_at).toLocaleString("en-PK", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>

      {/* Items */}
      <div className="px-4 py-3 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Items ({items.length})
        </h4>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No items listed</p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.name}</p>
                  {item.variant && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.variant}</p>
                  )}
                </div>
                <span className="ml-3 shrink-0 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  Rs. {item.price.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
        <div>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Total: Rs. {order.total_amount.toLocaleString()}
          </p>
        </div>
        {shop && (
          <Link
            href={`/shop/${shop.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            View Shop ↗
          </Link>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Local Storage History Orders                                               */
/* -------------------------------------------------------------------------- */

interface LocalOrder {
  id: string;
  shopId: string;
  shopName: string;
  items: OrderItem[];
  totalAmount: number;
  status: string;
  createdAt: string;
}

function getLocalOrders(): LocalOrder[] {
  if (typeof window === "undefined") return [];
  // Read from the unified local history service (same key the checkout writes).
  return getOrderHistory().map((o) => ({
    id: o.id,
    shopId: o.shopId,
    shopName: o.shopName,
    items:
      Array.isArray(o.items) && o.items.length > 0
        ? o.items
        : [
            {
              product_id: "",
              name: o.productName || "Order",
              price: o.quantity > 0 ? o.totalAmount / o.quantity : o.totalAmount,
              quantity: o.quantity,
            },
          ],
    totalAmount: o.totalAmount,
    status: o.status || "Pending",
    createdAt: o.timestamp,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Main Page Component                                                        */
/* -------------------------------------------------------------------------- */

function OrdersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPhone = searchParams.get("phone") ?? "";
  const [phone, setPhone] = useState(initialPhone);
  const [searching, setSearching] = useState(!!initialPhone);
  const [dbOrders, setDbOrders] = useState<Order[]>([]);
  const [shops, setShops] = useState<Map<string, Shop>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Load shops for shop name display
  useEffect(() => {
    fetchShops().then((r) => {
      if (r.success) {
        const map = new Map<string, Shop>();
        r.data.forEach((s) => map.set(s.id, s));
        setShops(map);
      }
    });
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Please enter a phone number to track your orders.");
      return;
    }
    setSearching(true);
    setError(null);

    const result = await fetchOrdersByPhone(trimmed);
    if (result.success) {
      setDbOrders(result.data);
    } else {
      setError(result.error);
    }
    setSearching(false);
  }, []);

  // Auto-search on mount if phone param is present in URL
  const didAutoSearch = useRef(false);
  useEffect(() => {
    if (didAutoSearch.current || !initialPhone) return;
    didAutoSearch.current = true;
    fetchOrdersByPhone(initialPhone).then((result) => {
      if (result.success) setDbOrders(result.data);
      else setError(result.error);
      setSearching(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const localOrders = getLocalOrders();
  const hasResults = dbOrders.length > 0 || localOrders.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Go back"
          >
            <ChevronLeftIcon />
          </button>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">My Orders</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-5">
        {/* Search Form */}
        <section>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Track Your Orders
            </h2>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              Enter the phone number you used when placing orders to view their current status.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                  <PhoneIcon />
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="0300-1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSearch(phone); }}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  aria-label="Phone number"
                />
              </div>
              <button
                type="button"
                onClick={() => handleSearch(phone)}
                disabled={searching || !phone.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900"
              >
                <SearchIcon />
                {searching ? "Searching..." : "Search"}
              </button>
            </div>
          </div>
        </section>

        {/* Results */}
        <section>
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-900/20">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {searching && (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-3 h-6 w-1/4 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="mb-2 h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              ))}
            </div>
          )}

          {!searching && !hasResults && !error && phone.trim() && (
            <div className="py-12 text-center">
              <div className="mb-3 flex justify-center text-zinc-300 dark:text-zinc-600">
                <PackageIcon />
              </div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No orders found</p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                Try a different phone number or place an order first.
              </p>
            </div>
          )}

          {!searching && !hasResults && !error && !phone.trim() && (
            <div className="py-12 text-center">
              <div className="mb-3 flex justify-center text-zinc-300 dark:text-zinc-600">
                <PackageIcon />
              </div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Enter your phone number to track orders
              </p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                We will show all your orders and their current status.
              </p>
            </div>
          )}

          {/* Database Orders */}
          {!searching && dbOrders.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Orders ({dbOrders.length})
              </h3>
              {dbOrders.map((order) => (
                <OrderCard key={order.id} order={order} shopMap={shops} />
              ))}
            </div>
          )}

          {/* Local Storage Orders (fallback) */}
          {!searching && localOrders.length > 0 && dbOrders.length === 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Recent Orders
              </h3>
              {localOrders.map((localOrder) => (
                <div key={localOrder.id} className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                    <StatusBadge status={localOrder.status} />
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {new Date(localOrder.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {localOrder.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-1">
                        <span className="text-sm text-zinc-900 dark:text-zinc-100">{item.name}</span>
                        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          Rs. {item.price.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Total: Rs. {localOrder.totalAmount.toLocaleString()}
                    </p>
                    <Link
                      href={`/shop/${localOrder.shopId}`}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                    >
                      View Shop ↗
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <OrdersInner />
    </Suspense>
  );
}