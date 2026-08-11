"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
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
}

const SLOT =
  "w-[calc(50%-0.25rem)] shrink-0 snap-start sm:w-[calc(33.333%-0.333rem)] lg:w-[calc(25%-0.375rem)]";

const AUTO_PX_PER_SEC = 22;
const RESUME_AFTER_MS = 3500;

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

export default function FeaturedDealsStrip({
  deals,
  dateKey,
  preferFeatured = true,
  title = "Featured deals",
  seeAllHref = "/deals",
  limit = 12,
  className = "",
  getOfferTags,
}: FeaturedDealsStripProps) {
  const day = dateKey ?? toPkDateKey();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pauseUntilRef = useRef(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [openDeal, setOpenDeal] = useState<ShopDeal | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

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

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(max > 4 && el.scrollLeft < max - 4);
  }, []);

  const pauseAuto = useCallback((ms = RESUME_AFTER_MS) => {
    pauseUntilRef.current = Date.now() + ms;
  }, []);

  const scrollByCard = useCallback(
    (dir: -1 | 1) => {
      const el = scrollerRef.current;
      if (!el) return;
      pauseAuto(6000);
      const card = el.querySelector<HTMLElement>("[data-deal-slot]");
      const step = card ? card.offsetWidth + 8 : el.clientWidth * 0.5;
      const max = el.scrollWidth - el.clientWidth;
      let next = el.scrollLeft + dir * step;
      if (next > max + 2) next = 0;
      if (next < -2) next = max;
      el.scrollTo({ left: next, behavior: "smooth" });
    },
    [pauseAuto],
  );

  useEffect(() => {
    if (reduceMotion || visible.length < 2) return;
    const el = scrollerRef.current;
    if (!el) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (Date.now() >= pauseUntilRef.current) {
        const max = el.scrollWidth - el.clientWidth;
        if (max > 8) {
          el.scrollLeft += AUTO_PX_PER_SEC * dt;
          if (el.scrollLeft >= max - 1) el.scrollLeft = 0;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible.length, day, reduceMotion]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();
    const onScroll = () => updateArrows();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateArrows) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
    };
  }, [updateArrows, visible.length]);

  const onUserScrollIntent = useCallback(() => {
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

  const showArrows = visible.length > 1;

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
                onClick={() => scrollByCard(-1)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Chevron dir="left" />
              </button>
              <button
                type="button"
                aria-label="Next deals"
                onClick={() => scrollByCard(1)}
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
        {showArrows ? (
          <>
            <button
              type="button"
              aria-label="Scroll deals left"
              onClick={() => scrollByCard(-1)}
              className={`absolute left-0.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-zinc-800 shadow-md ring-1 ring-zinc-200/80 backdrop-blur transition dark:bg-zinc-900/95 dark:text-zinc-100 dark:ring-zinc-700 ${
                canPrev ? "opacity-100" : "opacity-40"
              }`}
            >
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              aria-label="Scroll deals right"
              onClick={() => scrollByCard(1)}
              className={`absolute right-0.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-zinc-800 shadow-md ring-1 ring-zinc-200/80 backdrop-blur transition dark:bg-zinc-900/95 dark:text-zinc-100 dark:ring-zinc-700 ${
                canNext ? "opacity-100" : "opacity-40"
              }`}
            >
              <Chevron dir="right" />
            </button>
          </>
        ) : null}

        <div
          ref={scrollerRef}
          onPointerDown={onUserScrollIntent}
          onTouchStart={onUserScrollIntent}
          onWheel={onUserScrollIntent}
          className="tm-deals-scroller -mx-3 flex snap-x snap-proximity items-stretch gap-2 overflow-x-auto overscroll-x-contain px-3 pb-1 scrollbar-none sm:mx-0 sm:px-8"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {visible.map((deal, i) => (
            <div key={deal.id} data-deal-slot className={`${SLOT} flex`}>
              <DealCard
                deal={deal}
                compact
                priority={i < 2}
                offerTags={getOfferTags?.(deal.shop_id) ?? []}
                onOpen={() => {
                  pauseAuto(8000);
                  setOpenDeal(deal);
                }}
              />
            </div>
          ))}
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
