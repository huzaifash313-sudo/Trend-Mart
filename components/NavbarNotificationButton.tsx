"use client";

import { NotificationBell, useNotifications } from "@/components/NotificationListener";

/**
 * Navbar-mounted notification bell.
 * Always rendered — signed-in users get their DB-backed notification list and
 * unread badge; guests simply see an empty panel (no silent gap in the bar).
 */
export default function NavbarNotificationButton() {
  const { unreadCount, notifications, togglePanel } = useNotifications();

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
