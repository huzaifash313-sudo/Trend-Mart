/* TrendsMart SW v50 — push + image cache + offline navigation fallback.
   Document navigations are network-first; on total network failure we serve
   /offline. Only same-origin / Cloudinary / Next image proxy are SWR-cached
   (SW fetch uses connect-src; caching flickr/unsplash/wikimedia causes CSP noise).
   Chat pushes: suppress when viewing that convo; in-app banner when app visible;
   OS notification only when fully backgrounded. */

const IMAGE_CACHE = "tm-images-v50";
const SHELL_CACHE = "tm-shell-v50";
const KEEP = new Set([IMAGE_CACHE, SHELL_CACHE]);

function isSwCacheableImage(url, req) {
  const host = url.hostname;
  if (host.includes("res.cloudinary.com") || host.includes("cloudinary.com")) return true;
  if (url.pathname.startsWith("/_next/image")) return true;
  if (url.origin === self.location.origin && req.destination === "image") return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL_CACHE);
        await cache.addAll(["/offline", "/trendsmart-mark.png?v=14"]);
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

  // Do not intercept third-party demo CDNs — browser loads them via img-src.
  if (!isSwCacheableImage(url, req)) return;

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
    icon: (data && data.icon) || "/trendsmart-mark.png?v=14",
    badge: (data && data.badge) || "/trendsmart-mark.png?v=14",
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
      // Chat: suppress OS toast when viewing that thread; otherwise if the app
      // is open, tell a visible client to show the in-app banner.
      if (conversationId) {
        try {
          const clients = await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });
          let anyVisible = false;
          let viewing = false;
          for (const client of clients) {
            if (client.visibilityState !== "visible") continue;
            anyVisible = true;
            const isViewing = await new Promise((resolve) => {
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
            if (isViewing) {
              viewing = true;
              break;
            }
          }
          if (viewing) return;
          if (anyVisible) {
            for (const client of clients) {
              if (client.visibilityState !== "visible") continue;
              try {
                client.postMessage({
                  type: "tm-chat-alert",
                  conversationId,
                  title,
                  body: options.body,
                  url: options.data && options.data.url,
                });
              } catch {
                /* ignore */
              }
            }
            return;
          }
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
