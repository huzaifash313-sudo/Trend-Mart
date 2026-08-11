"use client";

import { useEffect, type ReactNode } from "react";
import {
  NotificationListenerProvider,
  NotificationPanel,
  useNotifications,
} from "@/components/NotificationListener";
import { createClient } from "@/lib/supabase/client";

function BrowserNotifyBridge() {
  const { notifications } = useNotifications();

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
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
  }, [notifications]);

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

      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "default") {
          void Notification.requestPermission().catch(() => undefined);
        }
      }

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

function NotificationChrome() {
  const { isPanelOpen, closePanel } = useNotifications();

  return (
    <>
      <BrowserNotifyBridge />
      <AutoRegisterMerchantShops />
      <NotificationPanel isOpen={isPanelOpen} onClose={closePanel} />
    </>
  );
}

/** Mounts realtime + OS notification bridge app-wide. */
export default function AppNotifications({ children }: { children: ReactNode }) {
  return (
    <NotificationListenerProvider>
      {children}
      <NotificationChrome />
    </NotificationListenerProvider>
  );
}
