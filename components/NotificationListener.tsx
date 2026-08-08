"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Real-Time Order Notification Sound & Toast Alert Engine         */
/*                                                                             */
/*  Features:                                                                  */
/*   - Supabase Realtime channel subscription for new orders & inquiries       */
/*   - Professional chime sound on new order/inquiry dispatch                 */
/*   - Animated floating toast notification in merchand dashboard header       */
/*   - Unread notification badge counter                                       */
/*   - Notification history panel (last 20 notifications)                     */
/*   - Sound mute toggle                                                       */
/*   - Auto-cleanup on unmount                                                 */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToOrders, subscribeToInquiries } from "@/lib/supabase/realtime";
import type { OrderPayload, InquiryPayload } from "@/lib/supabase/realtime";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface Notification {
  id: string;
  type: "order" | "inquiry";
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  /** Optional link to navigate to (e.g., order details, inquiry) */
  linkUrl?: string;
  /** Optional shop ID for context */
  shopId?: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  /** Register a shop to listen for notifications. Returns cleanup function. */
  registerShop: (shopId: string) => () => void;
}

/* ─── Context ──────────────────────────────────────────────────────────────── */

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error(
      "useNotifications must be used within <NotificationListenerProvider>",
    );
  return ctx;
}

/* ─── Chime Sound Generator (Synthesized, no external file needed) ─────────── */

/**
 * Play a subtle professional chime using the Web Audio API.
 * No external audio files needed — synthesized in-browser.
 */
function playChimeSound() {
  try {
    const audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();

    // Two-tone gentle chime
    const frequencies = [880, 1100]; // A5, C#6 — pleasant major third

    frequencies.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);

      // Fast attack, gentle decay
      const startTime = audioContext.currentTime + i * 0.12;
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + 0.4);
    });

    // Clean up audio context after playing
    setTimeout(() => {
      audioContext.close().catch(() => {});
    }, 600);
  } catch {
    // Audio API not supported — silently skip
  }
}

/* ─── Provider Component ───────────────────────────────────────────────────── */

export function NotificationListenerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [muteHydrated, setMuteHydrated] = useState(false);
  const [activeShopIds, setActiveShopIds] = useState<Set<string>>(new Set());
  const channelRefs = useRef<Set<string>>(new Set());

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Mute Toggle ────────────────────────────────────────────────────────────
  // Hydrate mute preference from localStorage after hydration to avoid SSR mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("trendmart_notifications_muted");
        if (stored === "true") setIsMuted(true);
      } catch {
        // Ignore
      }
    }
    setMuteHydrated(true);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("trendmart_notifications_muted", String(next));
        } catch {
          // Ignore
        }
      }
      return next;
    });
  }, []);

  // ── Notification Management ────────────────────────────────────────────────
  const addNotification = useCallback(
    (notification: Omit<Notification, "id" | "timestamp" | "read">) => {
      const newNotif: Notification = {
        ...notification,
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => [newNotif, ...prev].slice(0, 50)); // Keep max 50

      // Play chime if not muted
      if (!isMuted) {
        playChimeSound();
      }

      // Dispatch custom event for toast integration
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("trendmart:toast", {
            detail: {
              type: "info",
              message: `${notification.type === "order" ? "🛒" : "📩"} ${notification.title}`,
              duration: 5000,
            },
          }),
        );
      }
    },
    [isMuted],
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // ── Shop Registration for Realtime Subscriptions ───────────────────────────
  const registerShop = useCallback(
    (shopId: string): (() => void) => {
      if (channelRefs.current.has(shopId)) {
        // Already subscribed — no-op
        return () => {};
      }

      setActiveShopIds((prev) => new Set(prev).add(shopId));

      // Subscribe to new orders
      const unsubOrders = subscribeToOrders(
        shopId,
        (payload) => {
          const order = (payload as RealtimePostgresChangesPayload<OrderPayload>).new;
          if (!order || !("id" in order)) return;
          addNotification({
            type: "order",
            title: `New Order from ${order.customer_name || "a customer"}`,
            body: `Amount: Rs. ${(order.total_amount ?? 0).toLocaleString()} — Status: ${order.status}`,
            linkUrl: `/dashboard`,
            shopId,
          });
        },
        (payload) => {
          const order = (payload as RealtimePostgresChangesPayload<OrderPayload>).new;
          if (!order || !("id" in order)) return;
          addNotification({
            type: "order",
            title: `Order Updated: ${order.customer_name || "Customer"}`,
            body: `Status changed to: ${order.status} — Rs. ${(order.total_amount ?? 0).toLocaleString()}`,
            linkUrl: `/dashboard`,
            shopId,
          });
        },
      );

      // Subscribe to new inquiries
      const unsubInquiries = subscribeToInquiries(
        shopId,
        (payload) => {
          const inquiry = (payload as RealtimePostgresChangesPayload<InquiryPayload>).new;
          if (!inquiry || !("id" in inquiry)) return;
          addNotification({
            type: "inquiry",
            title: `New Inquiry from ${inquiry.customer_name || "a customer"}`,
            body: inquiry.message?.slice(0, 120) ?? "No message content",
            linkUrl: `/dashboard`,
            shopId,
          });
        },
        (payload) => {
          const inquiry = (payload as RealtimePostgresChangesPayload<InquiryPayload>).new;
          if (!inquiry || !("id" in inquiry)) return;
          if (inquiry.is_read) {
            addNotification({
              type: "inquiry",
              title: `Inquiry Read: ${inquiry.customer_name || "Customer"}`,
              body: "Inquiry marked as read",
              linkUrl: `/dashboard`,
              shopId,
            });
          }
        },
      );

      channelRefs.current.add(shopId);

      // Return cleanup
      return () => {
        unsubOrders();
        unsubInquiries();
        channelRefs.current.delete(shopId);
        setActiveShopIds((prev) => {
          const next = new Set(prev);
          next.delete(shopId);
          return next;
        });
      };
    },
    [addNotification],
  );

  // ── Cleanup all subscriptions on unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      // Individual cleanup happens via registerShop return functions
      channelRefs.current.clear();
    };
  }, []);

  // ── Persist active shop subscriptions across sessions ──────────────────────
  useEffect(() => {
    // If dashboard has previously registered shops, try to re-register them
    const savedIds =
      typeof window !== "undefined"
        ? localStorage.getItem("trendmart_notification_shops")
        : null;
    if (savedIds) {
      try {
        const ids: string[] = JSON.parse(savedIds);
        for (const id of ids) {
          registerShop(id);
        }
      } catch {
        // Invalid JSON, ignore
      }
    }
    // We intentionally don't call registerShop in cleanup deps because
    // registerShop is stable due to useCallback with addNotification
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save active shop IDs for re-subscription on next visit ─────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && activeShopIds.size > 0) {
      localStorage.setItem(
        "trendmart_notification_shops",
        JSON.stringify(Array.from(activeShopIds)),
      );
    }
  }, [activeShopIds]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearNotifications,
        isMuted,
        toggleMute,
        registerShop,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

