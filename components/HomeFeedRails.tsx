"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Home compact grids (deals / top products / sponsored)        */
/*                                                                            */
/*  Daraz-style MINI tiles: image + title + price only — no wishlist heart,   */
/*  no Add/Order buttons on the card. The whole tile opens the same quick     */
/*  view where Order / Add to Cart / Wishlist live.                           */
/*                                                                            */
/*  Fixed grid · 4 columns phone → 5 columns tablet/laptop · ~3 rows          */
/*  (12 tiles phones / 15 tiles desktop) · NO horizontal scroll.              */
/* -------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import type { MarketplaceProduct, Product, Shop } from "@/types";
import { isDealActiveOnDate, toPkDateKey, type ShopDeal } from "@/lib/dealSchedule";
import { getDealImages } from "@/lib/productImages";
import { getSafeImageUrl } from "@/services/storageService";
import { formatPrice, getProductDiscount } from "@/lib/formatters";
import { useToast } from "@/components/Toast";
import { useCart } from "@/context/CartContext";
import { useMarketplaceProducts } from "@/lib/queries";
import { getAllFavorites, toggleFavorite } from "@/services/wishlistService";
import { fetchShopById } from "@/services/shopService";
import { trackProductView, trackCategoryInterest } from "@/lib/behavior";
import { logProductClick } from "@/services/analyticsService";
import { dealToProduct } from "@/lib/dealCommerce";

const QuickViewModal = dynamic(() => import("@/components/QuickViewModal"), { ssr: false });
const ProductOrderModal = dynamic(() => import("@/components/ProductOrderModal"), { ssr: false });
const DealQuickView = dynamic(() => import("@/components/DealQuickView"), { ssr: false });
const PromoAdsCarousel = dynamic(() => import("@/components/PromoAdsCarousel"), {
  ssr: false,
  loading: () => null,
});

const RAIL_LIMIT = 15; // 5 × 3 rows on desktop, 12 of these on phones (4 × 3)

/* ── Header ───────────────────────────────────────────────────────────────── */

function ChevronRight() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function RailHeading({
  icon,
  title,
  moreLabel,
  moreHref,
}: {
  icon?: React.ReactNode;
  title: string;
  moreLabel: string;
  moreHref: string;
}) {
  return (
    <div className="tm-rail-head">
      <h2 className="tm-rail-title">
        {icon ? <span className="tm-rail-title-icon">{icon}</span> : null}
        <span className="truncate">{title}</span>
      </h2>
      <Link href={moreHref} className="tm-rail-more">
        {moreLabel}
        <ChevronRight />
      </Link>
    </div>
  );
}

/* ── Daraz-style mini tile (no buttons — whole tile opens quick view) ─────── */

function percentOff(price: number, original: number | null | undefined): number {
  if (!original || original <= price || price <= 0) return 0;
  return Math.max(1, Math.round((1 - price / original) * 100));
}

