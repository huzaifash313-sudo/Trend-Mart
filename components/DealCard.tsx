"use client";

import { useMemo, useState, useCallback, type MouseEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  formatDealSchedule,
  formatDealWhenTag,
  isDealOrderableToday,
  type ShopDeal,
} from "@/lib/dealSchedule";
import { getDealImages } from "@/lib/productImages";
import { getSafeImageUrl, isFallbackUrl } from "@/services/storageService";
import { getShopPath } from "@/lib/shopSlug";
import { OfferTickerMarquee } from "@/components/ProductGrid";
import { formatRupees, getProductDiscount } from "@/lib/formatters";
import { useCart } from "@/context/CartContext";
import { toggleFavorite } from "@/services/wishlistService";
import type { Product, Shop } from "@/types";
import WhatsAppCheckoutModal, {
  type WhatsAppCartItem,
} from "@/components/WhatsAppCheckoutModal";
import { useToast } from "@/components/Toast";

interface DealCardProps {
  deal: ShopDeal;
  href?: string;
  offerTags?: string[];
  /** Slightly tighter type — parent sets width (same as product cells). */
  compact?: boolean;
  priority?: boolean;
  className?: string;
  shopWhatsapp?: string | null;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function dealToProduct(deal: ShopDeal): Product {
  const cover = getDealImages(deal)[0] ?? deal.image_url ?? null;
  const price = deal.price != null && Number.isFinite(deal.price) ? Number(deal.price) : 0;
  return {
    id: deal.product_id || `deal-${deal.id}`,
    shop_id: deal.shop_id,
    name: deal.title,
    title: deal.title,
    description: deal.description ?? "",
    price,
    original_price: deal.original_price ?? null,
    compare_at_price: deal.original_price ?? null,
    image_url: cover,
    images: getDealImages(deal),
    is_available: true,
    currency: "PKR",
    created_at: deal.created_at,
  } as Product;
}

/**
 * Same chrome as ProductGrid cards (tm-product-*). Parent grid/strip owns width.
 * Cart + wishlist anytime; WhatsApp Order only on the deal day.
 */
export default function DealCard({
  deal,
  href,
  offerTags = [],
  compact = false,
  priority = false,
  className = "",
  shopWhatsapp,
}: DealCardProps) {
  const { addItem } = useCart();
  const { addToast } = useToast();
  const gallery = useMemo(() => getDealImages(deal), [deal]);
  const [imgIndex, setImgIndex] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const activeUrl = gallery[Math.min(imgIndex, Math.max(gallery.length - 1, 0))] ?? null;
  const safeSrc =
    activeUrl && !imgError ? getSafeImageUrl(activeUrl, "product") : null;
  const showPhoto = Boolean(safeSrc && !isFallbackUrl(safeSrc));

  const shopHref = getShopPath({
    id: deal.shop_id,
    name: deal.shop_name || "Store",
    slug: deal.shop_slug,
  });
  const storeHref = href ?? `${shopHref}#deals`;
  const badge = (deal.badge_text || "").trim() || null;
  const whenTag = formatDealWhenTag(deal);
  const schedule = formatDealSchedule(deal);
  const canOrderToday = isDealOrderableToday(deal);
  const product = useMemo(() => dealToProduct(deal), [deal]);
  const { hasDiscount, originalPrice, discountPercent } = getProductDiscount(product);
  const hasPrice = deal.price != null && Number.isFinite(Number(deal.price));

  const tickerTags = useMemo(() => {
    const tags = [...offerTags];
    if (whenTag && !tags.some((t) => t.toLowerCase() === whenTag.toLowerCase())) {
      tags.unshift(whenTag);
    }
    if (badge) {
      const line = `${badge} · ${whenTag}`;
      if (!tags.some((t) => t.toLowerCase() === line.toLowerCase())) {
        tags.unshift(line.length > 32 ? `${line.slice(0, 30)}…` : line);
      }
    }
    return tags;
  }, [offerTags, badge, whenTag]);

  const shopPick: Pick<Shop, "id" | "name" | "whatsapp_number"> = {
    id: deal.shop_id,
    name: deal.shop_name || "Store",
    whatsapp_number: shopWhatsapp || deal.shop_whatsapp || "",
  };

  const cycleImage = useCallback(
    (e: MouseEvent, dir: 1 | -1) => {
      e.preventDefault();
      e.stopPropagation();
      if (gallery.length < 2) return;
      setImgError(false);
      setImgIndex((i) => (i + dir + gallery.length) % gallery.length);
    },
    [gallery.length],
  );

  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleAdd = (e: MouseEvent) => {
    stop(e);
    if (!hasPrice) {
      addToast("This deal needs a price — visit the store or ask the merchant.", "info");
      return;
    }
    addItem(product, shopPick, 1);
    addToast("Added to cart", "success");
  };

  const handleWishlist = async (e: MouseEvent) => {
    stop(e);
    const id = deal.product_id || deal.id;
    const nowFav = await toggleFavorite(
      id,
      "product",
      deal.title,
      gallery[0] ?? undefined,
      deal.shop_id,
      deal.shop_name ?? undefined,
    );
    setFavorited(nowFav);
    addToast(nowFav ? "Saved to wishlist" : "Removed from wishlist", "success");
    window.dispatchEvent(new Event("favoritesUpdated"));
  };

  const handleOrder = (e: MouseEvent) => {
    stop(e);
    if (!canOrderToday) {
      addToast(`Order opens on deal day (${whenTag}). You can still add to cart or wishlist.`, "info");
      return;
    }
    if (!hasPrice) {
      addToast("Set a deal price to order. Opening store…", "info");
      window.location.href = storeHref;
      return;
    }
    if (!shopPick.whatsapp_number) {
      addToast("Store WhatsApp missing — opening store page.", "info");
      window.location.href = storeHref;
      return;
    }
    setCheckoutOpen(true);
  };

  const checkoutItems: WhatsAppCartItem[] = [
    {
      id: product.id,
      productId: product.id,
      shopId: deal.shop_id,
      name: deal.title,
      price: Number(deal.price),
      imageUrl: gallery[0] ?? null,
      quantity: 1,
      originalPrice: deal.original_price ?? undefined,
      currency: "PKR",
    },
  ];

  const priceClass = compact
    ? "text-[13px] sm:text-sm"
    : "text-sm sm:text-[15px]";
  const titleClass = compact ? "text-[12px] sm:text-[13px]" : "text-[13px] sm:text-sm";

  return (
    <>
      <article
        className={`tm-product-card group relative flex h-full w-full flex-col overflow-hidden ${className}`}
      >
        <div className="tm-product-media relative shrink-0 overflow-hidden">
          {showPhoto && safeSrc ? (
            <Image
              src={safeSrc}
              alt={deal.title}
              fill
              className="object-contain transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              quality={75}
              unoptimized={/\.supabase\.(co|in)\//i.test(safeSrc)}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="tm-product-placeholder flex h-full w-full items-center justify-center">
              <span className="select-none text-2xl font-semibold tracking-tight text-teal-700/35 dark:text-teal-300/30 sm:text-3xl">
                {deal.title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <span className="absolute left-1.5 top-1.5 z-10 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white shadow-sm">
            Deal
          </span>

          {hasDiscount && discountPercent > 0 ? (
            <span className="absolute right-1.5 top-1.5 z-10 rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm">
              {discountPercent}% OFF
            </span>
          ) : null}

          {gallery.length > 1 ? (
            <span className="absolute bottom-7 right-1.5 z-10 rounded bg-zinc-950/75 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              {Math.min(imgIndex, gallery.length - 1) + 1}/{gallery.length}
            </span>
          ) : null}

          {gallery.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => cycleImage(e, -1)}
                className="absolute left-1 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-950/55 text-white opacity-0 transition group-hover:flex group-hover:opacity-100"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => cycleImage(e, 1)}
                className="absolute right-1 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-950/55 text-white opacity-0 transition group-hover:flex group-hover:opacity-100"
              >
                ›
              </button>
            </>
          ) : null}

          <OfferTickerMarquee tags={tickerTags} />
        </div>

        <div className="tm-product-body flex min-h-0 flex-1 flex-col gap-0.5">
          <h3 className={`tm-product-title ${titleClass}`} title={deal.title}>
            {deal.title}
          </h3>

          {deal.shop_name ? (
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                window.location.href = storeHref;
              }}
              className="flex min-w-0 items-center gap-1 text-left"
            >
              {deal.shop_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getSafeImageUrl(deal.shop_logo_url, "shop")}
                  alt=""
                  className="h-3 w-3 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[7px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {deal.shop_name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate text-[10px] font-medium leading-none text-emerald-700 dark:text-emerald-400 sm:text-[11px]">
                {deal.shop_name}
              </span>
            </button>
          ) : null}

          <p className="truncate text-[10px] leading-none text-zinc-400 sm:text-[11px]" title={schedule}>
            {whenTag}
          </p>

          {/* Same footer pattern as ProductGrid */}
          <div className="tm-product-footer mt-auto flex items-end justify-between gap-1.5 pt-1">
            <div className="min-w-0 flex-1">
              {hasPrice ? (
                <>
                  <p
                    className={`font-bold tabular-nums leading-none tracking-tight text-zinc-900 dark:text-zinc-50 ${priceClass}`}
                  >
                    {formatRupees(Number(deal.price))}
                  </p>
                  {hasDiscount && originalPrice != null ? (
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
                      <span className="text-[10px] leading-none text-zinc-400 line-through tabular-nums sm:text-[11px]">
                        {formatRupees(originalPrice)}
                      </span>
                      {discountPercent > 0 ? (
                        <span className="rounded bg-rose-50 px-1 py-px text-[9px] font-bold leading-none text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                          {discountPercent}% OFF
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{whenTag}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-0.5 pb-px">
              <button
                type="button"
                onClick={handleWishlist}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  favorited
                    ? "text-rose-500"
                    : "text-zinc-400 hover:text-rose-500 dark:text-zinc-500"
                }`}
                aria-label="Wishlist"
              >
                <HeartIcon filled={favorited} />
              </button>
              <button
                type="button"
                onClick={handleAdd}
                className="tm-product-add-text shrink-0 px-0.5"
                aria-label={`Add ${deal.title} to cart`}
              >
                Add
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleOrder}
              disabled={!canOrderToday}
              title={canOrderToday ? "Order today via WhatsApp" : `Order only on ${whenTag}`}
              className={`text-[11px] font-semibold transition ${
                canOrderToday
                  ? "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                  : "cursor-not-allowed text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {canOrderToday ? "Order" : "Order on day"}
            </button>
            <Link
              href={storeHref}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
            >
              Visit
            </Link>
          </div>
        </div>
      </article>

      {checkoutOpen ? (
        <WhatsAppCheckoutModal
          items={checkoutItems}
          shop={
            {
              id: deal.shop_id,
              name: deal.shop_name || "Store",
              whatsapp_number: shopPick.whatsapp_number,
              location: "",
            } as Shop
          }
          onClose={() => setCheckoutOpen(false)}
          onOrderPlaced={() => setCheckoutOpen(false)}
        />
      ) : null}
    </>
  );
}
