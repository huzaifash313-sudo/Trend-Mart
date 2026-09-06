"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Home feed rails (deals / top products / sponsored)           */
/*                                                                            */
/*  Inserted BETWEEN chunks of the live-shops feed every ~24 shops so the     */
/*  homepage reads like a living marketplace: shops → deals → shops →         */
/*  top products → shops → sponsored → shops …                                */
/*                                                                            */
/*  Each rail shares the same visual language:                                */
/*   - slim header with title + "More … →" link on the right                  */
/*   - gentle auto-scrolling marquee (pause on hover / reduced motion)        */
/*   - tap a card → quick view with Add / Order / wishlist                    */
/* -------------------------------------------------------------------------- */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MarketplaceProduct, Product, Shop } from "@/types";
import { isDealActiveOnDate, toPkDateKey, type ShopDeal } from "@/lib/dealSchedule";
import { getDealImages } from "@/lib/productImages";
import { useToast } from "@/components/Toast";
import { useCart } from "@/context/CartContext";
import { useMarketplaceProducts } from "@/lib/queries";
import { getAllFavorites, toggleFavorite } from "@/services/wishlistService";
import { fetchShopById } from "@/services/shopService";
import { customerVariantGroups } from "@/lib/variantPricing";
import { trackProductView, trackCategoryInterest } from "@/lib/behavior";
import { logProductClick } from "@/services/analyticsService";
import { dealToProduct } from "@/lib/dealCommerce";
import DealCard from "@/components/DealCard";
import { ProductCard } from "@/components/ProductGrid";

const QuickViewModal = dynamic(() => import("@/components/QuickViewModal"), { ssr: false });
const ProductOrderModal = dynamic(() => import("@/components/ProductOrderModal"), { ssr: false });
const DealQuickView = dynamic(() => import("@/components/DealQuickView"), { ssr: false });
const PromoAdsCarousel = dynamic(() => import("@/components/PromoAdsCarousel"), {
  ssr: false,
  loading: () => null,
});

/* ── Shared constants ─────────────────────────────────────────────────────── */

const RAIL_GAP_PX = 10;
const AUTO_PX_PER_SEC = 34;
const RESUME_AFTER_MS = 3200;
const ARROW_EASE_MS = 460;

/** Card slot width per viewport — 2 phones → 3 small → 4 tablet → 5 laptop+. */
const RAIL_SLOT =
  "w-[calc(50%-5px)] shrink-0 sm:w-[calc(33.333%-6.667px)] md:w-[calc(25%-7.5px)] lg:w-[calc(20%-8px)]";

/* ── Small pieces ─────────────────────────────────────────────────────────── */

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === "left" ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  );
}

function RailHeading({
  icon,
  title,
  moreLabel,
  moreHref,
}: {
  icon?: ReactNode;
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
        <Chevron dir="right" />
      </Link>
    </div>
  );
}

function wrapOffset(x: number, width: number): number {
  if (width <= 0) return 0;
  let v = x % width;
  if (v < 0) v += width;
  return v;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/* ── Generic auto-scrolling marquee shelf ─────────────────────────────────── */

interface RailMarqueeProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderCard: (item: T, index: number) => ReactNode;
}

