"use client";

import { useEffect } from "react";

/**
 * Recovers from stale deploy chunks once. Strict match only — never hijack
 * normal navigations.
 */
export default function ChunkReloadGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const KEY = "tm_chunk_reload_v2";

    const isChunkError = (err: unknown): boolean => {
      if (!err) return false;
      const name =
        typeof err === "object" && err && "name" in err
          ? String((err as { name?: string }).name)
          : "";
      const msg =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : String(err);
      return (
        name === "ChunkLoadError" ||
        /Loading chunk [\w.-]+ failed/i.test(msg) ||
        /Failed to fetch dynamically imported module/i.test(msg)
      );
    };

    const recover = () => {
      try {
        if (sessionStorage.getItem(KEY) === "1") return;
        sessionStorage.setItem(KEY, "1");
      } catch {
        return;
      }
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      if (isChunkError(event.error)) recover();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkError(event.reason)) recover();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const clearTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
    }, 15_000);

    return () => {
      window.clearTimeout(clearTimer);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
