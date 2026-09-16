"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import RelatedItemsRail, { type RelatedRailItem } from "@/components/RelatedItemsRail";
import BuyerProtectionStrip from "@/components/BuyerProtectionStrip";
import ProductReviews from "@/components/ProductReviews";
import ProductRatingModal from "@/components/ProductRatingModal";
import { ErrorState } from "@/components/ErrorState";
import { ProductDetailSkeleton } from "@/components/Skeletons";
import {
  fetchActiveDeals,
  fetchDealById,
  fetchRelatedDeals,
} from "@/services/dealService";
import {
  fetchAlsoBoughtProducts,
  fetchCrossShopRelatedProducts,
  fetchMarketplaceProductById,
} from "@/services/productService";
import { fetchProductReviewContext, type ProductReviewContext } from "@/services/reviewService";
import { getDealSeoPath } from "@/lib/seo/dealSlug";
import { getProductSeoPath } from "@/lib/seo/productSlug";
import { getDealImages } from "@/lib/productImages";
import { getShopPath, isUuid } from "@/lib/shopSlug";
import {
  dealCommerceId,
  dealHasPrice,
  dealToCheckoutItems,
  dealToProduct,
  dealToShop,
} from "@/lib/dealCommerce";
import {
  formatDealWhenTag,
  isDealOrderableToday,
  type ShopDeal,
} from "@/lib/dealSchedule";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/components/Toast";
import { useLocale } from "@/context/LocaleContext";
import { trackProductView } from "@/lib/behavior";
import { createClient } from "@/lib/supabase/client";
import type { MarketplaceProduct, Shop } from "@/types";

const WhatsAppCheckoutModal = dynamic(
  () => import("@/components/WhatsAppCheckoutModal"),
  { ssr: false },
);

function CartPlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function dealToRail(d: ShopDeal): RelatedRailItem {
  return {
    id: d.id,
    href: getDealSeoPath(d.title, d.id),
    title: d.title,
    price: Number(d.price) || 0,
    originalPrice: d.original_price ?? null,
    imageUrl: getDealImages(d)[0] ?? d.image_url ?? null,
    shopName: d.shop_name,
  };
}

function productToRail(p: MarketplaceProduct): RelatedRailItem {
  return {
    id: p.id,
    href: getProductSeoPath(p.name, p.short_code, p.id),
    title: p.name,
    price: p.price,
    originalPrice: p.original_price ?? p.compare_at_price ?? null,
    imageUrl: p.image_url,
    shopName: p.shop_name,
  };
}

