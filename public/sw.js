/* TrendMart SW v40 — network-first shell + purge stale caches after deploys */
const SW_VERSION = "tm-sw-v40";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SW_VERSION).then((cache) => cache.add(OFFLINE_URL).catch(() => undefined)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so deploys never serve a dead shell
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          const cache = await caches.open(SW_VERSION);
          const offline = await cache.match(OFFLINE_URL);
          return offline || Response.error();
        }
      })(),
    );
    return;
  }

  // Next.js build assets: network-first, fall back to cache if offline
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cached = await caches.match(req);
          return cached || Response.error();
        }
      })(),
    );
  }
});
