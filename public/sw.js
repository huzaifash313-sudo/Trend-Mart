/* -------------------------------------------------------------------------- */
/*  TrendMart — Service Worker                                                */
/*  Provides installability ("Add to Home Screen") and basic offline          */
/*  resilience: caches the app shell + recently viewed pages, and serves an   */
/*  offline fallback page when navigation fails with no network.              */
/* -------------------------------------------------------------------------- */

const CACHE_VERSION = "trendmart-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = "/offline";

const APP_SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

// ── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .catch(() => {
        /* Pre-caching is best-effort — a slow/offline install shouldn't fail */
      }),
  );
  self.skipWaiting();
});

// ── Activate: clean up old cache versions ───────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("trendmart-") && key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// ── Fetch: network-first for navigations (with offline fallback),           ──
// ── stale-while-revalidate for same-origin static assets. Never intercepts  ──
// ── Supabase/API/cross-origin requests — those must always hit the network. ──
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let Supabase/API calls pass through untouched
  if (url.pathname.startsWith("/api/")) return;

  // Page navigations: try the network, fall back to cache, then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached ?? (await caches.match(OFFLINE_URL));
        }),
    );
    return;
  }

  // Static assets (images, fonts, icons): stale-while-revalidate.
  if (["image", "font", "style", "script"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached ?? networkFetch;
      }),
    );
  }
});