export default function DealDetailClient({
  dealId,
  /** When true, SEO page already rendered image + title — only actions/related. */
  hideCard = false,
}: {
  dealId: string;
  hideCard?: boolean;
}) {
  const { addItem } = useCart();
  const { addToast } = useToast();
  const { t } = useLocale();

  const [deal, setDeal] = useState<ShopDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromShop, setFromShop] = useState<RelatedRailItem[]>([]);
  const [youMayLike, setYouMayLike] = useState<RelatedRailItem[]>([]);
  const [nearby, setNearby] = useState<RelatedRailItem[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");
  const [added, setAdded] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [resolvedShop, setResolvedShop] = useState<Shop | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingCtx, setRatingCtx] = useState<ProductReviewContext | null>(null);
  const [reviewsRefreshKey, setReviewsRefreshKey] = useState(0);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [linkedAvg, setLinkedAvg] = useState<number | null>(null);
  const [linkedCount, setLinkedCount] = useState(0);

  const reviewProductId = useMemo(
    () => (deal ? dealCommerceId(deal) : ""),
    [deal],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDeal(null);
    setFromShop([]);
    setYouMayLike([]);
    setNearby([]);
    setQuantity(1);
    setItemNotes("");
    setAdded(false);
    setRatingCtx(null);
    setLinkedAvg(null);
    setLinkedCount(0);
    setReviewsOpen(false);

    void (async () => {
      const res = await fetchDealById(dealId);
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setLoading(false);
        return;
      }
      if (!res.data) {
        setError("This deal is no longer available.");
        setLoading(false);
        return;
      }
      setDeal(res.data);
      setLoading(false);

      const d = res.data;
      const commerceId = dealCommerceId(d);

      void fetchProductReviewContext(commerceId).then((ctx) => {
        if (!cancelled) setRatingCtx(ctx);
      });

      if (d.product_id && isUuid(d.product_id)) {
        void fetchMarketplaceProductById(d.product_id).then((pr) => {
          if (cancelled || !pr.success || !pr.data) return;
          setLinkedAvg(Number(pr.data.avg_rating) > 0 ? Number(pr.data.avg_rating) : null);
          setLinkedCount(Number(pr.data.review_count) || 0);
        });
      }

      void Promise.all([
        fetchRelatedDeals({ shopId: d.shop_id, excludeId: d.id, limit: 8 }),
        fetchActiveDeals(48),
        d.product_id && isUuid(d.product_id)
          ? fetchAlsoBoughtProducts({
              excludeId: d.product_id,
              excludeShopId: d.shop_id,
              subCategoryId: d.sub_category_id,
              seedName: d.title,
              limit: 8,
            })
          : Promise.resolve(null),
        d.product_id && isUuid(d.product_id)
          ? fetchCrossShopRelatedProducts({
              excludeShopId: d.shop_id,
              excludeId: d.product_id,
              subCategoryId: d.sub_category_id,
              seedName: d.title,
              limit: 10,
            })
          : Promise.resolve(null),
      ]).then(([sameShop, active, alsoBought, crossShop]) => {
        if (cancelled) return;
        if (sameShop.success) setFromShop(sameShop.data.map(dealToRail));

        if (alsoBought?.success && alsoBought.data.length) {
          setYouMayLike(alsoBought.data.map(productToRail));
        } else if (active.success) {
          setYouMayLike(
            active.data
              .filter((x) => x.id !== d.id)
              .slice(0, 8)
              .map(dealToRail),
          );
        }

        if (crossShop?.success && crossShop.data.length) {
          setNearby(crossShop.data.map(productToRail));
        } else if (active.success) {
          setNearby(
            active.data
              .filter((x) => x.id !== d.id && x.shop_id !== d.shop_id)
              .slice(0, 8)
              .map(dealToRail),
          );
        }
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [dealId]);

  useEffect(() => {
    if (!reviewProductId) return;
    let cancelled = false;
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void fetchProductReviewContext(reviewProductId).then((ctx) => {
        if (!cancelled) setRatingCtx(ctx);
      });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [reviewProductId]);

  const product = useMemo(() => (deal ? dealToProduct(deal) : null), [deal]);
  const shopPick = useMemo(
    () => (deal ? dealToShop(deal) : null),
    [deal],
  );
  const hasPrice = deal ? dealHasPrice(deal) : false;
  const canOrderToday = deal ? isDealOrderableToday(deal) : false;
  const whenTag = deal ? formatDealWhenTag(deal) : "";
  const shopHref = deal
    ? getShopPath({
        id: deal.shop_id,
        name: deal.shop_name || "Store",
        slug: deal.shop_slug,
      })
    : "/deals";

  const handleAdd = useCallback(() => {
    if (!deal || !product || !shopPick) return;
    if (!hasPrice) {
      addToast("This deal needs a price — open the store or ask the merchant.", "info");
      return;
    }
    if (deal.product_id && isUuid(deal.product_id)) {
      addToast("Choose options on the product page", "info");
      window.location.href = getProductSeoPath(deal.title, null, deal.product_id);
      return;
    }
    addItem(product, shopPick, quantity);
    setAdded(true);
    addToast("Added to cart", "success");
    setTimeout(() => setAdded(false), 2000);
  }, [deal, product, shopPick, hasPrice, quantity, addItem, addToast]);

  const handleOrder = useCallback(async () => {
    if (!deal || !product || !shopPick) return;
    if (!canOrderToday) {
      addToast(`Order opens on ${whenTag}. Cart & wishlist still work.`, "info");
      return;
    }
    if (!hasPrice) {
      addToast("Deal needs a price — opening store…", "info");
      window.location.href = shopHref;
      return;
    }
    if (deal.product_id && isUuid(deal.product_id)) {
      addToast("Choose options on the product page", "info");
      window.location.href = getProductSeoPath(deal.title, null, deal.product_id);
      return;
    }
    if (!shopPick.whatsapp_number) {
      addToast("Store WhatsApp missing — opening store.", "info");
      window.location.href = shopHref;
      return;
    }
    if (orderBusy) return;
    setOrderBusy(true);
    addItem(product, shopPick, quantity);
    trackProductView({
      id: product.id,
      name: deal.title,
      price: Number(deal.price) || 0,
      imageUrl: getDealImages(deal)[0] ?? null,
      shopId: deal.shop_id,
      shopName: deal.shop_name,
    });
    setResolvedShop({
      id: deal.shop_id,
      name: deal.shop_name || "Store",
      whatsapp_number: shopPick.whatsapp_number,
    } as Shop);
    setCheckoutOpen(true);
    setOrderBusy(false);
  }, [
    deal,
    product,
    shopPick,
    canOrderToday,
    whenTag,
    hasPrice,
    shopHref,
    orderBusy,
    quantity,
    addItem,
    addToast,
  ]);

  const dealProductId = deal?.product_id;
  const handleRated = useCallback(() => {
    setRatingOpen(false);
    setReviewsRefreshKey((k) => k + 1);
    if (!reviewProductId) return;
    void fetchProductReviewContext(reviewProductId).then(setRatingCtx);
    if (dealProductId && isUuid(dealProductId)) {
      void fetchMarketplaceProductById(dealProductId).then((pr) => {
        if (!pr.success || !pr.data) return;
        setLinkedAvg(Number(pr.data.avg_rating) > 0 ? Number(pr.data.avg_rating) : null);
        setLinkedCount(Number(pr.data.review_count) || 0);
      });
    }
  }, [reviewProductId, dealProductId]);

  if (loading) {
    return (
      <div className={hideCard ? "mt-2" : "mt-3"}>
        <ProductDetailSkeleton />
      </div>
    );
  }

  if (error || !deal || !product || !shopPick) {
    return (
      <div className="mt-3">
        <ErrorState
          title="Deal unavailable"
          message={error ?? "This deal could not be found."}
          onRetry={() => window.location.reload()}
        />
        <div className="mt-3 text-center">
          <Link href="/deals" className="text-sm font-semibold text-emerald-600 hover:text-emerald-700">
            Browse all deals →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={hideCard ? "mt-1.5 space-y-1.5" : "mt-3 space-y-2"}>
      {!hideCard ? (
        <p className="text-[13px] font-extrabold text-zinc-900 dark:text-zinc-50">{deal.title}</p>
      ) : null}

      <div>
        <label className="mb-0.5 block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
          Special instructions (optional)
        </label>
        <textarea
          value={itemNotes}
          onChange={(e) => setItemNotes(e.target.value.slice(0, 200))}
          rows={2}
          maxLength={200}
          placeholder="Any special instructions"
          className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[13px] text-zinc-900 placeholder:text-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
          {t("pdp.quantity")}:
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-7 text-center text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity(Math.min(99, quantity + 1))}
            disabled={quantity >= 99}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!hasPrice}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-[13px] font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
            added
              ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "border-teal-300 text-teal-800 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-950/30"
          }`}
        >
          <CartPlusIcon /> {added ? t("common.done") : t("common.addToCart")}
        </button>
        <button
          type="button"
          onClick={() => void handleOrder()}
          disabled={!hasPrice || !canOrderToday || orderBusy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-[13px] font-bold text-white shadow-sm shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <WhatsAppIcon /> {t("common.orderNow")}
        </button>
      </div>

      <p className="text-center text-[0.65rem] text-zinc-400 dark:text-zinc-500">
        From{" "}
        <Link href={shopHref} className="font-medium text-zinc-500 hover:underline dark:text-zinc-300">
          {deal.shop_name || "Store"}
        </Link>
        {" · "}order via WhatsApp
        {whenTag ? ` · ${whenTag}` : ""}
      </p>

      <BuyerProtectionStrip compact />

      <ProductReviews
        productId={reviewProductId}
        shopId={deal.shop_id}
        productName={deal.title}
        avgRating={linkedAvg}
        reviewCount={linkedCount}
        refreshKey={reviewsRefreshKey}
        expanded={reviewsOpen}
        onExpandedChange={setReviewsOpen}
        heading="Deal reviews"
        shopName={deal.shop_name || resolvedShop?.name}
        shopLocation={resolvedShop?.location ?? null}
        shopHref={shopHref}
        onRequestRate={() => setRatingOpen(true)}
        onReviewsChanged={() => {
          setReviewsRefreshKey((k) => k + 1);
          void fetchProductReviewContext(reviewProductId).then(setRatingCtx);
        }}
        rateHint={
          ratingCtx?.signedIn && !ratingCtx.isOwner && ratingCtx.canSubmit ? (
            <button
              type="button"
              onClick={() => setRatingOpen(true)}
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800/60"
            >
              Write a review
            </button>
          ) : ratingCtx?.signedIn && !ratingCtx.isOwner && ratingCtx.alreadyReviewed ? (
            <p className="text-[0.65rem] font-medium text-emerald-700 dark:text-emerald-400">
              You rated this deal
            </p>
          ) : ratingCtx?.signedIn && !ratingCtx.isOwner ? (
            <p className="text-[0.65rem] text-zinc-400">Rate after delivery</p>
          ) : null
        }
      />

      <RelatedItemsRail
        title={t("recs.alsoBought")}
        subtitle={t("recs.popularNearby")}
        items={youMayLike}
      />
      <RelatedItemsRail
        title={t("recs.fromShop")}
        subtitle="Same store"
        items={fromShop}
      />
      <RelatedItemsRail
        title={t("recs.similar")}
        subtitle="Nearby"
        items={nearby}
      />

      <div className="pb-1 text-center">
        <Link
          href="/deals"
          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
        >
          Browse all deals →
        </Link>
      </div>

      {ratingOpen ? (
        <ProductRatingModal
          productId={reviewProductId}
          shopId={deal.shop_id}
          productName={deal.title}
          imageUrl={getDealImages(deal)[0] ?? deal.image_url}
          shopName={deal.shop_name ?? undefined}
          onClose={() => setRatingOpen(false)}
          onRated={handleRated}
        />
      ) : null}

      {checkoutOpen && resolvedShop ? (
        <WhatsAppCheckoutModal
          shop={resolvedShop}
          items={dealToCheckoutItems(deal, product, {
            quantity,
            notes: itemNotes.trim() || undefined,
          })}
          onClose={() => setCheckoutOpen(false)}
          onOrderPlaced={() => setCheckoutOpen(false)}
        />
      ) : null}
    </div>
  );
}
