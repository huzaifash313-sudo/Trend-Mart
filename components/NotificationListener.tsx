"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — DB-Backed In-App Notification Engine                           */
/*                                                                             */
/*  The `public.notifications` table (populated by server-side triggers) is    */
/*  the durable source of truth. This provider:                                */
/*   - Hydrates the bell/panel from the DB on sign-in                          */
/*   - Listens on Supabase Realtime for new notification rows                 */
/*   - Plays a chime + floating toast for live notifications                  */
/*   - Persists a small localStorage cache so the panel renders instantly     */
/*   - Marks rows read / clears history against the DB (RLS-scoped)           */
/*                                                                             */
/*  Notification sources (triggers): support tickets (admin + reporter),       */
/*  orders (merchant sale + buyer confirmation/status), shop inquiries.        */
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
import { subscribeToNotifications } from "@/lib/supabase/realtime";
import type { NotificationPayload } from "@/lib/supabase/realtime";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  fetchMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearMyNotifications,
  type AppNotification,
} from "@/services/notificationService";

const HISTORY_KEY_PREFIX = "trendmart_notif_history_v2";
const PREFS_KEY = "trendmart_notifications";

/**
 * Notification history is cached per ACCOUNT, never per device. On a shared
 * phone running 2–3 different accounts, account B must never see account A's
 * cached notification list — even for the brief moment before B's own rows
 * arrive from the database.
 */
function historyKeyFor(userId: string): string {
  return `${HISTORY_KEY_PREFIX}:${userId || "guest"}`;
}

