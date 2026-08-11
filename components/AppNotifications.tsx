"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  NotificationBell,
  NotificationListenerProvider,
  NotificationPanel,
  useNotifications,
} from "@/components/NotificationListener";
import { createClient } from "@/lib/supabase/client";

function BrowserNotifyBridge() {
  const { notifications } = useNotifications();

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    // Only ask after the user is engaged (merchant/dashboard sessions register shops).
  }, []);

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
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const { unreadCount, notifications } = useNotifications();
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setVisible(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setVisible(!!session?.user);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      <BrowserNotifyBridge />
      <AutoRegisterMerchantShops />
      <div className="fixed right-3 top-[calc(var(--tm-navbar-sticky-offset,3.5rem)+0.4rem)] z-[120] sm:right-5">
        <NotificationBell
          onClick={toggle}
          className={`rounded-full border bg-white/95 text-zinc-700 shadow-md backdrop-blur transition-transform hover:scale-105 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 ${
            unreadCount > 0 || notifications.length > 0
              ? "border-emerald-200 dark:border-emerald-800"
              : "border-zinc-200/80"
          }`}
        />
      </div>
      <NotificationPanel isOpen={open} onClose={() => setOpen(false)} />
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
