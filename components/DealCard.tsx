"use client";

import { useMemo, useState, useCallback, type MouseEvent } from "react";
import Image from "next/image";
import {
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
 * ProductGrid twin: title → shop → price | ♡ Add Order.
 * No extra rows (Visit = shop tap). Order only on deal day.
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
  const whenTag = formatDealWhenTag(deal);
  const canOrderToday = isDealOrderableToday(deal);
  const product = useMemo(() => dealToProduct(deal), [deal]);
  const { hasDiscount, originalPrice, discountPercent } = getProductDiscount(product);
  const hasPrice = deal.price != null && Number.isFinite(Number(deal.price));

  // Ticker: delivery/coupons + when-tag once (no badge spam)
  const tickerTags = useMemo(() => {
    const tags: string[] = [];
    if (whenTag) tags.push(whenTag);
    for (const t of offerTags) {
      if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
    }
    return tags.slice(0, 4);
  }, [offerTags, whenTag]);

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

  const goStore = (e?: MouseEvent) => {
    if (e) stop(e);
    window.location.href = storeHref;
  };

  const handleAdd = (e: MouseEvent) => {
    stop(e);
    if (!hasPrice) {
      addToast("This deal needs a price — open the store or ask the merchant.", "info");
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
      addToast(`Order opens on ${whenTag}. Cart & wishlist still work.`, "info");
      return;
    }
    if (!hasPrice) {
      addToast("Deal needs a price — opening store…", "info");
      goStore();
      return;
    }
    if (!shopPick.whatsapp_number) {
      addToast("Store WhatsApp missing — opening store.", "info");
      goStore();
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

          {tickerTags.length > 0 ? <OfferTickerMarquee tags={tickerTags} /> : null}
        </div>

        {/* Equal-height body: spacer + fixed price slot so no-price cards match */}
        <div className="tm-product-body flex min-h-0 flex-1 flex-col gap-1">
          <h3
            className={`tm-product-title min-h-[2.45em] ${titleClass}`}
            title={deal.title}
          >
            {deal.title}
          </h3>

          <div className="flex min-h-[0.875rem] min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={goStore}
              className="flex min-w-0 flex-1 items-center gap-1 text-left"
              aria-label={`Visit ${deal.shop_name || "store"}`}
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
                  {(deal.shop_name || "?").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate text-[10px] font-medium leading-none text-emerald-700 dark:text-emerald-400 sm:text-[11px]">
                {deal.shop_name || "Store"}
              </span>
            </button>
          </div>

          <div className="tm-product-footer mt-auto flex items-end justify-between gap-1.5 pt-1">
            {/* Fixed-height price column — keeps cards aligned with/without price */}
            <div className="flex h-[2.35rem] min-w-0 flex-1 flex-col justify-end overflow-hidden">
              {hasPrice ? (
                <>
                  <p
                    className="whitespace-nowrap text-[12px] font-bold tabular-nums leading-none tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[13px]"
                    title={formatRupees(Number(deal.price))}
                  >
                    Rs {Number(deal.price).toLocaleString("en-PK")}
                  </p>
                  <div className="mt-0.5 flex h-[0.95rem] items-center gap-1 overflow-hidden whitespace-nowrap">
                    {hasDiscount && originalPrice != null ? (
                      <>
                        <span className="text-[10px] leading-none text-zinc-400 line-through tabular-nums">
                          Rs {originalPrice.toLocaleString("en-PK")}
                        </span>
                        {discountPercent > 0 ? (
                          <span className="rounded bg-rose-50 px-1 py-px text-[9px] font-bold leading-none text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                            {discountPercent}% OFF
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </>
              ) : (
                <p
                  className="whitespace-nowrap text-[11px] font-semibold leading-none text-zinc-500 dark:text-zinc-400"
                  title={whenTag}
                >
                  {whenTag}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-0 pb-px">
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
              <button
                type="button"
                onClick={handleOrder}
                disabled={!canOrderToday}
                title={canOrderToday ? "Order via WhatsApp" : `Order on ${whenTag}`}
                className={`shrink-0 px-0.5 text-[11px] font-bold leading-none transition ${
                  canOrderToday
                    ? "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    : "cursor-not-allowed text-zinc-300 dark:text-zinc-600"
                }`}
                aria-label={canOrderToday ? "Order now" : `Order only on ${whenTag}`}
              >
                Order
              </button>
            </div>
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
