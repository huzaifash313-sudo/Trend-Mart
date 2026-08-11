"use client";

import { useEffect, useState } from "react";
import { NotificationBell, useNotifications } from "@/components/NotificationListener";
import { createClient } from "@/lib/supabase/client";

/**
 * Navbar-mounted notification bell (next to search).
 * Visible only when a user is signed in.
 */
export default function NavbarNotificationButton() {
  const [visible, setVisible] = useState(false);
  const { unreadCount, notifications, togglePanel } = useNotifications();

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
    <NotificationBell
      onClick={togglePanel}
      className={`tm-navbar-icon-btn !rounded-[0.65rem] !p-0 text-white hover:!bg-white/14 dark:text-white dark:hover:!bg-white/14 ${
        unreadCount > 0 || notifications.length > 0
          ? "ring-1 ring-white/35"
          : ""
      }`}
    />
  );
}
