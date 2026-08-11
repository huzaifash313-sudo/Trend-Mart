"use client";

import {
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
  type PointerEvent,
} from "react";
import Link from "next/link";
import DealCard from "@/components/DealCard";
import QuickViewModal from "@/components/QuickViewModal";
import {
  isDealActiveOnDate,
  toPkDateKey,
  type ShopDeal,
} from "@/lib/dealSchedule";
import { getDealImages } from "@/lib/productImages";
import type { Product, Shop } from "@/types";

interface FeaturedDealsStripProps {
  deals: ShopDeal[];
  dateKey?: string | null;
  preferFeatured?: boolean;
  title?: string;
  seeAllHref?: string;
  limit?: number;
  className?: string;
  getOfferTags?: (shopId: string) => string[];
  /**
   * `home` — one full deal at a time, snap-shift (pause → slide → pause).
   * Products/other pages keep continuous shelf marquee.
   */
  variant?: "default" | "home";
}

/** ~2 cards on mobile, ~3 tablet, ~4 desktop (products strip) */
const SLOT_DEFAULT =
  "w-[calc(50%-0.25rem)] shrink-0 sm:w-[calc(33.333%-0.333rem)] lg:w-[calc(25%-0.375rem)]";

const AUTO_PX_PER_SEC = 36;
const RESUME_AFTER_MS = 2800;
const ARROW_EASE_MS = 420;
const CARD_GAP_PX = 8;

/** Home snap shelf: hold full card(s), then shift to next */
const HOME_HOLD_MS = 3200;
const HOME_SLIDE_MS = 520;
const HOME_GAP_PX = 10;

