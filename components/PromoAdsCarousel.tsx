"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Sponsored / Promotional Ads Shelf (Homepage)                  */
/*                                                                             */
/*  Premium auto-scrolling sponsored banner shelf. Uses the exact same         */
/*  carousel engine + visual language as the home "Featured deals" strip       */
/*  (header, hold-and-snap auto-scroll, arrows, progress bar, swipe/pause)     */
/*  so platform-placed ads feel first-class instead of a cropped hero banner.  */
/*                                                                             */
/*   - Fetches only publicly-approved, active, in-date ads                    */
/*   - Fires a best-effort impression ping once per ad per page view          */
/*   - Fires a click ping before navigating away via the ad's link            */
/*   - Banner-friendly 16:9 image slot so the creative shows fully (no more    */
/*     fixed-height hero cropping the image).                                 */
/*   - Renders nothing when there are no live ads (never an empty box).       */
/* -------------------------------------------------------------------------- */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { fetchActiveAds, pingAdImpression, pingAdClick } from "@/services/adsService";
import { demoAdsEnabled, getDemoAdsForPlacement } from "@/lib/demoPromoAds";
import { useMyShop } from "@/lib/queries";
import { getSafeImageUrl, isFallbackUrl } from "@/services/storageService";
import type { PromotionalAd, PromoAdPlacement } from "@/types";

interface PromoAdsCarouselProps {
  placement?: PromoAdPlacement;
  /** Required for store-page ads — only shows banners tied to this shop. */
  shopId?: string | null;
  className?: string;
  /** Hide the "View all" link (e.g. on individual store pages). */
  showViewAll?: boolean;
  /** Tighter shelf on homepage — 2 cards on small phones, shorter media slot via CSS. */
  compact?: boolean;
  /** Override section label (e.g. "Sponsored", "Featured"). */
  sectionLabel?: string;
}

const PLACEMENT_SHELF: Record<
  PromoAdPlacement,
  { label: string; viewAllHref: string }
> = {
  homepage_top: { label: "Sponsored", viewAllHref: "/products" },
  homepage_feed: { label: "Featured", viewAllHref: "/products" },
  products_top: { label: "Featured", viewAllHref: "/products" },
  deals_top: { label: "Featured", viewAllHref: "/deals" },
  store_top: { label: "Featured", viewAllHref: "/products" },
};

function badgeVariantClass(label?: string | null): string {
  const l = (label ?? "Sponsored").toLowerCase();
  if (l.includes("hot") || l.includes("combo")) return "tm-sponsored-badge--hot";
  if (l.includes("limited") || l.includes("flash")) return "tm-sponsored-badge--flash";
  if (l.includes("featured") || l.includes("pick")) return "tm-sponsored-badge--featured";
  if (l.includes("new")) return "tm-sponsored-badge--new";
  if (l.includes("sweet") || l.includes("deal")) return "tm-sponsored-badge--deal";
  if (l.includes("trusted")) return "tm-sponsored-badge--trusted";
  return "";
}

const DEMO_AD_ID_PREFIX = "f0000001-";

function isDemoAdId(id: string): boolean {
  return id.startsWith(DEMO_AD_ID_PREFIX);
}

const HOLD_MS = 5000;
const SLIDE_MS = 520;
const GAP_PX = 12;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** ~1 card on phone (2 when compact), 2 on tablet, 3+ on desktop. */
function usePerView(compact = false) {
  const [perView, setPerView] = useState(compact ? 2 : 1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1280) setPerView(4);
      else if (w >= 1024) setPerView(3);
      else if (w >= 768) setPerView(3);
      else if (w >= 640) setPerView(2);
      else setPerView(compact ? 2 : 1);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [compact]);

  return perView;
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === "left" ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sponsored ad card — full-width banner image + title/subtitle/CTA           */
/* -------------------------------------------------------------------------- */

