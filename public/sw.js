/* TrendsMart SW v46 — push + image cache + offline navigation fallback.
   Document navigations are network-first; on total network failure we serve
   /offline. Images use stale-while-revalidate. Chat pushes are suppressed when
   a focused client is already viewing that conversation. */

const IMAGE_CACHE = "tm-images-v46";
const SHELL_CACHE = "tm-shell-v46";
const KEEP = new Set([IMAGE_CACHE, SHELL_CACHE]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL_CACHE);
        await cache.addAll(["/offline", "/trendsmart-mark.png?v=10"]);
      } catch {
        /* offline page / icon may be unavailable during install */
      }
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Navigations: network-first, fall back to cached /offline (never hijack
  // successful Next.js App Router responses).
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          return res;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match("/offline");
          if (offline) return offline;
          return new Response(
            "<!doctype html><title>Offline</title><h1>You are offline</h1><p>Reconnect and try again.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
          );
        }
      })(),
    );
    return;
  }

  const isImage =
    req.destination === "image" ||
    url.hostname.includes("cloudinary.com") ||
    url.hostname.includes("res.cloudinary.com") ||
    url.pathname.startsWith("/_next/image");

  if (!isImage) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(req);
      if (cached) {
        // Revalidate in background (stale-while-revalidate).
        event.waitUntil(
          fetch(req)
            .then((res) => {
              if (res && res.ok) return cache.put(req, res.clone());
            })
            .catch(() => undefined),
        );
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          cache.put(req, res.clone()).catch(() => undefined);
        }
        return res;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});

/* -------------------------------------------------------------------------- */
/*  Web Push                                                                   */
/* -------------------------------------------------------------------------- */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* payload may be absent or non-JSON — fall back to empty object */
  }

  const title = (data && data.title) || "TrendsMart";
  const conversationId = data && data.conversationId;

  const options = {
    body: (data && data.body) || "",
    icon: (data && data.icon) || "/trendsmart-mark.png?v=10",
    badge: (data && data.badge) || "/trendsmart-mark.png?v=10",
    tag: (data && data.tag) || "trendsmart-order",
    data: {
      url: (data && data.url) || "/",
      conversationId: conversationId || null,
    },
    // Only renotify when server asks (real order / chat events). Default quiet replace.
    renotify: Boolean(data && data.renotify),
    requireInteraction: false,
    vibrate: data && data.renotify ? [120, 60, 120] : undefined,
  };

  event.waitUntil(
    (async () => {
      // Chat: if any TrendsMart tab is visible, in-app banner handles it.
      // Only show an OS notification when the app is fully in the background.
      if (conversationId) {
        try {
          const clients = await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });
          let anyVisible = false;
          for (const client of clients) {
            if (client.visibilityState === "visible") {
              anyVisible = true;
              const viewing = await new Promise((resolve) => {
                try {
                  const channel = new MessageChannel();
                  const timer = setTimeout(() => resolve(false), 400);
                  channel.port1.onmessage = (ev) => {
                    clearTimeout(timer);
                    resolve(Boolean(ev.data && ev.data.viewing));
                  };
                  client.postMessage(
                    { type: "tm-active-chat-query", conversationId },
                    [channel.port2],
                  );
                } catch {
                  resolve(false);
                }
              });
              if (viewing) return;
            }
          }
          if (anyVisible) return;
        } catch {
          /* fall through and show */
        }
      }

      await self.registration.showNotification(title, options).catch(() => {});
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const url = new URL(targetUrl, self.location.origin).href;

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
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
