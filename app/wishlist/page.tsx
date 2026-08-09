"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { FavoriteItem } from "@/services/wishlistService";
import {
  getAllFavorites,
  removeFavorite,
} from "@/services/wishlistService";
import { logError } from "@/services/errorService";

/* -------------------------------------------------------------------------- */
/*  Inline Icons                                                              */
/* -------------------------------------------------------------------------- */

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line y1="12" x2="12" y2="21" x1="12" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function EmptyHeartIcon() {
  return (
    <svg className="h-10 w-10 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

type WishlistTab = "shops" | "products";

function showToast(message: string, type: "info" | "error" = "info"): void {
  try {
    window.dispatchEvent(
      new CustomEvent("trendmart:toast", {
        detail: { type, message, duration: 3000 },
      }),
    );
  } catch {
    /* no-op */
  }
}

function buildWhatsAppCheckoutMessage(item: FavoriteItem): string {
  const lines: string[] = [];
  lines.push(`Hi! I'm interested in *${item.name}* from your TrendMart store.`);
  if (item.shopName) lines.push(`\nI found this item in *${item.shopName}*.`);
  lines.push(`\nCan you share more details (price, availability, delivery)?`);
  lines.push(`\nItem ID: ${item.id}`);
  return lines.join("\n");
}

function openWhatsAppCheckout(item: FavoriteItem, shopWhatsapp?: string): void {
  const message = encodeURIComponent(buildWhatsAppCheckoutMessage(item));
  if (shopWhatsapp) {
    const clean = shopWhatsapp.replace(/[^+0-9]/g, "");
    window.open(`https://wa.me/${clean}?text=${message}`, "_blank", "noopener,noreferrer");
  } else {
    window.location.href = item.shopId
      ? `/shop/${item.shopId}`
      : `/search?q=${encodeURIComponent(item.name)}`;
  }
}

function WishlistCard({
  item,
  onRemove,
}: {
  item: FavoriteItem;
  onRemove: (id: string) => void;
}) {
  const href =
    item.type === "shop"
      ? `/shop/${item.id}`
      : item.shopId
        ? `/shop/${item.shopId}`
        : `/search?q=${encodeURIComponent(item.name)}`;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-800 dark:to-emerald-700">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {item.type === "shop" ? <ShopIcon /> : <PackageIcon />}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block truncate text-sm font-semibold text-zinc-900 hover:text-emerald-600 dark:text-zinc-100 dark:hover:text-emerald-400"
        >
          {item.name}
        </Link>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Saved {new Date(item.addedAt).toLocaleDateString()}
          {item.type === "product" && item.shopName ? <> · {item.shopName}</> : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {item.type === "product" && (
          <button
            type="button"
            onClick={() => openWhatsAppCheckout(item)}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
            aria-label={`Ask about ${item.name} on WhatsApp`}
            title="Ask about this item on WhatsApp"
          >
            <WhatsAppIcon />
          </button>
        )}
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

export default function WishlistPage() {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<WishlistTab>("shops");

  const shops = useMemo(() => items.filter((i) => i.type === "shop"), [items]);
  const products = useMemo(() => items.filter((i) => i.type === "product"), [items]);
  const visible = tab === "shops" ? shops : products;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const all = await getAllFavorites();
        if (cancelled) return;
        setItems(all);
        const shopCount = all.filter((i) => i.type === "shop").length;
        const productCount = all.filter((i) => i.type === "product").length;
        // Prefer the tab that has items; products first when both exist
        if (productCount > 0 && shopCount === 0) setTab("products");
        else if (shopCount > 0 && productCount === 0) setTab("shops");
        else if (productCount > 0) setTab("products");
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
    const item = items.find((f) => f.id === id);
    try {
      await removeFavorite(id);
      setItems((prev) => prev.filter((f) => f.id !== id));
      if (item) showToast(`"${item.name}" removed from wishlist.`, "info");
    } catch {
      showToast("Failed to remove item. Please try again.", "error");
    }
  }, [items]);

  const handleClearTab = useCallback(async () => {
    const label = tab === "shops" ? "shops" : "products";
    if (!confirm(`Clear all saved ${label} from your wishlist?`)) return;
    try {
      await Promise.all(visible.map((item) => removeFavorite(item.id)));
      setItems((prev) => prev.filter((f) => f.type !== (tab === "shops" ? "shop" : "product")));
      showToast(`${label[0]!.toUpperCase()}${label.slice(1)} cleared from wishlist.`, "info");
    } catch {
      showToast("Failed to clear wishlist. Please try again.", "error");
    }
  }, [tab, visible]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-[color:var(--tm-bg)]">
        <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/90">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <Link href="/" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="Go back">
              <ChevronLeftIcon />
            </Link>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">My Wishlist</h1>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  const totalEmpty = items.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-[color:var(--tm-bg)]">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="Go back">
              <ChevronLeftIcon />
            </Link>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">My Wishlist</h1>
          </div>
          {visible.length > 0 && (
            <button
              type="button"
              onClick={handleClearTab}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Clear {tab === "shops" ? "shops" : "products"}
            </button>
          )}
        </div>

        {/* Shops | Products tabs */}
        {!totalEmpty && (
          <div className="mx-auto flex max-w-3xl gap-2 px-4 pb-3">
            <button
              type="button"
              onClick={() => setTab("shops")}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                tab === "shops"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              <ShopIcon />
              Shops
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === "shops" ? "bg-white/20" : "bg-zinc-200 dark:bg-zinc-700"}`}>
                {shops.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab("products")}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                tab === "products"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              <PackageIcon />
              Products
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === "products" ? "bg-white/20" : "bg-zinc-200 dark:bg-zinc-700"}`}>
                {products.length}
              </span>
            </button>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        {totalEmpty && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <EmptyHeartIcon />
            </div>
            <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Your wishlist is empty
            </h2>
            <p className="mb-6 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
              Tap the heart on any shop or product. You can save whole stores and individual products — then view them separately here.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
                Browse shops
              </Link>
              <Link href="/search" className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                Search products
              </Link>
            </div>
          </div>
        )}

        {!totalEmpty && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              No {tab === "shops" ? "shops" : "products"} saved
            </h2>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              {tab === "shops"
                ? "Heart a store on the homepage to save it here."
                : "Open a shop and tap the heart on any product you like."}
            </p>
            <button
              type="button"
              onClick={() => setTab(tab === "shops" ? "products" : "shops")}
              className="text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              View {tab === "shops" ? "products" : "shops"} instead
            </button>
          </div>
        )}

        {!totalEmpty && visible.length > 0 && (
          <>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              {visible.length} {tab === "shops" ? "shop" : "product"}
              {visible.length !== 1 ? "s" : ""} saved
              {tab === "products" ? (
                <>
                  {" "}
                  —{" "}
                  <span className="text-emerald-600 dark:text-emerald-400">
                    heart products in a shop; cart is separate
                  </span>
                </>
              ) : null}
            </p>
            <div className="space-y-3">
              {visible.map((item) => (
                <WishlistCard
                  key={item.wishlistRowId ?? `${item.type}-${item.id}`}
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
