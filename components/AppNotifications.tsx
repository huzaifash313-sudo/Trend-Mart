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
  subscribeToPushNotifications,
} from "@/lib/pushClient";

function BrowserNotifyBridge() {
  const { notifications, isMuted } = useNotifications();
  // Each notification should only ever fire ONE system notification. Without
  // this, marking the top item read (or any array change) re-fired the next
  // unread item, re-announcing old notifications.
  const notifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (isMuted) return;
    const latest = notifications[0];
    if (!latest || latest.read) return;
    if (notifiedIds.current.has(latest.id)) return;
    notifiedIds.current.add(latest.id);
    try {
      const n = new Notification(latest.title, {
        body: latest.body,
        icon: "/icon-192.png?v=8",
        tag: latest.id,
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

    const trySubscribe = async () => {
      if (cancelled) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;

      const permission = await getPushPermissionState();
      if (permission === "denied" || permission === "unsupported") return;

      // SECURITY/UX: only auto-subscribe when permission is ALREADY granted.
      // Never call requestPermission() outside a user gesture — the browser
      // silently suppresses it and the "trendmart_push_subscribed" flag alone
      // must not trigger a prompt.
      if (permission === "granted") {
        await subscribeToPushNotifications();
      }
    };

    void trySubscribe();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void trySubscribe();
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

  return (
    <>
      <BrowserNotifyBridge />
      <AutoRegisterUserNotifications />
      <AutoSubscribeWebPush />
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
