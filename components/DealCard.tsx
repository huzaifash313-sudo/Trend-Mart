"use client";

import { useMemo, useState, useCallback, useEffect, memo, type MouseEvent } from "react";
import dynamic from "next/dynamic";
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
import { toggleFavorite, isFavorited } from "@/services/wishlistService";
import { fetchShopById } from "@/services/shopService";
import {
  dealToProduct,
  dealToShop,
  dealWishlistId,
  dealHasPrice,
  dealToCheckoutItems,
} from "@/lib/dealCommerce";
import type { Shop } from "@/types";
import { useToast } from "@/components/Toast";
import { trackProductView } from "@/lib/behavior";

// Re-exported so existing call sites (`/deals`) keep a stable import surface.
export { dealToProduct };

// Lazy-load the heavy checkout form — it's only needed when a shopper actually
// taps "Order", so it should never be in the deals-list bundle.
const WhatsAppCheckoutModal = dynamic(
  () => import("@/components/WhatsAppCheckoutModal"),
  { ssr: false },
);

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

function formatDealPrice(n: number): string {
  return `Rs ${Math.round(n).toLocaleString("en-PK")}`;
}

/**
 * Product-style deal card. Price is always full-width (never clipped by buttons).
 * Actions sit on their own row. Equal height via stretch + fixed slots.
 * Memoized so re-rendering a deals strip/grid doesn't re-render every card.
 */
