"use client";

import { useEffect } from "react";

/**
 * After a Vercel deploy, old clients can hit ChunkLoadError on client
 * navigations ("This page couldn't load"). Auto-reload once to pick up
 * the fresh build, and purge stale service-worker caches.
 */
export default function ChunkReloadGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const KEY = "tm_chunk_reload_v1";

    const isChunkError = (err: unknown): boolean => {
      const msg = String(
        err && typeof err === "object" && "message" in err
          ? (err as { message?: string }).message
          : err ?? "",
      );
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: string }).name)
          : "";
      return (
        name === "ChunkLoadError" ||
        /Loading chunk [\w-]+ failed/i.test(msg) ||
        /Failed to fetch dynamically imported module/i.test(msg) ||
        /Importing a module script failed/i.test(msg)
      );
    };

    const recover = async () => {
      try {
        if (sessionStorage.getItem(KEY) === "1") return;
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }

      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        /* still reload */
      }

      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      if (isChunkError(event.error) || isChunkError(event.message)) {
        void recover();
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkError(event.reason)) {
        void recover();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // Clear the one-shot flag after a healthy load settles
    const clearTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
    }, 12_000);

    return () => {
      window.clearTimeout(clearTimer);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
