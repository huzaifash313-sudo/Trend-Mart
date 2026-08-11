"use client";

import { useEffect, type ReactNode } from "react";
import {
  NotificationListenerProvider,
  NotificationPanel,
  useNotifications,
} from "@/components/NotificationListener";
import { createClient } from "@/lib/supabase/client";
import {
  getPushPermissionState,
  isPushClientSupported,
  subscribeToPushNotifications,
} from "@/lib/pushClient";

function BrowserNotifyBridge() {
  const { notifications, isMuted } = useNotifications();

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (isMuted) return;
    const latest = notifications[0];
    if (!latest || latest.read) return;
    try {
      const n = new Notification(latest.title, {
        body: latest.body,
        icon: "/icon-192.png",
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: shops } = await supabase
        .from("shops")
        .select("id")
        .eq("owner_id", user.id);

      if (!shops?.length || cancelled) return;

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

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      cleanup = registerCustomer(user.id);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      cleanup?.();
      cleanup = undefined;
      if (session?.user) {
        cleanup = registerCustomer(session.user.id);
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
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const permission = await getPushPermissionState();
      if (permission === "denied" || permission === "unsupported") return;

      const already =
        typeof window !== "undefined" &&
        localStorage.getItem("trendmart_push_subscribed") === "true";

      if (permission === "granted" || already) {
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
