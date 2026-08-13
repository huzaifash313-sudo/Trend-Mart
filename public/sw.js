/* TrendMart SW v41 — activate-only kill-switch.
   Does NOT intercept fetches (avoids breaking Next.js client navigations).
   Clears old caches from previous SW versions. */
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
