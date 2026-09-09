"use client";

import { NotificationBell, useNotifications } from "@/components/NotificationListener";

/**
 * Navbar-mounted notification bell.
 * Always rendered — signed-in users get their DB-backed notification list and
 * unread badge; guests simply see an empty panel (no silent gap in the bar).
 */
export default function NavbarNotificationButton() {
  const { togglePanel } = useNotifications();

  return (
    <NotificationBell
      onClick={togglePanel}
      className="tm-navbar-icon-btn tm-nav-ic-bell"
    />
  );
}