function DealCard({
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
  const [resolvedShop, setResolvedShop] = useState<Shop | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);

  // Keep the heart in sync with persisted favorites (not only after a click).
  useEffect(() => {
    let cancelled = false;
    isFavorited(dealWishlistId(deal))
      .then((f) => {
        if (!cancelled) setFavorited(f);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deal]);

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
  const hasPrice = dealHasPrice(deal);

  const tickerTags = useMemo(() => {
    const tags: string[] = [];
    if (whenTag) tags.push(whenTag);
    for (const t of offerTags) {
      if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
    }
    return tags.slice(0, 3);
  }, [offerTags, whenTag]);

  const shopPick = dealToShop(deal, shopWhatsapp);

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
    const nowFav = await toggleFavorite(
      dealWishlistId(deal),
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

  const handleOrder = async (e: MouseEvent) => {
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
    if (orderBusy) return;
    setOrderBusy(true);

    // Seed cart so login/verify can resume checkout via CartBar.
    addItem(product, shopPick, 1);
    trackProductView({
      id: product.id,
      name: deal.title,
      price: Number(deal.price) || 0,
      imageUrl: gallery[0] ?? null,
      shopId: deal.shop_id,
      shopName: deal.shop_name,
      category: null,
    });

    const fallback = {
      id: deal.shop_id,
      name: deal.shop_name || "Store",
      whatsapp_number: shopPick.whatsapp_number,
      location: "",
    } as Shop;
    setResolvedShop(fallback);

    try {
      const res = await fetchShopById(deal.shop_id);
      if (res.success && res.data.shop) {
        setResolvedShop({
          ...res.data.shop,
          whatsapp_number: res.data.shop.whatsapp_number || shopPick.whatsapp_number,
          name: res.data.shop.name || deal.shop_name || "Store",
        });
      }
    } catch {
      /* keep fallback */
    } finally {
      setOrderBusy(false);
      setCheckoutOpen(true);
    }
  };

  const checkoutItems = dealToCheckoutItems(deal, product);

  const titleClass = compact ? "text-[12px] sm:text-[13px]" : "text-[13px] sm:text-sm";
  const priceLabel = hasPrice ? formatDealPrice(Number(deal.price)) : null;

  const checkoutModal = checkoutOpen && resolvedShop ? (
    <WhatsAppCheckoutModal
      items={checkoutItems}
      shop={resolvedShop}
      onClose={() => {
        setCheckoutOpen(false);
        setResolvedShop(null);
      }}
      onOrderPlaced={() => {
        setCheckoutOpen(false);
        setResolvedShop(null);
      }}
    />
  ) : null;

  /* ── Home: editorial spotlight card (paid-ad grade) ── */
  if (isHomeDensity) {
    return (
      <>
        <article
          className={`tm-home-deal-card group relative flex w-full overflow-hidden ${
            onOpen ? "cursor-pointer" : "cursor-default"
          } ${className}`}
          onClick={(e) => {
            // Ignore clicks that bubbled from explicit action controls
            const t = e.target as HTMLElement | null;
            if (t?.closest("button, a, input, textarea, select, label")) return;
            onOpen?.();
          }}
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
          <div className="tm-home-deal-media relative w-[52%] min-w-[48%] shrink-0 self-stretch overflow-hidden">
            {showPhoto && safeSrc ? (
              <Image
                src={safeSrc}
                alt={deal.title}
                fill
                className="object-contain transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                sizes="(max-width: 640px) 52vw, (max-width: 1024px) 30vw, 20vw"
                priority={priority}
                loading={priority ? "eager" : "lazy"}
                quality={85}
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="tm-home-deal-media-fallback flex h-full min-h-[8.5rem] w-full items-center justify-center">
                <span className="select-none text-3xl font-semibold tracking-tight text-white/35">
                  {deal.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="tm-home-deal-media-veil" aria-hidden />
            <span className="tm-home-deal-badge-deal absolute left-2.5 top-2.5">Featured</span>
            {hasDiscount && discountPercent > 0 ? (
              <span className="tm-home-deal-badge-off absolute bottom-2.5 left-2.5">
                −{discountPercent}%
              </span>
            ) : null}
          </div>

          <div className="tm-home-deal-body flex min-w-0 flex-1 flex-col justify-between gap-1 p-2.5 sm:gap-1.5 sm:p-3 md:p-3">
            <div className="min-w-0 space-y-1">
              <h3 className="tm-home-deal-name line-clamp-2" title={deal.title}>
                {deal.title}
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  goStore();
                }}
                className="tm-home-deal-shop flex min-w-0 max-w-full items-center gap-2 text-left"
                aria-label={`Visit ${deal.shop_name || "store"}`}
              >
                {deal.shop_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getSafeImageUrl(deal.shop_logo_url, "shop")}
                    alt=""
                    className="h-5 w-5 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="tm-home-deal-shop-fallback">
                    {(deal.shop_name || "?").charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate">{deal.shop_name || "Store"}</span>
              </button>
              {tickerTags[0] ? (
                <p className="tm-home-deal-meta truncate">{tickerTags[0]}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0">
                {hasPrice && priceLabel ? (
                  <>
                    <p className="tm-home-deal-price">{priceLabel}</p>
                    {hasDiscount && originalPrice != null ? (
                      <span className="tm-home-deal-was">{formatDealPrice(originalPrice)}</span>
                    ) : null}
                  </>
                ) : (
                  <p className="tm-home-deal-meta">{whenTag}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={handleWishlist}
                  className={`tm-home-deal-icon ${favorited ? "is-on" : ""}`}
                  aria-label="Wishlist"
                >
                  <HeartIcon filled={favorited} />
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  className="tm-home-deal-add"
                  aria-label={`Add ${deal.title} to cart`}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={handleOrder}
                  disabled={!canOrderToday || orderBusy}
                  title={canOrderToday ? "Order via WhatsApp" : `Order on ${whenTag}`}
                  className={`tm-home-deal-order ${
                    canOrderToday ? "" : "tm-home-deal-order--disabled"
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
        className={`tm-product-card group relative flex w-full flex-col overflow-hidden ${
          onOpen ? "cursor-pointer" : "cursor-default"
        } ${className}`}
        onClick={(e) => {
          const t = e.target as HTMLElement | null;
          if (t?.closest("button, a, input, textarea, select, label")) return;
          onOpen?.();
        }}
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
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="tm-product-placeholder flex items-center justify-center">
              <span className="select-none text-2xl font-semibold tracking-tight text-teal-700/35 dark:text-teal-300/30 sm:text-3xl">
                {deal.title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <span className="tm-badge-deal absolute left-1.5 top-1.5 z-10">
            Deal
          </span>

          {hasDiscount && discountPercent > 0 ? (
            <span className="tm-badge-discount absolute right-1.5 top-1.5 z-10">
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

        <div className="tm-product-body">
          <h3 className={`tm-product-title ${titleClass}`} title={deal.title}>
            {deal.title}
          </h3>

          <button
            type="button"
            onClick={(e) => {
              stop(e);
              goStore();
            }}
            className="tm-product-shop text-left"
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

          <div className="tm-product-footer flex flex-col justify-end gap-0.5">
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

          <div className="flex items-center justify-between gap-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
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
                disabled={!canOrderToday || orderBusy}
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

export default memo(DealCard);