/* ─── Floating Toast Alert Component ───────────────────────────────────────── */

export function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const icon = notification.type === "order" ? "🛒" : "📩";

  return (
    <div
      role="status"
      className="pointer-events-auto flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm shadow-lg animate-in slide-in-from-top-2 fade-in dark:border-emerald-800 dark:bg-zinc-900"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg dark:bg-emerald-900/30">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {notification.title}
        </p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {notification.body}
        </p>
        <p className="mt-0.5 text-[0.625rem] text-zinc-400 dark:text-zinc-500">
          {new Date(notification.timestamp).toLocaleTimeString("en-PK", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        aria-label="Dismiss notification"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/* ─── Notification Bell Badge (for header icons) ───────────────────────────── */

export function NotificationBell({
  onClick,
  className = "",
}: {
  onClick?: () => void;
  className?: string;
}) {
  const { unreadCount, isMuted, toggleMute } = useNotifications();

  return (
    <button
      type="button"
      onClick={onClick ?? toggleMute}
      className={`relative inline-flex items-center rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 ${className}`}
      aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ""}`}
    >
      {/* Bell Icon */}
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
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>

      {/* Unread Badge */}
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[0.625rem] font-bold text-white shadow-sm transition-transform hover:scale-110">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}

      {/* Mute indicator */}
      {isMuted && (
        <span className="absolute -bottom-0.5 -right-0.5 text-[0.5rem]" aria-hidden="true">
          🔇
        </span>
      )}
    </button>
  );
}

/* ─── Notification History Panel ───────────────────────────────────────────── */

export function NotificationPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    isMuted,
    toggleMute,
  } = useNotifications();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl animate-in slide-in-from-right dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {unreadCount} unread
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Mute toggle */}
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-full p-2 text-sm text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label={isMuted ? "Unmute sounds" : "Mute sounds"}
              title={isMuted ? "Sounds muted — tap to unmute" : "Sounds on — tap to mute"}
            >
              {isMuted ? "🔇" : "🔔"}
            </button>
            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Close"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Actions */}
        {notifications.length > 0 && (
          <div className="flex gap-2 border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Mark all as read
            </button>
            <button
              type="button"
              onClick={clearNotifications}
              className="text-xs font-medium text-red-500 hover:underline dark:text-red-400"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 py-16 text-center">
              <div>
                <span className="text-4xl">🔔</span>
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  No notifications yet
                </p>
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  New orders and inquiries will appear here
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {notifications.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => markAsRead(notif.id)}
                  className={`block w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                    !notif.read ? "bg-emerald-50/50 dark:bg-emerald-900/10" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 text-lg">
                      {notif.type === "order" ? "🛒" : "📩"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {notif.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {notif.body}
                      </p>
                      <p className="mt-1 text-[0.625rem] text-zinc-400 dark:text-zinc-500">
                        {new Date(notif.timestamp).toLocaleString("en-PK", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {!notif.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}