"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
import { getActiveConversationId } from "@/lib/activeChat";

function BrowserNotifyBridge() {
  const { notifications, isMuted } = useNotifications();
  // Seed historical rows on first paint so reload never re-blasts old unread
  // as OS notifications. Only brand-new live rows may ping when tab is hidden.
  const primed = useRef(false);
  const seenIds = useRef<Set<string>>(new Set());

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

    const latest = notifications[0];
    if (!latest || latest.read) return;
    if (seenIds.current.has(latest.id)) return;
    seenIds.current.add(latest.id);

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
        icon: "/icon-192.png?v=10",
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

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}

function NotificationChrome() {
  const { isPanelOpen, closePanel } = useNotifications();

  // Let the service worker ask whether this tab is viewing a chat (suppress push).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; conversationId?: string } | undefined;
      if (!data || data.type !== "tm-active-chat-query") return;
      const viewing =
        Boolean(data.conversationId) &&
        getActiveConversationId() === data.conversationId &&
        document.visibilityState === "visible";
      event.ports?.[0]?.postMessage({ viewing });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  return (
    <>
      <BrowserNotifyBridge />
      <AutoRegisterUserNotifications />
      <AutoSubscribeWebPush />
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