function loadHistory(userId: string): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(historyKeyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Notification[];
    return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function saveHistory(userId: string, items: Notification[]) {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(historyKeyFor(userId), JSON.stringify(items.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

/** Sound/toast preference — bell always lists DB notifications regardless. */
function prefsAllow(type: Notification["type"]): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return true;
    const prefs = JSON.parse(raw) as Record<string, boolean>;
    if (type === "order") return prefs.order_updates !== false;
    if (type === "sale" || type === "inquiry") {
      return prefs.merchant_alerts !== false;
    }
    return true; // support & system always alert
  } catch {
    return true;
  }
}

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type NotificationType =
  | "support"
  | "order"
  | "sale"
  | "inquiry"
  | "system";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  /** Optional link to navigate to (e.g., order details, support inbox). */
  linkUrl?: string;
  /** Related entity id (ticket / order / inquiry). */
  entityId?: string;
}

const NOTIF_EMOJI: Record<NotificationType, string> = {
  support: "🎫",
  order: "🛒",
  sale: "💰",
  inquiry: "📩",
  system: "🔔",
};

function mapRow(row: AppNotification): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    timestamp: row.created_at,
    read: row.read,
    linkUrl: row.link_url || undefined,
    entityId: row.entity_id || undefined,
  };
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  /** In-app notification history panel (opened from navbar bell). */
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  /** Register the signed-in user's DB-backed notification stream. */
  registerUser: (userId: string) => () => void;
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
  const [historyReady, setHistoryReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  // Track which user ids we've already registered to avoid duplicate streams.
  const registeredUsers = useRef<Set<string>>(new Set());
  // Which account the in-memory list + cache currently belong to. Changing this
  // resets the list so another account on the same device starts clean.
  const currentUserIdRef = useRef<string>("");
  // All live unsubscribe closures, so provider unmount actually tears down.
  const cleanupFns = useRef<Set<() => void>>(new Set());
  // Mute is read via a ref so live inserts don't churn callback identities.
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => setIsPanelOpen((v) => !v), []);

  // History is hydrated lazily inside registerUser once the account is known —
  // never on mount, so a stale cached list can't leak across accounts.
  useEffect(() => {
    setHistoryReady(true);
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    const uid = currentUserIdRef.current;
    if (!uid) return;
    saveHistory(uid, notifications);
  }, [notifications, historyReady]);

  // ── Mute Toggle ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("trendmart_notifications_muted");
        if (stored === "true") setIsMuted(true);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("trendmart_notifications_muted", String(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, []);

  /* ── Live notification handling ─────────────────────────────────────────── */

  // Ingest a fresh DB row: dedupe, prepend, cap at 50, chime + toast.
  const addFromDb = useCallback((row: AppNotification) => {
    // STRICT ACCOUNT SCOPE: only rows addressed to the currently signed-in
    // account may enter this list. With no active account (signed out) or a
    // row for another account (e.g. the previous user on a shared device), the
    // row is dropped outright.
    if (
      !currentUserIdRef.current ||
      (row.user_id && row.user_id !== currentUserIdRef.current)
    ) {
      return;
    }
    const notif = mapRow(row);
    if (!notif.id || !notif.title) return;

    setNotifications((prev) => {
      if (prev.some((n) => n.id === notif.id)) return prev;
      const next = [notif, ...prev].slice(0, 50);
      const uid = currentUserIdRef.current;
      if (uid) saveHistory(uid, next);
      return next;
    });

    if (prefsAllow(notif.type)) {
      if (!isMutedRef.current) {
        playChimeSound();
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("trendmart:toast", {
            detail: {
              type: "info",
              message: `${NOTIF_EMOJI[notif.type] ?? "🔔"} ${notif.title}`,
              duration: 5000,
            },
          }),
        );
      }
    }
  }, []);

  /* ── User Registration (fetch + realtime stream) ────────────────────────── */

  const registerUser = useCallback(
    (userId: string): (() => void) => {
      if (!userId) return () => {};
      // Account switch (or first sign-in): point the in-memory list + cache at
      // THIS account only. Never merge the previous account's rows.
      if (currentUserIdRef.current !== userId) {
        currentUserIdRef.current = userId;
        setNotifications(loadHistory(userId));
      }
      if (registeredUsers.current.has(userId)) return () => {};
      registeredUsers.current.add(userId);

      // Hydrate the bell from the DB (source of truth).
      void fetchMyNotifications().then((result) => {
        // Guard against the account switching before this fetch resolves — the
        // previous account's rows must never land in the new account's list.
        if (currentUserIdRef.current !== userId) return;
        if (result.success) {
          setNotifications((prev) => {
            const byId = new Map(prev.map((n) => [n.id, n]));
            for (const row of result.data) byId.set(row.id, mapRow(row));
            const merged = [...byId.values()]
              .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
              .slice(0, 50);
            saveHistory(userId, merged);
            return merged;
          });
        }
      });

      const unsub = subscribeToNotifications(
        userId,
        (payload) => {
          const row = (
            payload as RealtimePostgresChangesPayload<NotificationPayload>
          ).new;
          if (!row || !("id" in row)) return;
          addFromDb(row as unknown as AppNotification);
        },
      );

      const cleanup = () => {
        unsub();
        registeredUsers.current.delete(userId);
        cleanupFns.current.delete(cleanup);
        // On sign-out or account switch, drop the previous account's in-memory
        // list so the next account on this device starts completely clean.
        if (currentUserIdRef.current === userId) {
          currentUserIdRef.current = "";
          setNotifications([]);
        }
      };
      cleanupFns.current.add(cleanup);
      return cleanup;
    },
    [addFromDb],
  );

  /* ── Mark read / clear ───────────────────────────────────────────────────── */

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    void markNotificationRead(id);
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    void markAllNotificationsRead();
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    const uid = currentUserIdRef.current;
    if (uid) saveHistory(uid, []);
    void clearMyNotifications();
  }, []);

  // ── Cleanup all subscriptions on unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      for (const fn of cleanupFns.current) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
      cleanupFns.current.clear();
      registeredUsers.current.clear();
    };
  }, []);

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
        isPanelOpen,
        openPanel,
        closePanel,
        togglePanel,
        registerUser,
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

  return (
    <div
      role="status"
      className="pointer-events-auto flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm shadow-lg animate-in slide-in-from-top-2 fade-in dark:border-emerald-800 dark:bg-zinc-900"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg dark:bg-emerald-900/30">
        {NOTIF_EMOJI[notification.type] ?? "🔔"}
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
  const { unreadCount, isMuted, togglePanel } = useNotifications();

  return (
    <button
      type="button"
      onClick={onClick ?? togglePanel}
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
                  Order updates, support replies and new sales appear here
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {notifications.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => {
                    markAsRead(notif.id);
                    if (notif.linkUrl) {
                      onClose();
                      if (typeof window !== "undefined") {
                        window.location.assign(notif.linkUrl);
                      }
                    }
                  }}
                  className={`block w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                    !notif.read ? "bg-emerald-50/50 dark:bg-emerald-900/10" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 text-lg">
                      {NOTIF_EMOJI[notif.type] ?? "🔔"}
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
