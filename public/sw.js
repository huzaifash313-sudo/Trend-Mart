/* TrendsMart SW v53 — offline-first app shell.
   Goals:
   - Repeat PWA opens feel native: successful visits to PUBLIC pages are
     cached, so the next launch (even fully offline) opens the real home page
     instead of the plain /offline fallback.
   - Network-first navigations with a short cache fallback (no long white
     screens on flaky/slow networks).
   - App assets (/ _next/static JS/CSS, fonts, icons) are cached as they are
     used (SWR), so a cached page can still hydrate when offline.
   - Images (Cloudinary / Next image proxy) stay SWR-cached as before.
   - Private areas (dashboard/admin/account/orders/settings/cart/auth…) are
     NEVER cached — only public catalog pages may be stored.
   - When a page had to be served from cache because the network failed, the
     SW tells visible clients {type:"tm-conn", state:"offline"} so the app can
     show a subtle "You're offline" pill instead of looking broken.
   Push / notifications logic unchanged from v52. */

const PAGE_CACHE = "tm-pages-v53"; /* rendered HTML of visited public pages */
const SHELL_CACHE = "tm-shell-v53"; /* /_next/static, fonts, icons, /offline */
const IMAGE_CACHE = "tm-images-v53"; /* Cloudinary / Next image proxy */
const KEEP = new Set([PAGE_CACHE, SHELL_CACHE, IMAGE_CACHE]);

/** Keep these bounded — evict oldest entries past the cap on every write. */
const PAGE_CACHE_LIMIT = 24;
const SHELL_CACHE_LIMIT = 140;

/** Route prefixes that may be cached for offline reading (public catalog). */
const PUBLIC_ROOTS = [
  "/products",
  "/deals",
  "/search",
  "/shop",
  "/legal",
  "/faq",
  "/recently-viewed",
];

/** Personal / private roots — a cached copy could leak one user to another. */
const PRIVATE_ROOTS = [
  "/dashboard",
  "/admin",
  "/account",
  "/orders",
  "/settings",
  "/auth",
  "/login",
  "/signup",
  "/wishlist",
  "/cart",
  "/checkout",
  "/banned",
  "/t/",
  "/o/",
  "/p/",
];

function isPublicPage(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  if (p === "/") return true;
  if (PRIVATE_ROOTS.some((root) => p === root || p.startsWith(root))) return false;
  return PUBLIC_ROOTS.some((root) => p === root || p.startsWith(root));
}

function isShellAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  if (p.startsWith("/_next/static/")) return true;
  if (p.startsWith("/fonts/")) return true;
  if (p === "/trendsmart-mark.png" || p === "/trendmart-mark.png") return true;
  if (p === "/icon-192.png" || p === "/icon-512.png") return true;
  if (p === "/apple-touch-icon.png" || p === "/favicon.ico") return true;
  if (p === "/favicon.png" || p === "/favicon-16.png" || p === "/favicon-32.png") return true;
  if (p === "/manifest.webmanifest" || p === "/manifest.json") return true;
  return false;
}

function isSwCacheableImage(url, req) {
  const host = url.hostname;
  if (host.includes("res.cloudinary.com") || host.includes("cloudinary.com")) return true;
  if (url.pathname.startsWith("/_next/image")) return true;
  if (url.origin === self.location.origin && req.destination === "image") return true;
  return false;
}

/** Response is worth storing offline? Never store failures, opaques, or
    pages flagged private/no-store (auth walls set these). */
function cacheableResponse(res) {
  if (!res || !res.ok) return false;
  if (res.type === "opaque" || res.type === "opaqueredirect") return false;
  const cc = res.headers.get("cache-control") || "";
  if (/no-store|no-cache/i.test(cc)) return false;
  if (/private/i.test(cc)) return false;
  if (res.headers.get("set-cookie")) return false;
  return true;
}

async function trimCache(cacheName, limit) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= limit) return;
    // Browsers return keys in insertion order in practice; drop the oldest.
    const overflow = keys.length - limit;
    await Promise.all(keys.slice(0, overflow).map((k) => cache.delete(k)));
  } catch {
    /* never block the app */
  }
}