function RailMarquee<T>({ items, getKey, renderCard }: RailMarqueeProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLDivElement>(null);

  const offsetRef = useRef(0);
  const setWidthRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const movedRef = useRef(false);
  const animRef = useRef<number | null>(null);

  const [reduceMotion, setReduceMotion] = useState(false);
  const [ready, setReady] = useState(false);
  const [copies, setCopies] = useState(2);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const applyTransform = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
  }, []);

  /** Measure one set + choose enough duplicates to always fill the viewport. */
  const measure = useCallback(() => {
    const setEl = setRef.current;
    const vp = viewportRef.current;
    if (!setEl) return;
    const setW = setEl.offsetWidth;
    const vpW = vp?.clientWidth ?? setW;
    setWidthRef.current = setW;
    if (setW > 0) {
      const needed = Math.max(2, Math.ceil((vpW * 1.25) / setW) + 1);
      setCopies(needed);
    }
    setReady(setW > 0);
    applyTransform();
  }, [applyTransform]);

  useEffect(() => {
    measure();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;
    if (setRef.current) ro?.observe(setRef.current);
    if (viewportRef.current) ro?.observe(viewportRef.current);
    return () => ro?.disconnect();
  }, [measure, items]);

  /* Continuous rAF scroll — pauses while dragging / briefly after interaction. */
  useEffect(() => {
    if (reduceMotion || items.length === 0 || !ready) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.048, (now - last) / 1000);
      last = now;
      const setW = setWidthRef.current;
      if (setW > 0 && !draggingRef.current && Date.now() >= pauseUntilRef.current) {
        if (animRef.current == null) {
          offsetRef.current = wrapOffset(offsetRef.current + AUTO_PX_PER_SEC * dt, setW);
          applyTransform();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion, items.length, ready, applyTransform]);

  const pauseAuto = useCallback((ms = RESUME_AFTER_MS) => {
    pauseUntilRef.current = Date.now() + ms;
  }, []);

  const nudge = useCallback(
    (dir: -1 | 1) => {
      pauseAuto(6000);
      const card = setRef.current?.querySelector<HTMLElement>("[data-rail-card]");
      const stepPx = card
        ? card.offsetWidth + RAIL_GAP_PX
        : (viewportRef.current?.clientWidth ?? 240) * 0.5;
      const setW = setWidthRef.current || 1;
      if (animRef.current != null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      const from = offsetRef.current;
      const to = from + dir * stepPx;
      const start = performance.now();
      const stepAnim = (now: number) => {
        const t = Math.min(1, (now - start) / ARROW_EASE_MS);
        offsetRef.current = wrapOffset(from + (to - from) * easeOutCubic(t), setW);
        applyTransform();
        if (t < 1) animRef.current = requestAnimationFrame(stepAnim);
        else {
          animRef.current = null;
          offsetRef.current = wrapOffset(offsetRef.current, setW);
          applyTransform();
        }
      };
      animRef.current = requestAnimationFrame(stepAnim);
    },
    [applyTransform, pauseAuto],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      draggingRef.current = true;
      movedRef.current = false;
      dragStartXRef.current = e.clientX;
      dragStartOffsetRef.current = offsetRef.current;
      pauseAuto(10_000);
      if (animRef.current != null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    },
    [pauseAuto],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - dragStartXRef.current;
      if (Math.abs(dx) > 8) {
        if (!movedRef.current) {
          movedRef.current = true;
          try {
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          } catch {
            /* ignore */
          }
        }
        offsetRef.current = wrapOffset(
          dragStartOffsetRef.current - dx,
          setWidthRef.current || 1,
        );
        applyTransform();
      }
    },
    [applyTransform],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      pauseAuto(RESUME_AFTER_MS);
      window.setTimeout(() => {
        movedRef.current = false;
      }, 0);
    },
    [pauseAuto],
  );

  if (items.length === 0) return null;

  return (
    <div className="tm-rail-stage relative">
      {/* Desktop nudge arrows */}
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => nudge(-1)}
        className="tm-rail-nav-btn tm-rail-nav-btn--prev"
      >
        <Chevron dir="left" />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => nudge(1)}
        className="tm-rail-nav-btn tm-rail-nav-btn--next"
      >
        <Chevron dir="right" />
      </button>

      <div
        ref={viewportRef}
        className="tm-rail-viewport relative overflow-hidden"
        style={{ touchAction: "pan-y", cursor: reduceMotion ? "grab" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseEnter={() => pauseAuto(8000)}
        onPointerEnter={() => pauseAuto(8000)}
        onMouseLeave={() => pauseAuto(600)}
        onPointerLeave={() => pauseAuto(600)}
      >
        <div
          ref={trackRef}
          className="flex w-max will-change-transform"
          style={{ transform: "translate3d(0,0,0)", backfaceVisibility: "hidden" }}
        >
          {Array.from({ length: copies }, (_, c) => (
            <div
              key={`set-${c}`}
              ref={c === 0 ? setRef : undefined}
              className="flex shrink-0 items-stretch"
              style={{ gap: RAIL_GAP_PX }}
              aria-hidden={c !== 0}
            >
              {items.map((item, i) => (
                <div key={`${getKey(item)}-${c}`} data-rail-card className={`${RAIL_SLOT}`}>
                  {renderCard(item, i)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Deals rail ───────────────────────────────────────────────────────────── */

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
      (d) => d.is_active && isDealActiveOnDate(d, today) && (d.image_url || (d.images && d.images.length)),
    );
    // Featured first, then newest — a balanced, pretty strip.
    const featured = live.filter((d) => d.is_featured);
    const rest = live.filter((d) => !d.is_featured);
    return [...featured, ...rest].slice(0, 16);
  }, [deals]);

  if (visible.length === 0) return null;

  return (
    <section aria-label={title} className="tm-rail">
      <RailHeading
        icon={<span aria-hidden>⚡</span>}
        title={title}
        moreLabel="More deals"
        moreHref={moreHref}
      />
      <RailMarquee
        items={visible}
        getKey={(d) => d.id}
        renderCard={(deal) => (
          <DealCard
            deal={deal}
            compact
            priority={false}
            onOpen={() => {
              setOpenDeal(deal);
              trackProductView({
                id: dealToProduct(deal).id,
                name: deal.title,
                price: Number(deal.price) || 0,
                imageUrl: getDealImages(deal)[0] ?? deal.image_url ?? null,
                shopId: deal.shop_id,
                shopName: deal.shop_name,
                category: null,
              });
            }}
          />
        )}
      />
      {openDeal ? <DealQuickView deal={openDeal} onClose={() => setOpenDeal(null)} /> : null}
    </section>
  );
}

/* ── Top products rail ────────────────────────────────────────────────────── */

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
  const router = useRouter();
  const { addToast } = useToast();
  const { addItem } = useCart();

  const productsQuery = useMarketplaceProducts({
    sort: "popular",
    limit: 20,
    availableOnly: true,
  });

  const products = useMemo(() => {
    const all = productsQuery.data ?? [];
    return all
      .filter((p) => !myShopId || p.shop_id !== myShopId)
      .slice(0, 14);
  }, [productsQuery.data, myShopId]);

  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [quickView, setQuickView] = useState<MarketplaceProduct | null>(null);
  const [orderIntent, setOrderIntent] = useState<ProductOrderIntent | null>(null);
  const [orderShop, setOrderShop] = useState<Shop | null>(null);

  /* Live product favourites (DB for signed-in, localStorage for guests). */
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

  const shopPickFor = useCallback(
    (p: MarketplaceProduct): Pick<Shop, "id" | "name" | "whatsapp_number"> => ({
      id: p.shop_id,
      name: p.shop_name || "Store",
      whatsapp_number: p.shop_whatsapp || "",
    }),
    [],
  );

  const openQuickView = useCallback(
    (product: Product) => {
      const full = (products.find((p) => p.id === product.id) ??
        product) as MarketplaceProduct;
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
    [products],
  );

  const handleProductClick = useCallback(
    (product: Product) => {
      if (product.is_available === false) return;
      openQuickView(product);
    },
    [openQuickView],
  );

  const handleAddToCart = useCallback(
    (product: Product) => {
      if (product.is_available === false) {
        addToast("This product is unavailable.", "error");
        return;
      }
      if (customerVariantGroups(product.variants).length > 0) {
        openQuickView(product);
        return;
      }
      const full = (products.find((p) => p.id === product.id) ??
        product) as MarketplaceProduct;
      addItem(full, shopPickFor(full), 1);
      addToast(`"${full.name}" added to cart`, "success");
    },
    [addItem, addToast, openQuickView, shopPickFor, products],
  );

  /** Direct order — resolve the full shop first, then open WhatsApp checkout. */
  const handleOrder = useCallback(
    async (intent: ProductOrderIntent) => {
      const product = intent.product;
      const full = (products.find((p) => p.id === product.id) ??
        product) as MarketplaceProduct;
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
    [addItem, addToast, products],
  );

  const handleOrderFromCard = useCallback(
    (product: Product) => {
      if (product.is_available === false) {
        addToast("This product is unavailable.", "error");
        return;
      }
      if (customerVariantGroups(product.variants).length > 0) {
        openQuickView(product);
        return;
      }
      void handleOrder({ product, quantity: 1 });
    },
    [addToast, handleOrder, openQuickView],
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
        await toggleFavorite(
          product.id,
          "product",
          product.name || "Product",
          product.image_url ?? undefined,
        );
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

  const handleShopClick = useCallback(
    (product: { shop_id?: string }) => {
      if (product.shop_id) router.push(`/shop/${product.shop_id}`);
    },
    [router],
  );

  if (productsQuery.isLoading || products.length === 0) return null;

  const quickViewShop = quickView ? shopPickFor(quickView) : null;

  return (
    <>
      <section aria-label={title} className="tm-rail">
        <RailHeading
          icon={<span aria-hidden>🔥</span>}
          title={title}
          moreLabel="More products"
          moreHref={moreHref}
        />
        <RailMarquee
          items={products}
          getKey={(p) => p.id}
          renderCard={(product) => (
            <ProductCard
              product={product}
              compact
              isFavorite={favorites.has(product.id)}
              isPinned={false}
              categoryLabel={undefined}
              showShopMeta
              offerContext={null}
              priority={false}
              onProductClick={() => handleProductClick(product)}
              onAddToCart={() => handleAddToCart(product)}
              onOrder={() => handleOrderFromCard(product)}
              onFavoriteToggle={() =>
                void handleFavorite(product, !favorites.has(product.id))
              }
              onShopClick={handleShopClick}
            />
          )}
        />
      </section>

      {quickView && quickViewShop && (
        <QuickViewModal
          product={quickView}
          shop={quickViewShop}
          onClose={() => setQuickView(null)}
          isWishlisted={favorites.has(quickView.id)}
          onWishlistToggle={() =>
            void handleFavorite(quickView, !favorites.has(quickView.id))
          }
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
