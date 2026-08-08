"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { FavoriteItem } from "@/services/wishlistService";
import {
  getAllFavorites,
  removeFavorite,
  clearAllFavorites,
} from "@/services/wishlistService";
import { logError } from "@/services/errorService";

/* -------------------------------------------------------------------------- */
/*  Inline Icons                                                              */
/* -------------------------------------------------------------------------- */

function TrashIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line y1="12" x2="12" y2="21" x1="12" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      className="h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function EmptyHeartIcon() {
  return (
    <svg
      className="h-10 w-10 text-zinc-300 dark:text-zinc-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toast helper (lightweight inline)                                         */
/* -------------------------------------------------------------------------- */

function showToast(message: string, type: "info" | "error" = "info"): void {
  try {
    window.dispatchEvent(
      new CustomEvent("trendmart:toast", {
        detail: { type, message, duration: 3000 },
      }),
    );
  } catch {
    // No-op
  }
}

/* -------------------------------------------------------------------------- */
/*  WhatsApp Checkout Handler                                                 */
/* -------------------------------------------------------------------------- */

function buildWhatsAppCheckoutMessage(item: FavoriteItem): string {
  const lines: string[] = [];
  lines.push(`Hi! I'm interested in *${item.name}* from your TrendMart store.`);

  if (item.shopName) {
    lines.push(`\nI found this item in *${item.shopName}*.`);
  }

  lines.push(`\nCan you share more details (price, availability, delivery)?`);
  lines.push(`\nItem ID: ${item.id}`);

  return lines.join("\n");
}

function openWhatsAppCheckout(item: FavoriteItem, shopWhatsapp?: string): void {
  const message = encodeURIComponent(buildWhatsAppCheckoutMessage(item));

  // If we have a known WhatsApp number from the shop, use it.
  // Otherwise, open the app chooser / web version.
  if (shopWhatsapp) {
    const clean = shopWhatsapp.replace(/[^+0-9]/g, "");
    const url = `https://wa.me/${clean}?text=${message}`;
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    // Deep-link to the shop page where the customer can find the WhatsApp button
    const shopUrl = item.shopId
      ? `/shop/${item.shopId}`
      : `/search?q=${encodeURIComponent(item.name)}`;
    window.location.href = shopUrl;
  }
}

/* -------------------------------------------------------------------------- */
/*  Favorite Card Component                                                   */
/* -------------------------------------------------------------------------- */

function FavoriteCard({
  item,
  onRemove,
  shopWhatsapp,
}: {
  item: FavoriteItem;
  onRemove: (id: string) => void;
  shopWhatsapp?: string;
}) {
  const href =
    item.type === "shop"
      ? `/shop/${item.id}`
      : item.shopId
        ? `/shop/${item.shopId}`
        : `/search?q=${encodeURIComponent(item.name)}`;
  const typeLabel = item.type === "shop" ? "Shop" : "Product";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      {/* Thumbnail */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-800 dark:to-emerald-700">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className="h-full w-full rounded-xl object-cover"
          />
        ) : (
          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {item.type === "shop" ? <ShopIcon /> : <PackageIcon />}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block truncate text-sm font-semibold text-zinc-900 hover:text-emerald-600 dark:text-zinc-100 dark:hover:text-emerald-400"
        >
          {item.name}
        </Link>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {typeLabel} · Saved {new Date(item.addedAt).toLocaleDateString()}
          {item.shopName && <> · {item.shopName}</>}
        </p>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {/* WhatsApp checkout button (only for products) */}
        {item.type === "product" && (
          <button
            type="button"
            onClick={() => openWhatsAppCheckout(item, shopWhatsapp)}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
            aria-label={`Ask about ${item.name} on WhatsApp`}
            title="Ask about this item on WhatsApp"
          >
            <WhatsAppIcon />
          </button>
        )}

        {/* Remove button */}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          aria-label={`Remove ${item.name} from wishlist`}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Wishlist Page                                                        */
/* -------------------------------------------------------------------------- */

export default function WishlistPage() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const items = await getAllFavorites();
        if (!cancelled) setFavorites(items);
      } catch (err) {
        logError(err, { module: "WishlistPage.load" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRemove = useCallback(async (id: string) => {
    const item = favorites.find((f) => f.id === id);
    try {
      await removeFavorite(id);
      setFavorites((prev) => prev.filter((f) => f.id !== id));
      if (item) showToast(`"${item.name}" removed from wishlist.`, "info");
    } catch {
      showToast("Failed to remove item. Please try again.", "error");
    }
  }, [favorites]);

  const handleClearAll = useCallback(async () => {
    if (!confirm("Clear your entire wishlist?")) return;
    try {
      await clearAllFavorites();
      setFavorites([]);
      showToast("Wishlist cleared.", "info");
    } catch {
      showToast("Failed to clear wishlist. Please try again.", "error");
    }
  }, []);

  /* ── Loading skeleton ──────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
        <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <Link
              href="/"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              aria-label="Go back"
            >
              <ChevronLeftIcon />
            </Link>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              My Wishlist
            </h1>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                  <div className="h-8 w-8 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  /* ── Main render ───────────────────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              aria-label="Go back"
            >
              <ChevronLeftIcon />
            </Link>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              My Wishlist
            </h1>
          </div>
          {favorites.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Clear All
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        {/* Empty State */}
        {favorites.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <EmptyHeartIcon />
            </div>
            <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Your wishlist is empty
            </h2>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
              Tap the heart icon on any shop or product to add it to your wishlist.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Browse Shops
            </Link>
          </div>
        )}

        {/* Wishlist items */}
        {favorites.length > 0 && (
          <>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              {favorites.length} item{favorites.length !== 1 && "s"} saved
              —{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                Tap the WhatsApp icon to ask about a product directly
              </span>
            </p>
            <div className="space-y-3">
              {favorites.map((item) => (
                <FavoriteCard
                  key={item.wishlistRowId ?? item.id}
                  item={item}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}