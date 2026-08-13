"use client";

/**
 * Root error UI — replaces Next.js default "This page couldn't load".
 * Auto-reloads once on chunk/deployment mismatches.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
  const isChunk =
    /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      msg,
    );

  if (typeof window !== "undefined" && isChunk) {
    try {
      const key = "tm_global_chunk_reload_v1";
      if (sessionStorage.getItem(key) !== "1") {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
    } catch {
      /* fall through to UI */
    }
  }

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
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>TrendMart needs a refresh</h1>
          <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 14 }}>
            A new update may have shipped. Reload to continue shopping.
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem("tm_global_chunk_reload_v1");
              } catch {
                /* ignore */
              }
              reset();
              window.location.reload();
            }}
            style={{
              border: 0,
              borderRadius: 999,
              padding: "12px 20px",
              background: "#0f766e",
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
