"use client";

import { useMemo, useRef, useState, useEffect, useCallback, type PointerEvent } from "react";
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
   * `home` — one card wide, short cards, small inter-card gap,
   * extra space between marquee loop copies. Deals/products keep `default`.
   */
  variant?: "default" | "home";
}

/** ~2 cards on mobile, ~3 tablet, ~4 desktop */
const SLOT_DEFAULT =
  "w-[calc(50%-0.25rem)] shrink-0 sm:w-[calc(33.333%-0.333rem)] lg:w-[calc(25%-0.375rem)]";

/** One full card on home (matches strip viewport; next card only after scroll) */
const SLOT_HOME =
  "w-[calc(100vw-2.75rem)] shrink-0 sm:w-[min(24rem,calc(100%-1.5rem))] lg:w-[min(26rem,calc(100%-2rem))]";

/** Slow continuous marquee (px/sec) — e-commerce shelf feel */
const AUTO_PX_PER_SEC = 36;
const RESUME_AFTER_MS = 2800;
const ARROW_EASE_MS = 420;
const CARD_GAP_PX = 8;
const HOME_CARD_GAP_PX = 12;
const HOME_LOOP_GAP_PX = 28;

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

/**
 * True continuous shelf: GPU translate3d marquee (duplicated track),
 * drag/swipe, arrow nudges, pause-on-touch, seamless loop.
 */
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
  const isHome = variant === "home";
  const slotClass = isHome ? SLOT_HOME : SLOT_DEFAULT;
  const cardGapPx = isHome ? HOME_CARD_GAP_PX : CARD_GAP_PX;
  const day = dateKey ?? toPkDateKey();
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

  const visible = useMemo(() => {
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

  // Need enough cards for a convincing loop — duplicate in render
  const loopable = visible.length >= 1;
  const copies = visible.length === 1 ? 4 : visible.length === 2 ? 3 : 2;

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
    const x = -offsetRef.current;
    track.style.transform = `translate3d(${x}px, 0, 0)`;
  }, []);

  const measure = useCallback(() => {
    const setEl = setRef.current;
    if (!setEl) return;
    // One full loop = first set width (+ seam gap between duplicated copies on home)
    const seam = isHome ? HOME_LOOP_GAP_PX : 0;
    setWidthRef.current = setEl.offsetWidth + seam;
    setReady(setWidthRef.current > 0);
    applyTransform();
  }, [applyTransform, isHome]);

  useEffect(() => {
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (setRef.current) ro?.observe(setRef.current);
    if (viewportRef.current) ro?.observe(viewportRef.current);
    return () => ro?.disconnect();
  }, [measure, visible, copies]);

  const pauseAuto = useCallback((ms = RESUME_AFTER_MS) => {
    pauseUntilRef.current = Date.now() + ms;
  }, []);

  // Continuous GPU marquee
  useEffect(() => {
    if (reduceMotion || !loopable || !ready) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.048, (now - last) / 1000);
      last = now;

      const setW = setWidthRef.current;
      if (setW > 0 && !draggingRef.current && Date.now() >= pauseUntilRef.current) {
        // Cancel any arrow tween while auto-running
        if (animRef.current == null) {
          offsetRef.current = wrapOffset(offsetRef.current + AUTO_PX_PER_SEC * dt, setW);
          applyTransform();
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion, loopable, ready, applyTransform, day, visible.length]);

  const nudge = useCallback(
    (dir: -1 | 1) => {
      pauseAuto(5000);
      const setEl = setRef.current;
      const card = setEl?.querySelector<HTMLElement>("[data-deal-slot]");
      const stepPx = card
        ? card.offsetWidth + cardGapPx
        : (viewportRef.current?.clientWidth ?? 160) * (isHome ? 0.92 : 0.5);
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
    [applyTransform, pauseAuto, cardGapPx, isHome],
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
      const setW = setWidthRef.current;
      offsetRef.current = wrapOffset(dragStartOffsetRef.current - dx, setW || 1);
      applyTransform();
    },
    [applyTransform],
  );

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    pauseAuto(RESUME_AFTER_MS);
  }, [pauseAuto]);

  if (visible.length === 0) return null;

  const quickProduct = openDeal ? dealToQuickProduct(openDeal) : null;
  const quickShop: Pick<Shop, "id" | "name" | "whatsapp_number"> | null = openDeal
    ? {
        id: openDeal.shop_id,
        name: openDeal.shop_name || "Store",
        whatsapp_number: openDeal.shop_whatsapp || "",
      }
    : null;

  const showArrows = visible.length >= 1;
  const renderSet = (keyPrefix: string, isMeasureSet: boolean) => (
    <div
      ref={isMeasureSet ? setRef : undefined}
      className={`flex shrink-0 items-stretch ${isHome ? "gap-3" : "gap-2"}`}
      aria-hidden={!isMeasureSet}
    >
      {visible.map((deal, i) => (
        <div key={`${keyPrefix}-${deal.id}`} data-deal-slot className={`${slotClass} flex`}>
          <DealCard
            deal={deal}
            compact
            density={isHome ? "home" : "default"}
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
          {showArrows ? (
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
          ) : null}
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
            className={`flex w-max will-change-transform ${isHome ? "gap-7" : ""}`}
            style={{
              transform: "translate3d(0,0,0)",
              backfaceVisibility: "hidden",
            }}
          >
            {Array.from({ length: copies }, (_, copyIdx) =>
              renderSet(`c${copyIdx}`, copyIdx === 0),
            )}
          </div>
        </div>
      </div>

      {openDeal && quickProduct && quickShop ? (
        <QuickViewModal
          product={quickProduct}
          shop={quickShop}
          onClose={() => setOpenDeal(null)}
        />
      ) : null}
    </section>
  );
}
