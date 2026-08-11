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
  /** Home shelf: shorter image + tighter body. Deals grid stays `default`. */
  density?: "default" | "home";
  priority?: boolean;
  className?: string;
  shopWhatsapp?: string | null;
  /** Open quick-view / photo modal (card body click). */
  onOpen?: () => void;
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

function formatDealPrice(n: number): string {
  return `Rs ${Math.round(n).toLocaleString("en-PK")}`;
}

/**
 * Product-style deal card. Price is always full-width (never clipped by buttons).
 * Actions sit on their own row. Equal height via stretch + fixed slots.
 */
export default function DealCard({
  deal,
  href,
  offerTags = [],
  compact = false,
  density = "default",
  priority = false,
  className = "",
  shopWhatsapp,
  onOpen,
}: DealCardProps) {
  const isHomeDensity = density === "home";
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

  const tickerTags = useMemo(() => {
    const tags: string[] = [];
    if (whenTag) tags.push(whenTag);
    for (const t of offerTags) {
      if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
    }
    return tags.slice(0, 3);
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
  const priceLabel = hasPrice ? formatDealPrice(Number(deal.price)) : null;

  const checkoutModal = checkoutOpen ? (
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
  ) : null;

  /* ── Home: horizontal compact spotlight (short height, readable type) ── */
  if (isHomeDensity) {
    return (
      <>
        <article
          className={`tm-home-deal-card group relative flex w-full overflow-hidden ${
            onOpen ? "cursor-pointer" : ""
          } ${className}`}
          onClick={() => onOpen?.()}
          onKeyDown={(e) => {
            if (!onOpen) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen();
            }
          }}
          role={onOpen ? "button" : undefined}
          tabIndex={onOpen ? 0 : undefined}
          aria-label={onOpen ? `View ${deal.title}` : undefined}
        >
          <div className="relative h-[7.25rem] w-[7.25rem] shrink-0 overflow-hidden sm:h-[8.5rem] sm:w-[8.5rem] md:h-[9.5rem] md:w-[9.5rem] lg:h-[10.25rem] lg:w-[10.25rem]">
            {showPhoto && safeSrc ? (
              <Image
                src={safeSrc}
                alt={deal.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                sizes="(max-width: 640px) 7.25rem, (max-width: 768px) 8.5rem, 10rem"
                priority={priority}
                loading={priority ? "eager" : "lazy"}
                quality={78}
                unoptimized={/\.supabase\.(co|in)\//i.test(safeSrc)}
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="tm-product-placeholder flex h-full w-full items-center justify-center">
                <span className="select-none text-2xl font-bold text-teal-700/40 dark:text-teal-300/35">
                  {deal.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <span className="absolute left-1.5 top-1.5 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white shadow-sm">
              Deal
            </span>
            {hasDiscount && discountPercent > 0 ? (
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm sm:text-[11px]">
                {discountPercent}% OFF
              </span>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 p-2.5 sm:gap-2 sm:p-3 md:p-3.5">
            <div className="min-w-0 space-y-1">
              <h3
                className="line-clamp-2 text-[0.9rem] font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-base md:text-[1.05rem]"
                title={deal.title}
              >
                {deal.title}
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  goStore();
                }}
                className="flex min-w-0 max-w-full items-center gap-1.5 text-left"
                aria-label={`Visit ${deal.shop_name || "store"}`}
              >
                {deal.shop_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getSafeImageUrl(deal.shop_logo_url, "shop")}
                    alt=""
                    className="h-4 w-4 shrink-0 rounded-full object-cover sm:h-[1.125rem] sm:w-[1.125rem]"
                  />
                ) : (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[8px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {(deal.shop_name || "?").charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate text-xs font-medium text-emerald-700 dark:text-emerald-400 sm:text-[0.8125rem]">
                  {deal.shop_name || "Store"}
                </span>
              </button>
              {tickerTags[0] ? (
                <p className="truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:text-xs">
                  {tickerTags[0]}
                </p>
              ) : null}
            </div>

            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                {hasPrice && priceLabel ? (
                  <>
                    <p className="text-base font-bold leading-none tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50 sm:text-lg md:text-[1.2rem]">
                      {priceLabel}
                    </p>
                    {hasDiscount && originalPrice != null ? (
                      <span className="mt-0.5 inline-block text-xs text-zinc-400 line-through tabular-nums sm:text-[0.8125rem]">
                        {formatDealPrice(originalPrice)}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm font-semibold text-zinc-500">{whenTag}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={handleWishlist}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
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
                  className="tm-product-add-text text-[0.8125rem] sm:text-sm"
                  aria-label={`Add ${deal.title} to cart`}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={handleOrder}
                  disabled={!canOrderToday}
                  title={canOrderToday ? "Order via WhatsApp" : `Order on ${whenTag}`}
                  className={`rounded-full px-2.5 py-1 text-[0.8125rem] font-bold transition sm:px-3 sm:text-sm ${
                    canOrderToday
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                  }`}
                  aria-label={canOrderToday ? "Order now" : `Order only on ${whenTag}`}
                >
                  Order
                </button>
              </div>
            </div>
          </div>
        </article>
        {checkoutModal}
      </>
    );
  }

  return (
    <>
      <article
        className={`tm-product-card group relative flex h-full w-full flex-col overflow-hidden ${
          onOpen ? "cursor-pointer" : ""
        } ${className}`}
        onClick={() => onOpen?.()}
        onKeyDown={(e) => {
          if (!onOpen) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        aria-label={onOpen ? `View ${deal.title}` : undefined}
      >
        <div
          className="tm-product-media relative shrink-0 overflow-hidden"
          onClick={(e) => {
            if (!onOpen) return;
            e.stopPropagation();
            onOpen();
          }}
        >
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

        <div className="tm-product-body flex min-h-0 flex-1 flex-col gap-1">
          <h3 className={`tm-product-title min-h-[2.45em] ${titleClass}`} title={deal.title}>
            {deal.title}
          </h3>

          <button
            type="button"
            onClick={(e) => {
              stop(e);
              goStore();
            }}
            className="flex min-h-[0.875rem] min-w-0 items-center gap-1 text-left"
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

          <div className="mt-auto flex min-h-[2.4rem] flex-col justify-end gap-0.5 pt-1">
            {hasPrice && priceLabel ? (
              <>
                <p
                  className="text-[13px] font-bold leading-none tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50 sm:text-sm"
                  title={formatRupees(Number(deal.price))}
                >
                  {priceLabel}
                </p>
                <div className="flex min-h-[0.95rem] flex-wrap items-center gap-x-1 gap-y-0.5">
                  {hasDiscount && originalPrice != null ? (
                    <>
                      <span className="text-[10px] leading-none text-zinc-400 line-through tabular-nums">
                        {formatDealPrice(originalPrice)}
                      </span>
                      {discountPercent > 0 ? (
                        <span className="rounded bg-rose-50 px-1 py-px text-[9px] font-bold leading-none text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                          {discountPercent}% OFF
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-[10px] leading-none text-zinc-400">{whenTag}</span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-[12px] font-semibold leading-snug text-zinc-500 dark:text-zinc-400">
                {whenTag}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-1 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
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
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleAdd}
                className="tm-product-add-text"
                aria-label={`Add ${deal.title} to cart`}
              >
                Add
              </button>
              <button
                type="button"
                onClick={handleOrder}
                disabled={!canOrderToday}
                title={canOrderToday ? "Order via WhatsApp" : `Order on ${whenTag}`}
                className={`text-[12px] font-bold leading-none transition ${
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
      {checkoutModal}
    </>
  );
}