function broadcastConnection(state) {
  self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      for (const client of clients) {
        try {
          client.postMessage({ type: "tm-conn", state });
        } catch {
          /* ignore */
        }
      }
    })
    .catch(() => {});
}

async function openPageCache() {
  return caches.open(PAGE_CACHE);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL_CACHE);
        await cache.addAll(["/offline", "/trendsmart-mark.png?v=16"]);
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

/* Allow clients to apply a freshly installed SW (see PwaRegister). */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "tm-skip-waiting") {
    self.skipWaiting();
  }
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

  /* ------------------------------------------------------------------ */
  /*  Document navigations                                               */
  /* ------------------------------------------------------------------ */
  if (req.mode === "navigate" || req.destination === "document") {
    const pageUrl = req.url;
    const cacheable = isPublicPage(url);

    event.respondWith(
      (async () => {
        const pageCache = cacheable ? await openPageCache() : null;
        const cached = cacheable ? await pageCache.match(pageUrl) : undefined;

        // Try the network. On success: return fresh + refresh the cache copy.
        const netPromise = (async () => {
          try {
            const res = await fetch(req);
            if (res && res.ok && cacheable) {
              event.waitUntil(
                pageCache
                  .put(pageUrl, res.clone())
                  .then(() => trimCache(PAGE_CACHE, PAGE_CACHE_LIMIT))
                  .catch(() => {}),
              );
            }
            return { res };
          } catch {
            return { err: true };
          }
        })();

        if (cached) {
          // Network-first, but never leave the user staring at a blank page:
          // if the network hasn't answered within ~3s (or fails outright),
          // show the cached copy immediately and keep refreshing in the bg.
          const winner = await Promise.race([
            netPromise,
            new Promise((resolve) =>
              setTimeout(() => resolve({ timeout: true }), 3000),
            ),
          ]);
          if (winner.timeout) {
            event.waitUntil(netPromise.catch(() => {}));
            return cached;
          }
          if (winner.err) {
            event.waitUntil(netPromise.catch(() => {}));
            broadcastConnection("offline");
            return cached;
          }
          if (winner.res) {
            // Fresh answer (incl. non-2xx — show the server's real state).
            broadcastConnection("online");
            return winner.res;
          }
          return cached;
        }

        // No cached copy — wait for the real network (don't give up early).
        const result = await netPromise;
        if (result && !result.err && result.res) {
          broadcastConnection("online");
          return result.res;
        }

        // Truly offline and nothing cached for this page.
        broadcastConnection("offline");
        try {
          const shell = await caches.open(SHELL_CACHE);
          const offline = await shell.match("/offline");
          if (offline) return offline;
        } catch {
          /* fall through */
        }
        return new Response(
          "<!doctype html><title>Offline</title><h1>You are offline</h1><p>Reconnect and try again.</p>",
          { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
        );
      })(),
    );
    return;
  }

  /* ------------------------------------------------------------------ */
  /*  App shell assets (JS/CSS/fonts/icons) — cache-first + SWR          */
  /* ------------------------------------------------------------------ */
  if (isShellAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(req);
        if (cached) {
          // Revalidate in the background so offline always has the latest.
          event.waitUntil(
            (async () => {
              try {
                const res = await fetch(req);
                if (cacheableResponse(res)) {
                  await cache.put(req, res.clone());
                  await trimCache(SHELL_CACHE, SHELL_CACHE_LIMIT);
                }
              } catch {
                /* offline — keep what we have */
              }
            })(),
          );
          return cached;
        }
        try {
          const res = await fetch(req);
          if (cacheableResponse(res)) {
            event.waitUntil(
              cache
                .put(req, res.clone())
                .then(() => trimCache(SHELL_CACHE, SHELL_CACHE_LIMIT))
                .catch(() => {}),
            );
          }
          return res;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }

  /* ------------------------------------------------------------------ */
  /*  Images — stale-while-revalidate (unchanged behaviour)              */
  /* ------------------------------------------------------------------ */
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
    icon: (data && data.icon) || "/trendsmart-mark.png?v=16",
    badge: (data && data.badge) || "/trendsmart-mark.png?v=16",
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
