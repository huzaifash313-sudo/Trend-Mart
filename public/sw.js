/* TrendMart SW v42 — install/activate + web-push delivery.
   Does NOT intercept fetches (avoids breaking Next.js client navigations).
   Clears old caches from previous SW versions.
   Adds the `push` + `notificationclick` handlers so OS notifications from
   lib/webPush.ts actually render and navigate to the right page. */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/* Intentionally no fetch handler — let the network handle all requests. */

/* -------------------------------------------------------------------------- */
/*  Web Push                                                                   */
/*  The server sends a JSON body with { title, body, url, tag, icon, badge }.  */
/* -------------------------------------------------------------------------- */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* payload may be absent or non-JSON — fall back to empty object */
  }

  const title = (data && data.title) || "TrendMart";
  const options = {
    body: (data && data.body) || "",
    icon: (data && data.icon) || "/trendmart-mark.png?v=10",
    badge: (data && data.badge) || "/trendmart-mark.png?v=10",
    tag: (data && data.tag) || undefined,
    data: {
      url: (data && data.url) || "/",
    },
    // Reuse the same tag so repeated updates collapse into one notification.
    renotify: true,
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch(() => {}),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const url = new URL(targetUrl, self.location.origin).href;

      // Focus an existing window on this origin if one is open.
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(url);
          }
          return;
        }
      }
      // Otherwise open a fresh window.
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
