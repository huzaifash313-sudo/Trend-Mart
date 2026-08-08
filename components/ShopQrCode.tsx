"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Downloadable Shop QR Code Generator                           */
/*  Renders a scannable QR code that deep-links to the merchant's public      */
/*  storefront, with a one-click PNG download for printing (flex/counter).    */
/* -------------------------------------------------------------------------- */

interface ShopQrCodeProps {
  shopId: string;
  shopName: string;
}

function slugifyFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "shop"
  );
}

export default function ShopQrCode({ shopId, shopName }: ShopQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [storeUrl, setStoreUrl] = useState<string>("");
  const [generating, setGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !shopId) return;
    const origin = window.location.origin;
    const url = `${origin}/shop/${shopId}`;
    setStoreUrl(url);

    const canvas = canvasRef.current;
    if (!canvas) return;

    setGenerating(true);
    QRCode.toCanvas(canvas, url, {
      width: 288,
      margin: 2,
      color: { dark: "#065f46", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then(() => setError(null))
      .catch(() => setError("Couldn't generate the QR code. Please try again."))
      .finally(() => setGenerating(false));
  }, [shopId]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `trendmart-${slugifyFilename(shopName)}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [shopName]);

  const handleCopyLink = useCallback(async () => {
    if (!storeUrl) return;
    try {
      await navigator.clipboard.writeText(storeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  }, [storeUrl]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Your Shop QR Code</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Print this on a flex banner or counter stand. Customers who scan it land directly on your
        storefront.
      </p>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="flex h-[160px] w-[160px] shrink-0 items-center justify-center rounded-xl border border-zinc-100 bg-white p-2 dark:border-zinc-800">
          {generating && (
            <div className="h-full w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          )}
          <canvas ref={canvasRef} className={`h-full w-full ${generating ? "hidden" : ""}`} />
        </div>

        <div className="flex-1 space-y-2">
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 break-all dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
            {storeUrl || "Generating link…"}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={generating || !!error}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              ⬇ Download PNG
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              disabled={!storeUrl}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {copied ? "✓ Copied!" : "🔗 Copy Link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