function useHomePerView() {
  const [perView, setPerView] = useState(1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1280) setPerView(5);
      else if (w >= 1024) setPerView(4);
      else if (w >= 768) setPerView(3);
      else if (w >= 640) setPerView(2);
      else setPerView(1);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

function dealToQuickProduct(deal: ShopDeal): Product {
  const gallery = getDealImages(deal);
  const cover = gallery[0] ?? deal.image_url ?? null;
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
    images: gallery,
    is_available: true,
    currency: "PKR",
    created_at: deal.created_at,
  } as Product;
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

function useVisibleDeals(
  deals: ShopDeal[],
  day: string,
  preferFeatured: boolean,
  limit: number,
) {
  return useMemo(() => {
    const live = deals.filter((d) => d.is_active && isDealActiveOnDate(d, day));
    if (!preferFeatured) return live.slice(0, limit);

    const featured = live.filter((d) => d.is_featured);
    const rest = live.filter((d) => !d.is_featured);
    const rank = (a: ShopDeal, b: ShopDeal) => {
      const ai = a.image_url || (a.images && a.images.length) ? 1 : 0;
      const bi = b.image_url || (b.images && b.images.length) ? 1 : 0;
      if (bi !== ai) return bi - ai;
      return 0;
    };
    featured.sort(rank);
    rest.sort(rank);
    return [...featured, ...rest].slice(0, limit);
  }, [deals, day, preferFeatured, limit]);
}

function QuickDealModal({
  deal,
  onClose,
}: {
  deal: ShopDeal | null;
  onClose: () => void;
}) {
  if (!deal) return null;
  const product = dealToQuickProduct(deal);
  const shop: Pick<Shop, "id" | "name" | "whatsapp_number"> = {
    id: deal.shop_id,
    name: deal.shop_name || "Store",
    whatsapp_number: deal.shop_whatsapp || "",
  };
  return <QuickViewModal product={product} shop={shop} onClose={onClose} />;
}

/* -------------------------------------------------------------------------- */
/*  Home: snap-shift carousel — 1 mobile / 2–5 tablet+laptop                  */
/* -------------------------------------------------------------------------- */

function HomeShiftShelf({
  deals,
  title,
  seeAllHref,
  getOfferTags,
  className,
}: {
  deals: ShopDeal[];
  title: string;
  seeAllHref: string;
  getOfferTags?: (shopId: string) => string[];
  className?: string;
}) {
  const count = deals.length;
  const perView = useHomePerView();
  const canSlide = count > perView;
  const [index, setIndex] = useState(0);
  const [openDeal, setOpenDeal] = useState<ShopDeal | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [instant, setInstant] = useState(false);
  const [stepPx, setStepPx] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);

  // Enough clones so the last window never looks empty while sliding
  const trackDeals = useMemo(() => {
    if (count === 0) return [];
    if (!canSlide) return deals;
    return [...deals, ...deals.slice(0, perView)];
  }, [deals, count, canSlide, perView]);

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
  }, [deals, perView]);

  const measure = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const slot = vp.querySelector<HTMLElement>("[data-home-slot]");
    if (!slot) return;
    setStepPx(slot.offsetWidth + HOME_GAP_PX);
  }, []);

  useEffect(() => {
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (viewportRef.current) ro?.observe(viewportRef.current);
    return () => ro?.disconnect();
  }, [measure, trackDeals, perView]);

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
    }, reduceMotion ? 0 : HOME_SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [index, count, canSlide, reduceMotion]);

  // Auto: hold → snap next → hold…
  useEffect(() => {
    if (reduceMotion || paused || !canSlide || openDeal) return;
    const t = window.setTimeout(() => go(1), HOME_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [index, reduceMotion, paused, canSlide, openDeal, go, progressKey]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!canSlide) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragging.current = true;
    moved.current = false;
    dragStartX.current = e.clientX;
    setPaused(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    if (Math.abs(e.clientX - dragStartX.current) > 10) moved.current = true;
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
    setPaused(false);
    setProgressKey((k) => k + 1);
  };

  if (count === 0) return null;

  const activeDot = ((index % count) + count) % count;
  const slotBasis = `calc((100% - ${(perView - 1) * HOME_GAP_PX}px) / ${perView})`;

  const pauseThenResume = () => {
    setPaused(true);
    window.setTimeout(() => setPaused(false), 5000);
  };

  return (
    <section aria-label={title} className={`tm-home-deals ${className ?? ""}`}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="tm-home-deals-pulse" aria-hidden />
          <h2 className="truncate text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[0.95rem]">
            {title}
          </h2>
          <span className="tm-home-deals-sponsored hidden sm:inline">Premium</span>
        </div>
        <Link href={seeAllHref} className="tm-home-deals-all">
          All deals →
        </Link>
      </div>

      <div className="tm-home-deals-stage relative overflow-hidden rounded-2xl">
        {canSlide ? (
          <div className="tm-home-deals-nav" aria-label="Deal navigation">
            <button
              type="button"
              aria-label="Previous deal"
              className="tm-home-deals-nav-btn"
              onClick={() => {
                go(-1);
                pauseThenResume();
              }}
            >
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              aria-label="Next deal"
              className="tm-home-deals-nav-btn"
              onClick={() => {
                go(1);
                pauseThenResume();
              }}
            >
              <Chevron dir="right" />
            </button>
          </div>
        ) : null}

        <div
          ref={viewportRef}
          className={`relative overflow-hidden ${canSlide ? "tm-home-deals-viewport" : ""}`}
          style={{ touchAction: "pan-y" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onMouseEnter={() => canSlide && setPaused(true)}
          onMouseLeave={() => {
            if (!canSlide) return;
            setPaused(false);
            setProgressKey((k) => k + 1);
          }}
        >
          <div
            className="flex will-change-transform"
            style={{
              gap: HOME_GAP_PX,
              transform: `translate3d(-${canSlide && stepPx ? index * stepPx : 0}px, 0, 0)`,
              transition:
                reduceMotion || instant
                  ? "none"
                  : `transform ${HOME_SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          >
            {trackDeals.map((deal, i) => (
              <div
                key={`${deal.id}-${i}`}
                data-home-slot
                className="shrink-0"
                style={{ flex: `0 0 ${slotBasis}`, width: slotBasis, maxWidth: slotBasis }}
                aria-hidden={canSlide ? i < activeDot || i >= activeDot + perView : false}
              >
                <DealCard
                  deal={deal}
                  compact
                  density="home"
                  priority={i < perView}
                  offerTags={getOfferTags?.(deal.shop_id) ?? []}
                  onOpen={() => {
                    if (moved.current) return;
                    setPaused(true);
                    setOpenDeal(deal);
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {canSlide && !reduceMotion && !paused && !openDeal ? (
          <div key={progressKey} className="tm-home-deals-progress mt-2" aria-hidden>
            <span
              className="tm-home-deals-progress-bar"
              style={{ animationDuration: `${HOME_HOLD_MS}ms` }}
            />
          </div>
        ) : (
          <div className="mt-2 h-0.5" aria-hidden />
        )}
      </div>

      <QuickDealModal
        deal={openDeal}
        onClose={() => {
          setOpenDeal(null);
          setPaused(false);
          setProgressKey((k) => k + 1);
        }}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Default: continuous marquee (products page etc.)                          */
/* -------------------------------------------------------------------------- */

function MarqueeShelf({
  deals,
  title,
  seeAllHref,
  getOfferTags,
  className,
}: {
  deals: ShopDeal[];
  title: string;
  seeAllHref: string;
  getOfferTags?: (shopId: string) => string[];
  className?: string;
}) {
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

  const [openDeal, setOpenDeal] = useState<ShopDeal | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [ready, setReady] = useState(false);

  const copies = deals.length === 1 ? 4 : deals.length === 2 ? 3 : 2;
  const loopable = deals.length >= 1;

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

  const measure = useCallback(() => {
    const setEl = setRef.current;
    if (!setEl) return;
    setWidthRef.current = setEl.offsetWidth;
    setReady(setWidthRef.current > 0);
    applyTransform();
  }, [applyTransform]);

  useEffect(() => {
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (setRef.current) ro?.observe(setRef.current);
    if (viewportRef.current) ro?.observe(viewportRef.current);
    return () => ro?.disconnect();
  }, [measure, deals, copies]);

  const pauseAuto = useCallback((ms = RESUME_AFTER_MS) => {
    pauseUntilRef.current = Date.now() + ms;
  }, []);

  useEffect(() => {
    if (reduceMotion || !loopable || !ready) return;
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
  }, [reduceMotion, loopable, ready, applyTransform, deals.length]);

  const nudge = useCallback(
    (dir: -1 | 1) => {
      pauseAuto(5000);
      const setEl = setRef.current;
      const card = setEl?.querySelector<HTMLElement>("[data-deal-slot]");
      const stepPx = card
        ? card.offsetWidth + CARD_GAP_PX
        : (viewportRef.current?.clientWidth ?? 160) * 0.5;
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
    (e: PointerEvent<HTMLDivElement>) => {
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
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [pauseAuto],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - dragStartXRef.current;
      if (Math.abs(dx) > 6) movedRef.current = true;
      offsetRef.current = wrapOffset(dragStartOffsetRef.current - dx, setWidthRef.current || 1);
      applyTransform();
    },
    [applyTransform],
  );

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    pauseAuto(RESUME_AFTER_MS);
  }, [pauseAuto]);

  if (deals.length === 0) return null;

  const renderSet = (keyPrefix: string, isMeasureSet: boolean) => (
    <div
      ref={isMeasureSet ? setRef : undefined}
      className="flex shrink-0 items-stretch gap-2"
      aria-hidden={!isMeasureSet}
    >
      {deals.map((deal, i) => (
        <div key={`${keyPrefix}-${deal.id}`} data-deal-slot className={`${SLOT_DEFAULT} flex`}>
          <DealCard
            deal={deal}
            compact
            priority={isMeasureSet && i < 2}
            offerTags={getOfferTags?.(deal.shop_id) ?? []}
            onOpen={() => {
              if (movedRef.current) return;
              pauseAuto(8000);
              setOpenDeal(deal);
            }}
          />
        </div>
      ))}
    </div>
  );

  return (
    <section aria-label={title} className={className}>
      <div className="mb-2 flex items-end justify-between gap-2 px-0.5">
        <h2 className="min-w-0 text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous deals"
              onClick={() => nudge(-1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              aria-label="Next deals"
              onClick={() => nudge(1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Chevron dir="right" />
            </button>
          </div>
          <Link
            href={seeAllHref}
            className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            All deals →
          </Link>
        </div>
      </div>

      <div className="relative">
        <button
          type="button"
          aria-label="Scroll deals left"
          onClick={() => nudge(-1)}
          className="absolute left-0.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-zinc-800 shadow-md ring-1 ring-zinc-200/80 backdrop-blur dark:bg-zinc-900/95 dark:text-zinc-100 dark:ring-zinc-700"
        >
          <Chevron dir="left" />
        </button>
        <button
          type="button"
          aria-label="Scroll deals right"
          onClick={() => nudge(1)}
          className="absolute right-0.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-zinc-800 shadow-md ring-1 ring-zinc-200/80 backdrop-blur dark:bg-zinc-900/95 dark:text-zinc-100 dark:ring-zinc-700"
        >
          <Chevron dir="right" />
        </button>

        <div
          ref={viewportRef}
          className="tm-deals-marquee relative -mx-3 overflow-hidden px-3 sm:mx-0 sm:px-9"
          style={{ touchAction: "pan-y" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            ref={trackRef}
            className="flex w-max will-change-transform"
            style={{ transform: "translate3d(0,0,0)", backfaceVisibility: "hidden" }}
          >
            {Array.from({ length: copies }, (_, copyIdx) =>
              renderSet(`c${copyIdx}`, copyIdx === 0),
            )}
          </div>
        </div>
      </div>

      <QuickDealModal deal={openDeal} onClose={() => setOpenDeal(null)} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Public export                                                             */
/* -------------------------------------------------------------------------- */

export default function FeaturedDealsStrip({
  deals,
  dateKey,
  preferFeatured = true,
  title = "Featured deals",
  seeAllHref = "/deals",
  limit = 12,
  className = "",
  getOfferTags,
  variant = "default",
}: FeaturedDealsStripProps) {
  const day = dateKey ?? toPkDateKey();
  const visible = useVisibleDeals(deals, day, preferFeatured, limit);

  if (visible.length === 0) return null;

  if (variant === "home") {
    return (
      <HomeShiftShelf
        deals={visible}
        title={title}
        seeAllHref={seeAllHref}
        getOfferTags={getOfferTags}
        className={className}
      />
    );
  }

  return (
    <MarqueeShelf
      deals={visible}
      title={title}
      seeAllHref={seeAllHref}
      getOfferTags={getOfferTags}
      className={className}
    />
  );
}