function SponsoredCard({
  ad,
  priority = false,
  className = "",
}: {
  ad: PromotionalAd;
  priority?: boolean;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const raw = ad.image_url || "";
  const safeSrc =
    !imgError && raw && !isFallbackUrl(raw) ? getSafeImageUrl(raw, "generic") : null;
  const isExternal = /^https?:\/\//i.test(ad.link_url);

  const card = (
    <article
      className={`tm-sponsored-card group relative flex h-full w-full flex-col overflow-hidden ${className}`}
    >
      <div className="tm-sponsored-media relative w-full shrink-0 overflow-hidden">
        {safeSrc ? (
          <Image
            src={safeSrc}
            alt={ad.title}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 24vw"
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            quality={90}
            onError={() => setImgError(true)}
          />
        ) : null}
        {!safeSrc ? (
          <div className="absolute inset-0 tm-sponsored-media-fallback flex items-center justify-center">
            <span className="select-none px-3 text-center text-2xl font-semibold tracking-tight text-white/35">
              {ad.title.charAt(0).toUpperCase()}
            </span>
          </div>
        ) : null}
        <span className={`tm-sponsored-badge absolute left-2.5 top-2.5 ${badgeVariantClass(ad.badge_label)}`}>
          {ad.badge_label?.trim() || "Sponsored"}
        </span>
      </div>

      <div className="tm-sponsored-body flex min-w-0 flex-1 flex-col p-2.5 sm:p-3">
        <h3 className="tm-sponsored-title line-clamp-2" title={ad.title}>
          {ad.title}
        </h3>
        {ad.subtitle ? (
          <p className="tm-sponsored-subtitle line-clamp-2">{ad.subtitle}</p>
        ) : null}
        <span className="tm-sponsored-cta mt-auto inline-flex items-center gap-1 pt-2">
          Explore
          <span aria-hidden>{isExternal ? "↗" : "→"}</span>
        </span>
      </div>
    </article>
  );

  const common = {
    className:
      "block h-full w-full rounded-[1.1rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
    "aria-label": ad.title,
  };

  return isExternal ? (
    <a href={ad.link_url} target="_blank" rel="noopener noreferrer" {...common}>
      {card}
    </a>
  ) : (
    <Link href={ad.link_url} {...common}>
      {card}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shelf — hold-and-snap auto-scroll carousel (same engine as home deals)     */
/* -------------------------------------------------------------------------- */

function SponsoredShelfSkeleton({ className = "" }: { className?: string }) {
  return (
    <section aria-hidden="true" className={`tm-sponsored-shelf ${className}`}>
      <div className="tm-sponsored-shelf-head">
        <div className="h-3.5 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="w-[calc((100%-12px)/2)] shrink-0 overflow-hidden rounded-[1.1rem] border border-zinc-100 bg-white dark:border-zinc-800 dark:bg-[color:var(--tm-surface)] sm:w-[calc((100%-24px)/3)]"
          >
            <div className="tm-sponsored-media animate-pulse bg-gradient-to-br from-teal-50 to-zinc-100 dark:from-zinc-800 dark:to-zinc-700" />
            <div className="space-y-2 p-3">
              <div className="h-3.5 w-4/5 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-3 w-16 animate-pulse rounded bg-emerald-100 dark:bg-emerald-950/40" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SponsoredShelf({
  ads,
  className = "",
  showViewAll = false,
  placement = "homepage_top",
  compact = false,
  sectionLabel,
}: {
  ads: PromotionalAd[];
  className?: string;
  showViewAll?: boolean;
  placement?: PromoAdPlacement;
  compact?: boolean;
  sectionLabel?: string;
}) {
  const count = ads.length;
  const perView = usePerView(compact);
  const canSlide = count > perView;
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [instant, setInstant] = useState(false);
  const [stepPx, setStepPx] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);
  const suppressClick = useRef(false);

  // Enough clones so the last window never looks empty while sliding
  const trackAds = useMemo(() => {
    if (count === 0) return [];
    if (!canSlide) return ads;
    return [...ads, ...ads.slice(0, perView)];
  }, [ads, count, canSlide, perView]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    setIndex(0);
    setProgressKey((k) => k + 1);
  }, [ads, perView]);

  const measure = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const slot = vp.querySelector<HTMLElement>("[data-sponsored-slot]");
    if (!slot) return;
    setStepPx(slot.offsetWidth + GAP_PX);
  }, []);

  useEffect(() => {
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (viewportRef.current) ro?.observe(viewportRef.current);
    return () => ro?.disconnect();
  }, [measure, trackAds, perView]);

  const go = useCallback(
    (dir: -1 | 1) => {
      if (!canSlide || count < 1) return;
      setIndex((i) => {
        if (dir === 1) return i + 1;
        if (i <= 0) return count - 1;
        return i - 1;
      });
      setProgressKey((k) => k + 1);
    },
    [canSlide, count],
  );

  // Seamless wrap after sliding into the cloned tail
  useEffect(() => {
    if (!canSlide) return;
    if (index < count) return;
    const t = window.setTimeout(() => {
      setInstant(true);
      setIndex(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setInstant(false));
      });
    }, reduceMotion ? 0 : SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [index, count, canSlide, reduceMotion]);

  // Auto: hold → snap next → hold…
  useEffect(() => {
    if (reduceMotion || paused || !canSlide) return;
    const t = window.setTimeout(() => go(1), HOLD_MS);
    return () => window.clearTimeout(t);
  }, [index, reduceMotion, paused, canSlide, go, progressKey]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!canSlide) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragging.current = true;
    moved.current = false;
    suppressClick.current = false;
    dragStartX.current = e.clientX;
    setPaused(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    if (Math.abs(e.clientX - dragStartX.current) <= 12) return;
    if (!moved.current) {
      moved.current = true;
      suppressClick.current = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = e.clientX - dragStartX.current;
    const wasDrag = moved.current;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    if (wasDrag && Math.abs(dx) > 48) {
      go(dx < 0 ? 1 : -1);
    }
    // Keep the suppress flag through the synthetic click, then clear.
    window.setTimeout(() => {
      moved.current = false;
      suppressClick.current = false;
    }, 0);
    setPaused(false);
    setProgressKey((k) => k + 1);
  };

  if (count === 0) return null;

  const activeDot = ((index % count) + count) % count;
  const slotBasis = `calc((100% - ${(perView - 1) * GAP_PX}px) / ${perView})`;

  const pauseThenResume = () => {
    setPaused(true);
    window.setTimeout(() => setPaused(false), 5000);
  };

  const shelf = PLACEMENT_SHELF[placement];
  const label = sectionLabel?.trim() || shelf.label;

  return (
    <section aria-label={label} className={`tm-sponsored-shelf ${className ?? ""}`}>
      <div className="tm-sponsored-shelf-head">
        <h2 className="tm-sponsored-shelf-label truncate">{label}</h2>
        {showViewAll && placement !== "store_top" ? (
          <Link href={shelf.viewAllHref} className="tm-home-deals-all shrink-0">
            View all
          </Link>
        ) : null}
      </div>

      <div className="tm-home-deals-stage relative">
        {canSlide ? (
          <>
            <button
              type="button"
              aria-label="Previous sponsored"
              className="tm-home-deals-nav-btn tm-home-deals-nav-btn--prev"
              onClick={() => {
                go(-1);
                pauseThenResume();
              }}
            >
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              aria-label="Next sponsored"
              className="tm-home-deals-nav-btn tm-home-deals-nav-btn--next"
              onClick={() => {
                go(1);
                pauseThenResume();
              }}
            >
              <Chevron dir="right" />
            </button>
          </>
        ) : null}

        <div
          ref={viewportRef}
          className={`tm-home-deals-viewport relative overflow-hidden ${canSlide ? "tm-home-deals-viewport--nav" : ""}`}
          style={{ touchAction: "pan-y" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onMouseEnter={() => canSlide && setPaused(true)}
          onPointerEnter={() => canSlide && setPaused(true)}
          onMouseLeave={() => {
            if (!canSlide) return;
            setPaused(false);
            setProgressKey((k) => k + 1);
          }}
          onPointerLeave={() => {
            if (!canSlide) return;
            setPaused(false);
            setProgressKey((k) => k + 1);
          }}
        >
          <div
            className="flex will-change-transform"
            style={{
              gap: GAP_PX,
              transform: `translate3d(-${canSlide && stepPx ? index * stepPx : 0}px, 0, 0)`,
              transition:
                reduceMotion || instant
                  ? "none"
                  : `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          >
            {trackAds.map((ad, i) => (
              <div
                key={`${ad.id}-${i}`}
                data-sponsored-slot
                className="shrink-0"
                style={{ flex: `0 0 ${slotBasis}`, width: slotBasis, maxWidth: slotBasis }}
                aria-hidden={canSlide ? i < activeDot || i >= activeDot + perView : false}
                onClick={(e) => {
                  // A drag must never trigger the underlying ad navigation.
                  if (moved.current || suppressClick.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  if (!isDemoAdId(ad.id)) pingAdClick(ad.id);
                }}
              >
                <SponsoredCard ad={ad} priority={i < perView} />
              </div>
            ))}
          </div>
        </div>

        {canSlide && !reduceMotion && !paused ? (
          <div key={progressKey} className="tm-home-deals-progress" aria-hidden>
            <span
              className="tm-home-deals-progress-bar"
              style={{ animationDuration: `${HOLD_MS}ms` }}
            />
          </div>
        ) : (
          <div className="tm-home-deals-progress tm-home-deals-progress--idle" aria-hidden />
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Public export                                                              */
/* -------------------------------------------------------------------------- */

export default function PromoAdsCarousel({
  placement = "homepage_top",
  shopId = null,
  className = "",
  showViewAll = false,
  compact = false,
  sectionLabel,
}: PromoAdsCarouselProps) {
  const [ads, setAds] = useState<PromotionalAd[]>([]);
  const [loading, setLoading] = useState(true);
  const pingedRef = useRef<Set<string>>(new Set());
  // A merchant never sees their own sponsored ad in the marketplace carousel.
  const myShopQuery = useMyShop();
  const myShopId = myShopQuery.data?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await fetchActiveAds(placement, shopId);
      if (cancelled) return;

      const hideOwnShop = Boolean(myShopId && placement !== "store_top");

      function applyFilter(list: PromotionalAd[]): PromotionalAd[] {
        return hideOwnShop ? list.filter((ad) => ad.shop_id !== myShopId) : list;
      }

      let resolved: PromotionalAd[] = [];
      if (result.success) {
        resolved = applyFilter(result.data);
      }

      if (resolved.length === 0 && demoAdsEnabled()) {
        resolved = applyFilter(getDemoAdsForPlacement(placement, shopId));
      }

      setAds(resolved);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [placement, shopId, myShopId]);

  // Fire one impression ping per ad, the first time it's loaded on this page view.
  useEffect(() => {
    for (const ad of ads) {
      if (isDemoAdId(ad.id)) continue;
      if (!pingedRef.current.has(ad.id)) {
        pingedRef.current.add(ad.id);
        pingAdImpression(ad.id);
      }
    }
  }, [ads]);

  if (!loading && ads.length === 0) return null;

  if (loading) return <SponsoredShelfSkeleton className={className} />;

  return (
    <SponsoredShelf
      ads={ads}
      className={className}
      showViewAll={showViewAll}
      placement={placement}
      compact={compact}
      sectionLabel={sectionLabel}
    />
  );
}