function MiniTile({
  imageUrl,
  title,
  price,
  originalPrice,
  badge,
  shopName,
  onOpen,
}: {
  imageUrl: string | null | undefined;
  title: string;
  price: number;
  originalPrice?: number | null;
  /** Extra corner chip (e.g. deal badge). Falls back to % off chip. */
  badge?: string | null;
  shopName?: string | null;
  onOpen: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const safeSrc =
    imageUrl && !imgError ? getSafeImageUrl(imageUrl, "product", "card") : null;
  const off = percentOff(price, originalPrice);
  const initial = title.trim().charAt(0).toUpperCase() || "?";
  const showBadge = badge?.trim() ? badge.trim() : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="tm-mini-tile"
      aria-label={`View ${title}`}
    >
      <span className="tm-mini-tile-media">
        {safeSrc ? (
          <Image
            src={safeSrc}
            alt=""
            fill
            sizes="(max-width: 640px) 25vw, 20vw"
            className="object-contain"
            loading="lazy"
            quality={70}
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="tm-mini-tile-fallback">{initial}</span>
        )}
        {off > 0 ? (
          <span className="tm-mini-tile-off">{off}% OFF</span>
        ) : showBadge ? (
          <span className="tm-mini-tile-badge">{showBadge}</span>
        ) : null}
      </span>

      <span className="tm-mini-tile-body">
        <span className="tm-mini-tile-title" title={title}>
          {title}
        </span>
        {shopName ? (
          <span className="tm-mini-tile-shop" title={shopName}>
            {shopName}
          </span>
        ) : null}
        <span className="tm-mini-tile-price-row">
          <span className="tm-mini-tile-price">{formatPrice(price)}</span>
          {originalPrice && originalPrice > price ? (
            <span className="tm-mini-tile-was">
              {formatPrice(originalPrice)}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/* ── Deals grid ───────────────────────────────────────────────────────────── */

interface DealsRailProps {
  deals: ShopDeal[];
  title?: string;
  moreHref?: string;
}

function DealsRailInner({ deals, title = "Hot deals", moreHref = "/deals" }: DealsRailProps) {
  const [openDeal, setOpenDeal] = useState<ShopDeal | null>(null);

  const visible = useMemo(() => {
    const today = toPkDateKey();
    const live = deals.filter(
      (d) =>
        d.is_active &&
        isDealActiveOnDate(d, today) &&
        Boolean(d.image_url || (d.images && d.images.length) || d.price != null),
    );
    const featured = live.filter((d) => d.is_featured);
    const rest = live.filter((d) => !d.is_featured);
    return [...featured, ...rest].slice(0, RAIL_LIMIT);
  }, [deals]);

  if (visible.length === 0) return null;

  return (
    <section aria-label={title} className="tm-rail">
      <RailHeading icon={<span aria-hidden>⚡</span>} title={title} moreLabel="More deals" moreHref={moreHref} />
      <div className="tm-mini-grid">
        {visible.map((deal) => {
          const product = dealToProduct(deal);
          const discount = getProductDiscount(product);
          const image = getDealImages(deal)[0] ?? deal.image_url ?? null;
          return (
            <MiniTile
              key={deal.id}
              imageUrl={image}
              title={deal.title}
              price={Number(deal.price ?? product.price) || 0}
              originalPrice={
                Number(deal.original_price ?? discount.originalPrice) || null
              }
              shopName={deal.shop_name ?? null}
              onOpen={() => {
                setOpenDeal(deal);
                trackProductView({
                  id: product.id,
                  name: deal.title,
                  price: Number(deal.price) || 0,
                  imageUrl: image,
                  shopId: deal.shop_id,
                  shopName: deal.shop_name,
                  category: null,
                });
              }}
            />
          );
        })}
      </div>
      {openDeal ? <DealQuickView deal={openDeal} onClose={() => setOpenDeal(null)} /> : null}
    </section>
  );
}

/* ── Top products grid ────────────────────────────────────────────────────── */

interface ProductsRailProps {
  myShopId: string | null;
  title?: string;
  moreHref?: string;
}

interface ProductOrderIntent {
  product: Product;
  variant?: string;
  quantity: number;
  notes?: string;
}

function ProductsRailInner({ myShopId, title = "Top picks", moreHref = "/products" }: ProductsRailProps) {
  const { addToast } = useToast();
  const { addItem } = useCart();

  const productsQuery = useMarketplaceProducts({
    sort: "popular",
    limit: RAIL_LIMIT,
    availableOnly: true,
  });

  const products = useMemo(() => {
    const all = productsQuery.data ?? [];
    return all.filter((p) => !myShopId || p.shop_id !== myShopId).slice(0, RAIL_LIMIT);
  }, [productsQuery.data, myShopId]);

  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [quickView, setQuickView] = useState<MarketplaceProduct | null>(null);
  const [orderIntent, setOrderIntent] = useState<ProductOrderIntent | null>(null);
  const [orderShop, setOrderShop] = useState<Shop | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getAllFavorites()
        .then((items) => {
          if (cancelled) return;
          setFavorites(new Set(items.filter((i) => i.type === "product").map((i) => i.id)));
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener("favoritesUpdated", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("favoritesUpdated", refresh);
    };
  }, []);

  const fullFor = useCallback(
    (product: Product): MarketplaceProduct =>
      (products.find((p) => p.id === product.id) ?? product) as MarketplaceProduct,
    [products],
  );

  const openQuickView = useCallback(
    (product: Product) => {
      const full = fullFor(product);
      setQuickView(full);
      trackProductView({
        id: full.id,
        name: full.name,
        price: full.price,
        imageUrl: full.image_url,
        shopId: full.shop_id,
        shopName: full.shop_name,
        category: full.shop_category ?? full.category_id ?? null,
      });
      trackCategoryInterest(full.shop_category ?? full.category_id, "click");
      void logProductClick(full.shop_id, full.id);
    },
    [fullFor],
  );

  /** Direct order — resolve the full shop first, then open WhatsApp checkout. */
  const handleOrder = useCallback(
    async (intent: ProductOrderIntent) => {
      const full = fullFor(intent.product);
      if (full.is_available === false) {
        addToast("This product is unavailable.", "error");
        return;
      }
      const shopPick: Pick<Shop, "id" | "name" | "whatsapp_number"> = {
        id: full.shop_id,
        name: full.shop_name || "Store",
        whatsapp_number: full.shop_whatsapp || "",
      };
      addItem(full, shopPick, intent.quantity, intent.variant, intent.notes);
      trackProductView({
        id: full.id,
        name: full.name,
        price: full.price,
        imageUrl: full.image_url,
        shopId: full.shop_id,
        shopName: full.shop_name,
        category: full.shop_category ?? full.category_id ?? null,
      });
      const fallback: Shop = {
        id: full.shop_id,
        name: shopPick.name,
        whatsapp_number: shopPick.whatsapp_number,
        category: full.shop_category ?? "",
        location: full.shop_location ?? "",
        is_live: true,
        latitude: full.shop_latitude ?? null,
        longitude: full.shop_longitude ?? null,
        service_radius_km: full.shop_service_radius_km ?? null,
        delivery_zones: full.shop_delivery_zones ?? null,
        free_delivery_threshold: full.shop_free_delivery_threshold ?? null,
        free_delivery_radius_km: full.shop_free_delivery_radius_km ?? null,
        delivery_fee_flat: full.shop_delivery_fee_flat ?? null,
        delivery_fee_per_km: full.shop_delivery_fee_per_km ?? null,
      };
      setOrderShop(fallback);
      setOrderIntent(intent);
      try {
        const res = await fetchShopById(full.shop_id);
        if (res.success && res.data.shop) {
          setOrderShop({
            ...res.data.shop,
            whatsapp_number: res.data.shop.whatsapp_number || shopPick.whatsapp_number,
            name: res.data.shop.name || shopPick.name,
          });
        }
      } catch {
        /* keep fallback */
      }
    },
    [addItem, addToast, fullFor],
  );

  const handleFavorite = useCallback(
    async (product: { id: string; name?: string; image_url?: string | null }, next: boolean) => {
      setFavorites((prev) => {
        const n = new Set(prev);
        if (next) n.add(product.id);
        else n.delete(product.id);
        return n;
      });
      try {
        await toggleFavorite(product.id, "product", product.name || "Product", product.image_url ?? undefined);
      } catch {
        setFavorites((prev) => {
          const n = new Set(prev);
          if (next) n.delete(product.id);
          else n.add(product.id);
          return n;
        });
        addToast("Could not update wishlist", "error");
      }
    },
    [addToast],
  );

  if (productsQuery.isLoading || products.length === 0) return null;

  const quickViewShop = quickView
    ? { id: quickView.shop_id, name: quickView.shop_name || "Store", whatsapp_number: quickView.shop_whatsapp || "" }
    : null;

  return (
    <>
      <section aria-label={title} className="tm-rail">
        <RailHeading icon={<span aria-hidden>🔥</span>} title={title} moreLabel="More products" moreHref={moreHref} />
        <div className="tm-mini-grid">
          {products.map((product) => {
            const discount = getProductDiscount(product);
            return (
              <MiniTile
                key={product.id}
                imageUrl={product.image_url}
                title={product.name}
                price={product.price}
                originalPrice={discount.originalPrice}
                shopName={product.shop_name ?? null}
                onOpen={() => {
                  if (product.is_available === false) return;
                  openQuickView(product);
                }}
              />
            );
          })}
        </div>
      </section>

      {quickView && quickViewShop && (
        <QuickViewModal
          product={quickView}
          shop={quickViewShop}
          onClose={() => setQuickView(null)}
          isWishlisted={favorites.has(quickView.id)}
          onWishlistToggle={() => void handleFavorite(quickView, !favorites.has(quickView.id))}
          onOrder={(order) => {
            setQuickView(null);
            void handleOrder(order);
          }}
        />
      )}

      {orderIntent && orderShop && (
        <ProductOrderModal
          shop={orderShop}
          product={orderIntent.product}
          variant={orderIntent.variant}
          quantity={orderIntent.quantity}
          notes={orderIntent.notes}
          onClose={() => {
            setOrderIntent(null);
            setOrderShop(null);
          }}
          onOrderPlaced={() => {
            setOrderIntent(null);
            setOrderShop(null);
          }}
        />
      )}
    </>
  );
}

/* ── Sponsored shelf (interleaved in the shop feed) ──────────────────────── */

function SponsoredRailInner({ title = "Sponsored" }: { title?: string }) {
  return <PromoAdsCarousel placement="homepage_feed" sectionLabel={title} className="tm-rail" />;
}

/* ── Public exports ───────────────────────────────────────────────────────── */

export const DealsRail = DealsRailInner;
export const ProductsRail = ProductsRailInner;
export const SponsoredRail = SponsoredRailInner;
