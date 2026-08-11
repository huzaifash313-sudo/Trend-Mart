"use client";

import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import { getPublicAppUrl } from "@/lib/appUrl";
import { getShopPath } from "@/lib/shopSlug";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Downloadable Shop QR Code Generator                           */
/* -------------------------------------------------------------------------- */

interface ShopQrCodeProps {
  shopId: string;
  shopName: string;
}

/** Display size (CSS). Download uses a larger offscreen canvas for print quality. */
const DISPLAY_SIZE = 180;
const DOWNLOAD_SIZE = 1024;

function slugifyFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "shop"
  );
}

async function buildQrDataUrl(
  url: string,
  size: number,
): Promise<string> {
  return QRCode.toDataURL(url, {
    width: size,
    margin: 2,
    color: { dark: "#065f46", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}

/** Compose a square PNG with QR + shop name footer for printing. */
async function buildDownloadPng(
  storeUrl: string,
  shopName: string,
): Promise<string> {
  const qrDataUrl = await buildQrDataUrl(storeUrl, DOWNLOAD_SIZE);
  const canvas = document.createElement("canvas");
  const pad = 48;
  const labelH = 96;
  canvas.width = DOWNLOAD_SIZE + pad * 2;
  canvas.height = DOWNLOAD_SIZE + pad * 2 + labelH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qrDataUrl;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("QR image load failed"));
    el.src = qrDataUrl;
  });

  ctx.drawImage(img, pad, pad, DOWNLOAD_SIZE, DOWNLOAD_SIZE);

  ctx.fillStyle = "#065f46";
  ctx.font = "600 36px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = shopName.trim() || "TrendMart Shop";
  ctx.fillText(
    label.length > 40 ? `${label.slice(0, 37)}…` : label,
    canvas.width / 2,
    pad + DOWNLOAD_SIZE + labelH / 2,
  );

  return canvas.toDataURL("image/png");
}

export default function ShopQrCode({ shopId, shopName }: ShopQrCodeProps) {
  const [storeUrl, setStoreUrl] = useState("");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [generating, setGenerating] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;

    async function generate() {
      setGenerating(true);
      setError(null);
      const url = `${getPublicAppUrl()}${getShopPath({ id: shopId, name: shopName })}`;
      setStoreUrl(url);
      try {
        const dataUrl = await buildQrDataUrl(url, DISPLAY_SIZE * 2);
        if (!cancelled) setPreviewSrc(dataUrl);
      } catch {
        if (!cancelled) {
          setPreviewSrc(null);
          setError("Couldn't generate the QR code. Please try again.");
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    }

    generate();
    return () => {
      cancelled = true;
    };
  }, [shopId, shopName]);

  const handleDownload = useCallback(async () => {
    if (!storeUrl || error) return;
    setDownloading(true);
    try {
      const png = await buildDownloadPng(storeUrl, shopName);
      const link = document.createElement("a");
      link.download = `trendmart-${slugifyFilename(shopName)}-qr.png`;
      link.href = png;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError("Download failed. Please try again.");
    }
    setDownloading(false);
  }, [storeUrl, shopName, error]);

  const handleCopyLink = useCallback(async () => {
    if (!storeUrl) return;
    try {
      await navigator.clipboard.writeText(storeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [storeUrl]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-emerald-900/40 dark:bg-[color:var(--tm-surface)]">
      <h3 className="font-semibold text-zinc-900 dark:text-emerald-300">Your Shop QR Code</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-emerald-700">
        Print this on a flex banner or counter stand. Customers who scan it land directly on your
        storefront.
      </p>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* Fixed square frame — img scales without stretching the QR modules */}
        <div
          className="flex shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-[color:var(--tm-border)]"
          style={{ width: DISPLAY_SIZE + 24, height: DISPLAY_SIZE + 24 }}
        >
          {generating && (
            <div
              className="animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"
              style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
            />
          )}
          {!generating && previewSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt={`QR code for ${shopName}`}
              width={DISPLAY_SIZE}
              height={DISPLAY_SIZE}
              className="block"
              style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE, objectFit: "contain" }}
              draggable={false}
            />
          )}
          {!generating && !previewSrc && !error && (
            <div
              className="flex items-center justify-center text-[0.65rem] text-zinc-400"
              style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
            >
              No QR
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2 self-stretch">
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          <label className="block text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-emerald-700">
            Store link
          </label>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 break-all dark:border-zinc-700 dark:bg-[color:var(--tm-elevated)] dark:text-emerald-400/90">
            {storeUrl || "Generating link…"}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleDownload}
              disabled={generating || downloading || !!error || !previewSrc}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {downloading ? "Preparing…" : "⬇ Download PNG"}
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              disabled={!storeUrl}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-emerald-300 dark:hover:bg-zinc-900"
            >
              {copied ? "✓ Copied!" : "🔗 Copy Link"}
            </button>
          </div>
          <p className="text-[0.65rem] text-zinc-400 dark:text-emerald-800">
            Download is a high-resolution square PNG (print-ready).
          </p>
        </div>
      </div>
    </div>
  );
}
