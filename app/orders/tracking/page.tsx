"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Real-Time Customer Order Status Tracking Portal                */
/*                                                                             */
/*  Features:                                                                  */
/*   - Phone number or order reference ID lookup                              */
/*   - Color-coded status timeline: Pending → Processing → Dispatched        */
/*     → Delivered or Cancelled                                              */
/*   - Itemized receipt with pricing breakdown                              */
/*   - Direct WhatsApp contact link for each order's merchant               */
/*   - Auto-save recent searches to local storage for quick lookup          */
/* -------------------------------------------------------------------------- */

import { useState, useCallback, useEffect, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  trackOrdersByPhone,
  trackOrderById,
  trackOrdersByPhoneAndId,
  buildStatusTimeline,
  type TrackedOrder,
  type StatusTimelineEntry,
} from "@/services/orderTrackingService";
import { subscribeToOrderUpdates } from "@/services/notificationService";
import { formatRupees } from "@/lib/formatters";
import { formatDate, formatRelativeTime } from "@/lib/formatters";

// ─── Icons ──────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function SearchIcon() {
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
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
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

function PackageIcon() {
  return (
    <svg
      className="h-12 w-12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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

function ClockIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ReceiptIcon() {
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
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function TruckIcon() {
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
      <path d="M1 3h15v13H1z" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function EmptyBoxIcon() {
  return (
    <svg
      className="h-16 w-16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <line x1="3.5" y1="5.5" x2="20.5" y2="5.5" />
      <line x1="12" y1="12" x2="12" y2="20" />
      <line x1="3.5" y1="5.5" x2="12" y2="12" />
      <line x1="20.5" y1="5.5" x2="12" y2="12" />
    </svg>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

type SearchMode = "phone" | "orderId";

interface RecentSearch {
  query: string;
  mode: SearchMode;
  timestamp: number;
  label: string;
}

const RECENT_SEARCHES_KEY = "trendmart_recent_tracking_searches";
const MAX_RECENT = 5;

// ─── Recent Searches Helpers ────────────────────────────────────────────────

function getRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as RecentSearch[]) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string, mode: SearchMode): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getRecentSearches();
    const label = mode === "phone" ? `📱 ${query}` : `🆔 ${query.slice(0, 8)}…`;
    const updated = [
      { query, mode, timestamp: Date.now(), label },
      ...existing.filter((s) => s.query !== query),
    ].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // Storage full — ignore
  }
}

// ─── Status Timeline Component ──────────────────────────────────────────────

function StatusTimeline({ timeline }: { timeline: StatusTimelineEntry[] }) {
  return (
    <div className="relative">
      {timeline.map((entry, idx) => (
        <div key={entry.status} className="flex gap-3 pb-4 last:pb-0">
          {/* Left column: dot + connector line */}
          <div className="flex flex-col items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all ${
                entry.completed || entry.active
                  ? "shadow-sm"
                  : "bg-zinc-100 text-zinc-300 dark:bg-zinc-800 dark:text-zinc-600"
              }`}
              style={
                entry.completed || entry.active
                  ? {
                      backgroundColor: entry.completed
                        ? entry.color + "20"
                        : entry.color + "20",
                      border: `2px solid ${entry.color}`,
                      color: entry.color,
                    }
                  : undefined
              }
            >
              {entry.icon}
            </div>
            {idx < timeline.length - 1 && (
              <div
                className={`mt-1.5 h-5 w-0.5 rounded-full ${
                  entry.completed
                    ? "bg-emerald-400"
                    : "bg-zinc-200 dark:bg-zinc-700"
                }`}
              />
            )}
          </div>

          {/* Right column: label + time */}
          <div className="flex-1 pt-1.5">
            <p
              className={`text-sm font-semibold ${
                entry.active
                  ? "text-zinc-900 dark:text-zinc-100"
                  : entry.completed
                    ? "text-zinc-600 dark:text-zinc-400"
                    : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {entry.label}
              {entry.active && entry.status === "Cancelled" && (
                <span className="ml-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  Cancelled
                </span>
              )}
            </p>
            {entry.timestamp && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                <ClockIcon />
                {formatDate(entry.timestamp, "full")} at{" "}
                {new Date(entry.timestamp).toLocaleTimeString("en-PK", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Order Card Component ───────────────────────────────────────────────────

function OrderCard({
  order,
  highlighted,
  justUpdated,
}: {
  order: TrackedOrder;
  highlighted?: boolean;
  justUpdated?: boolean;
}) {
  const whatsappNumber = ""; // Will be composed from shop data if available
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Hi! I'm inquiring about my order:\n\n🆔 Order ID: ${order.id}\n📦 Status: ${order.status}\n💰 Total: Rs. ${order.totalAmount.toLocaleString()}\n\nPlease provide an update. Thanks!`,
  )}`;

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all dark:bg-zinc-900 ${
        justUpdated
          ? "border-blue-400 ring-2 ring-blue-500/30 dark:border-blue-500"
          : highlighted
            ? "border-emerald-400 ring-2 ring-emerald-500/20 dark:border-emerald-600"
            : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {order.shopName}
            </h3>
            {justUpdated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[0.625rem] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                Just Updated
              </span>
            )}
            {highlighted && !justUpdated && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.625rem] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                Just Searched
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {formatDate(order.createdAt)} · {formatRelativeTime(order.createdAt)}
          </p>
        </div>

        {/* Status Badge */}
        <span
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white"
          style={{
            backgroundColor:
              order.status === "Delivered"
                ? "#10b981"
                : order.status === "Cancelled"
                  ? "#ef4444"
                  : order.status === "Dispatched"
                    ? "#8b5cf6"
                    : order.status === "Processing"
                      ? "#3b82f6"
                      : "#f59e0b",
          }}
        >
          {order.status === "Delivered"
            ? "✅"
            : order.status === "Cancelled"
              ? "❌"
              : order.status === "Dispatched"
                ? "🚚"
                : order.status === "Processing"
                  ? "⚙️"
                  : "📋"}{" "}
          {order.status}
        </span>
      </div>

      {/* Status Timeline */}
      <div className="px-5 py-4">
        <StatusTimeline timeline={order.statusHistory} />
      </div>

      {/* Itemized Receipt */}
      <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-800/50">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          <ReceiptIcon />
          Order Items
        </div>
        <div className="space-y-1.5">
          {order.items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-zinc-700 dark:text-zinc-300">
                {item.name}
                {item.variant && (
                  <span className="ml-1 text-xs text-zinc-400">
                    ({item.variant})
                  </span>
                )}
                {item.quantity && item.quantity > 1 && (
                  <span className="ml-1 text-xs text-zinc-400">
                    × {item.quantity}
                  </span>
                )}
              </span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {formatRupees(item.price)}
              </span>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Total
          </span>
          <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
            {formatRupees(order.totalAmount)}
          </span>
        </div>

        {/* Tracking Number */}
        {order.trackingNumber && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs dark:bg-blue-900/20">
            <TruckIcon />
            <span className="text-blue-700 dark:text-blue-400">
              Tracking: <strong>{order.trackingNumber}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          <WhatsAppIcon />
          Contact Merchant
        </a>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(order.id).catch(() => {});
          }}
          className="rounded-full bg-zinc-100 px-4 py-2.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          Copy Ref
        </button>
      </div>
    </div>
  );
}

// ─── Main Page Component ────────────────────────────────────────────────────

function OrderTrackingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialOrderId = searchParams.get("orderId") ?? "";
  const initialPhone = searchParams.get("phone") ?? "";

  // Search state
  const [searchMode, setSearchMode] = useState<SearchMode>(
    initialOrderId ? "orderId" : "phone",
  );
  const [phone, setPhone] = useState(initialPhone);
  const [orderId, setOrderId] = useState(initialOrderId);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results state
  const [orders, setOrders] = useState<TrackedOrder[]>([]);
  const [highlightedOrderId, setHighlightedOrderId] = useState<
    string | undefined
  >();
  const [hasSearched, setHasSearched] = useState(false);

  // Recent searches (lazy initializer reads from localStorage)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(
    getRecentSearches,
  );

  // Live realtime status: order IDs that just received a status update
  const [liveUpdatedIds, setLiveUpdatedIds] = useState<Set<string>>(new Set());
  const [liveConnected, setLiveConnected] = useState(false);

  // ── Realtime Subscriptions: keep displayed orders live-updated ─────────
  useEffect(() => {
    if (orders.length === 0) {
      setLiveConnected(false);
      return;
    }

    const unsubscribers = orders.map((order) =>
      subscribeToOrderUpdates(order.id, (notification) => {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === notification.orderId
              ? {
                  ...o,
                  status: notification.newStatus,
                  trackingNumber: notification.trackingNumber ?? o.trackingNumber,
                  updatedAt: notification.timestamp,
                  statusHistory: buildStatusTimeline(
                    notification.newStatus,
                    o.createdAt,
                    notification.timestamp,
                  ),
                }
              : o,
          ),
        );
        setLiveUpdatedIds((prev) => new Set(prev).add(notification.orderId));
        setTimeout(() => {
          setLiveUpdatedIds((prev) => {
            const next = new Set(prev);
            next.delete(notification.orderId);
            return next;
          });
        }, 4000);
      }),
    );

    setLiveConnected(true);

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
    // Only re-subscribe when the *set* of order IDs changes, not on every
    // in-place status mutation triggered by the subscription itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.map((o) => o.id).join(",")]);

  // ── Search Handlers ──────────────────────────────────────────────────────

  // Auto-search once on mount when deep-linked via ?orderId= or ?phone=
  useEffect(() => {
    if (initialOrderId) {
      setSearching(true);
      trackOrderById(initialOrderId).then((result) => {
        if (result.success) {
          setOrders([result.data]);
          setHighlightedOrderId(result.data.id);
          setHasSearched(true);
        } else {
          setError(result.error);
        }
        setSearching(false);
      });
    } else if (initialPhone) {
      setSearching(true);
      trackOrdersByPhone(initialPhone).then((result) => {
        if (result.success) {
          setOrders(result.data.orders);
          setHasSearched(true);
        } else {
          setError(result.error);
        }
        setSearching(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault();
      setError(null);
      setSearching(true);

      try {
        if (searchMode === "phone") {
          const cleaned = phone.replace(/\D/g, "");
          if (cleaned.length < 10) {
            setError("Please enter a valid phone number (min 10 digits).");
            setSearching(false);
            return;
          }

          saveRecentSearch(phone, "phone");
          setRecentSearches(getRecentSearches());

          const result = await trackOrdersByPhone(phone);
          if (result.success) {
            setOrders(result.data.orders);
            setHasSearched(true);
          } else {
            setError(result.error);
          }
        } else {
          const trimmed = orderId.trim();
          if (!trimmed) {
            setError("Please enter an order reference ID.");
            setSearching(false);
            return;
          }

          saveRecentSearch(trimmed, "orderId");
          setRecentSearches(getRecentSearches());

          const result = await trackOrderById(trimmed);
          if (result.success) {
            setOrders([result.data]);
            setHighlightedOrderId(result.data.id);
            setHasSearched(true);
          } else {
            setError(result.error);
            setOrders([]);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to search. Please try again.",
        );
      }

      setSearching(false);
    },
    [searchMode, phone, orderId],
  );

  const handleRecentClick = useCallback(
    (search: RecentSearch) => {
      if (search.mode === "phone") {
        setSearchMode("phone");
        setPhone(search.query);
        // Auto-search after setting
        setTimeout(() => {
          setSearching(true);
          trackOrdersByPhone(search.query).then((result) => {
            if (result.success) {
              setOrders(result.data.orders);
              setHasSearched(true);
            } else {
              setError(result.error);
            }
            setSearching(false);
          });
        }, 100);
      } else {
        setSearchMode("orderId");
        setOrderId(search.query);
        setTimeout(() => {
          setSearching(true);
          trackOrderById(search.query).then((result) => {
            if (result.success) {
              setOrders([result.data]);
              setHighlightedOrderId(result.data.id);
              setHasSearched(true);
            } else {
              setError(result.error);
            }
            setSearching(false);
          });
        }, 100);
      }
    },
    [],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Go back"
          >
            <ChevronLeftIcon />
          </button>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Track Orders
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Check your order status in real-time
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {/* Search Form */}
        <section className="mb-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            {/* Mode Tabs */}
            <div className="mb-4 flex rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setSearchMode("phone");
                  setError(null);
                }}
                className={`flex-1 rounded-full py-2 text-xs font-semibold transition-all ${
                  searchMode === "phone"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                📱 Phone Number
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchMode("orderId");
                  setError(null);
                }}
                className={`flex-1 rounded-full py-2 text-xs font-semibold transition-all ${
                  searchMode === "orderId"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                🆔 Order Ref ID
              </button>
            </div>

            {/* Search Input */}
            <form onSubmit={handleSearch}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    <SearchIcon />
                  </span>
                  {searchMode === "phone" ? (
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setError(null);
                      }}
                      placeholder="+92 300 1234567"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      aria-label="Enter your phone number"
                    />
                  ) : (
                    <input
                      type="text"
                      value={orderId}
                      onChange={(e) => {
                        setOrderId(e.target.value);
                        setError(null);
                      }}
                      placeholder="e.g. a1b2c3d4-..."
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      aria-label="Enter order reference ID"
                    />
                  )}
                  {((searchMode === "phone" && phone) ||
                    (searchMode === "orderId" && orderId)) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (searchMode === "phone") setPhone("");
                        else setOrderId("");
                        setError(null);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      aria-label="Clear input"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {searching ? (
                    <>
                      <SpinnerIcon /> Searching
                    </>
                  ) : (
                    "Track"
                  )}
                </button>
              </div>
            </form>

            {/* Error Message */}
            {error && (
              <div className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
          </div>
        </section>

        {/* Recent Searches */}
        {recentSearches.length > 0 && !hasSearched && (
          <section className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Recent Searches
            </p>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((search) => (
                <button
                  key={`${search.mode}-${search.query}-${search.timestamp}`}
                  type="button"
                  onClick={() => handleRecentClick(search)}
                  className="rounded-full border border-dashed border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
                >
                  {search.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Results */}
        {hasSearched && (
          <section>
            {orders.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {orders.length} Order{orders.length !== 1 ? "s" : ""} Found
                    </h2>
                    {liveConnected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.625rem] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                        Live
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOrders([]);
                      setHasSearched(false);
                      setError(null);
                    }}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Clear Results
                  </button>
                </div>

                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    highlighted={order.id === highlightedOrderId}
                    justUpdated={liveUpdatedIds.has(order.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="mb-4 text-zinc-300 dark:text-zinc-600">
                  <EmptyBoxIcon />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  No Orders Found
                </h3>
                <p className="mt-1 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
                  {searchMode === "phone"
                    ? "We couldn't find any orders linked to this phone number. Make sure you've placed an order with this number."
                    : "No order matched this reference ID. Please double-check and try again."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOrders([]);
                    setHasSearched(false);
                    setError(null);
                  }}
                  className="mt-6 rounded-full bg-zinc-200 px-6 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                >
                  Try Again
                </button>
              </div>
            )}
          </section>
        )}

        {/* Empty State (before any search) */}
        {!hasSearched && !searching && (
          <section className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 text-zinc-300 dark:text-zinc-600">
              <PackageIcon />
            </div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Track Your Order
            </h2>
            <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
              Enter your phone number or order reference ID to check the current
              status of your orders. Once found, this page updates live —
              no need to refresh as your merchant moves your order along.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
              <span className="flex items-center gap-1">
                📋 Pending → ⚙️ Processing → 🚚 Dispatched → ✅ Delivered
              </span>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default function OrderTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <OrderTrackingInner />
    </Suspense>
  );
}