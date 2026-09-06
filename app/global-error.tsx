"use client";

import { useEffect } from "react";

/**
 * Root error UI. Side effects only in useEffect — never during render.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
    const isChunk =
      /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(
        msg,
      );
    if (!isChunk) return;
    try {
      const key = "tm_global_chunk_reload_v2";
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    } catch {
      /* show UI */
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 14 }}>
            Tap reload once — then try the page again.
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem("tm_global_chunk_reload_v2");
                sessionStorage.removeItem("tm_chunk_reload_v2");
              } catch {
                /* ignore */
              }
              reset();
              window.location.href = "/";
            }}
            style={{
              border: 0,
              borderRadius: 999,
              padding: "12px 20px",
              background: "var(--tm-sea-700, #6e2650)",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
