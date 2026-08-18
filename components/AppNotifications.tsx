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

function AutoRegisterMerchantShops() {
  const { registerShop } = useNotifications();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      // getUser() validates the JWT. getSession() can return a wiped/stale
      // local session after SQL resets → 401 on shops?owner_id=...
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

      const { data: shops, error: shopError } = await supabase
        .from("shops")
        .select("id")
        .eq("owner_id", user.id);

      if (shopError || !shops?.length || cancelled) return;

      for (const shop of shops) {
        if (shop.id) cleanups.push(registerShop(shop.id));
      }
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [registerShop]);

  return null;
}

function AutoRegisterCustomerOrders() {
  const { registerCustomer } = useNotifications();

  useEffect(() => {
    const supabase = createClient();
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    // Guard against the INITIAL_SESSION auth event racing the explicit
    // getSession() IIFE — both would otherwise register and churn the channel.
    let lastRegisteredUserId: string | null = null;

    const registerForUser = (userId: string) => {
      if (cancelled) return;
      if (lastRegisteredUserId === userId) return; // already subscribed
      cleanup?.();
      lastRegisteredUserId = userId;
      cleanup = registerCustomer(userId);
    };

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;
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
  }, [registerCustomer]);

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
      <AutoRegisterMerchantShops />
      <AutoRegisterCustomerOrders />
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
