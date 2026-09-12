"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  NotificationListenerProvider,
  NotificationPanel,
  useNotifications,
} from "@/components/NotificationListener";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/services/authService";
import {
  getPushPermissionState,
  isPushClientSupported,
  syncPushSubscriptionIfGranted,
} from "@/lib/pushClient";
import ChatIncomingBanner from "@/components/ChatIncomingBanner";
import { isViewingConversation } from "@/lib/activeChat";
import { isChatNotification } from "@/lib/chatNotifications";
import PermissionNudge from "@/components/PermissionNudge";

function BrowserNotifyBridge() {
  const { notifications, isMuted } = useNotifications();
  // Seed historical rows on first paint so reload never re-blasts old unread
  // as OS notifications. Only brand-new live rows may ping when tab is hidden.
  const primed = useRef(false);
  const seenIds = useRef<Set<string>>(new Set());
  // When web push is active the service worker already shows the OS toast, so
  // this bridge must stay silent or the user gets the same alert twice.
  const pushHandlesIt = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) pushHandlesIt.current = Boolean(subscription);
      } catch {
        if (!cancelled) pushHandlesIt.current = false;
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (isMuted) return;

    if (!primed.current) {
      for (const n of notifications) seenIds.current.add(n.id);
      primed.current = true;
      return;
    }

    // Foreground: in-app toast/chime is enough. OS ping only if tab not visible.
    if (document.visibilityState !== "hidden") {
      for (const n of notifications) seenIds.current.add(n.id);
      return;
    }

    if (pushHandlesIt.current) {
      for (const n of notifications) seenIds.current.add(n.id);
      return;
    }

    const latest = notifications[0];
    if (!latest || latest.read) return;
    if (seenIds.current.has(latest.id)) return;
    seenIds.current.add(latest.id);

    // Chat never uses OS Notification API from the tab — web push + banner only.
    if (isChatNotification(latest)) return;

    // Respect user prefs — promotions / non-essential stay quiet.
    try {
      const raw = localStorage.getItem("trendsmart_notifications");
      if (raw) {
        const prefs = JSON.parse(raw) as Record<string, boolean>;
        if (latest.type === "order" && prefs.order_updates === false) return;
        if (
          (latest.type === "sale" || latest.type === "inquiry") &&
          prefs.merchant_alerts === false
        ) {
          return;
        }
      }
    } catch {
      /* ignore */
    }

    try {
      const n = new Notification(latest.title, {
        body: latest.body,
        icon: "/icon-192.png?v=16",
        tag: `tm-live-${latest.id}`,
      });
      n.onclick = () => {
        window.focus();
        if (latest.linkUrl) window.location.href = latest.linkUrl;
        n.close();
      };
    } catch {
      /* ignore */
    }
  }, [notifications, isMuted]);

  return null;
}

function AutoRegisterUserNotifications() {
  const { registerUser } = useNotifications();

  useEffect(() => {
    const supabase = createClient();
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    // Guard against the INITIAL_SESSION auth event racing the explicit
    // getUser() IIFE — both would otherwise register and churn the channel.
    let lastRegisteredUserId: string | null = null;

    const registerForUser = (userId: string) => {
      if (cancelled) return;
      if (lastRegisteredUserId === userId) return; // already subscribed
      cleanup?.();
      lastRegisteredUserId = userId;
      cleanup = registerUser(userId);
    };

    void (async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user || cancelled) {
        if (error) {
          try {
            await signOut();
          } catch {
            /* ignore */
          }
        }
        return;
      }
      registerForUser(user.id);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        registerForUser(session.user.id);
      } else {
        cleanup?.();
        cleanup = undefined;
        lastRegisteredUserId = null;
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
      sub.subscription.unsubscribe();
    };
  }, [registerUser]);

  return null;
}

function AutoSubscribeWebPush() {
  useEffect(() => {
    if (!isPushClientSupported()) return;

    let cancelled = false;
    const supabase = createClient();
    let lastAttempt = 0;

    const trySync = async () => {
      if (cancelled) return;
      // Debounce auth + visibility storms (min 60s between attempts).
      const now = Date.now();
      if (now - lastAttempt < 60_000) return;
      lastAttempt = now;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;

      const permission = await getPushPermissionState();
      if (permission === "denied" || permission === "unsupported") return;

      // Only silent re-sync when already granted — never prompt, never OS toast.
      if (permission === "granted") {
        await syncPushSubscriptionIfGranted(false);
      }
    };

    void trySync();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Skip noisy TOKEN_REFRESHED / INITIAL_SESSION churn.
      if (!session?.user) return;
      if (event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      void trySync();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") void trySync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

function NotificationChrome() {
  const { isPanelOpen, closePanel } = useNotifications();
  const router = useRouter();

  // Let the service worker ask whether this tab is viewing a chat (suppress push).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; conversationId?: string; title?: string; body?: string; url?: string }
        | undefined;
      if (!data?.type) return;

      // Notification tapped while a tab is already open — route in-app instead
      // of a full document load.
      if (data.type === "tm-notification-navigate" && data.url) {
        try {
          const target = new URL(data.url, window.location.origin);
          if (target.origin !== window.location.origin) return;
          router.push(`${target.pathname}${target.search}${target.hash}`);
        } catch {
          /* ignore malformed url */
        }
        return;
      }

      if (data.type === "tm-active-chat-query") {
        const viewing =
          Boolean(data.conversationId) &&
          isViewingConversation(data.conversationId) &&
          document.visibilityState === "visible";
        event.ports?.[0]?.postMessage({ viewing });
        return;
      }

      // App open on another page: show WhatsApp-style banner instead of OS toast.
      if (data.type === "tm-chat-alert" && data.conversationId) {
        if (isViewingConversation(data.conversationId)) return;
        window.dispatchEvent(
          new CustomEvent("trendsmart:chat-alert", {
            detail: {
              conversationId: data.conversationId,
              title: data.title || "New message",
              body: data.body || "",
              linkUrl: data.url || `/account/inquiries?c=${data.conversationId}`,
            },
          }),
        );
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return (
    <>
      <BrowserNotifyBridge />
      <AutoRegisterUserNotifications />
      <AutoSubscribeWebPush />
      <PermissionNudge />
      <ChatIncomingBanner />
      <NotificationPanel isOpen={isPanelOpen} onClose={closePanel} />
    </>
  );
}

export default function AppNotifications({ children }: { children: ReactNode }) {
  return (
    <NotificationListenerProvider>
      {children}
      <NotificationChrome />
    </NotificationListenerProvider>
  );
}
