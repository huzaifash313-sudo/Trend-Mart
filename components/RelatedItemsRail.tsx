"use client";

/* Related-items strip — seamless infinite loop marquee (last → first, no jump).
   Real item data stays bound per tile; pauses on touch / hover. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { getSafeImageUrl } from "@/services/storageService";
import { formatPrice } from "@/lib/formatters";
import {
  PRODUCT_CARD_IMAGE_QUALITY,
  PRODUCT_CARD_IMAGE_SIZES,
} from "@/lib/imageSizes";
import { shouldSkipHeavyMedia } from "@/lib/mobilePerf";

export type RelatedRailItem = {
  id: string;
  href: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  imageUrl?: string | null;
  shopName?: string | null;
};

const AUTO_PX_PER_SEC = 32;
const RESUME_DELAY_MS = 2400;
const GAP_PX = 6;
const DRAG_CLICK_THRESHOLD_PX = 8;

function wrapOffset(x: number, width: number): number {
  if (width <= 0) return 0;
  let v = x % width;
  if (v < 0) v += width;
  return v;
}

function RelatedTile({ item }: { item: RelatedRailItem }) {
  const src = getSafeImageUrl(item.imageUrl, "product", "card");
  const off =
    item.originalPrice && item.originalPrice > item.price && item.price > 0
      ? Math.max(1, Math.round((1 - item.price / item.originalPrice) * 100))
      : 0;

  return (
    <Link
      href={item.href}
      data-rail-tile
      className="tm-related-tile group flex w-[6.75rem] shrink-0 flex-col overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-sm transition hover:border-emerald-400/80 hover:shadow-md dark:border-zinc-700/80 dark:bg-zinc-900 sm:w-[7.25rem]"
      aria-label={`View ${item.title}`}
    >
      <span className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {src ? (
          <Image
            key={`${item.id}-${src}`}
            src={src}
            alt={item.title}
            fill
            sizes={PRODUCT_CARD_IMAGE_SIZES}
            loading="lazy"
            quality={PRODUCT_CARD_IMAGE_QUALITY}
            unoptimized
            className="object-cover transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-base font-semibold text-zinc-300 dark:text-zinc-600">
            {item.title.trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
        {off > 0 ? (
          <span className="absolute left-1 top-1 rounded bg-rose-500 px-1 py-px text-[8px] font-bold leading-tight text-white">
            {off}%
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0 px-1.5 py-1">
        <span className="line-clamp-2 min-h-[1.7rem] text-[10px] font-bold leading-snug text-zinc-900 dark:text-zinc-50">
          {item.title}
        </span>
        <span className="mt-0.5 flex min-w-0 items-baseline gap-1">
          <span className="whitespace-nowrap text-[11px] font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatPrice(item.price)}
          </span>
          {item.originalPrice && item.originalPrice > item.price ? (
            <span className="whitespace-nowrap text-[9px] tabular-nums text-zinc-400 line-through">
              {formatPrice(item.originalPrice)}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function RailSet({
  items,
  setKey,
}: {
  items: RelatedRailItem[];
  setKey: string;
}) {
  return (
    <div className="flex shrink-0 gap-1.5" style={{ columnGap: GAP_PX }}>
      {items.map((item) => (
        <RelatedTile key={`${setKey}-${item.id}`} item={item} />
      ))}
    </div>
  );
}

export default function RelatedItemsRail({
  title,
  items,
  subtitle,
}: {
  title: string;
  items: RelatedRailItem[];
  subtitle?: string;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const setRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const setWidthRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const onScreenRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  /** Stable fingerprint so list updates remount the loop with fresh data. */
  const dataKey = useMemo(
    () =>
      items
        .map(
          (i) =>
            `${i.id}:${i.price}:${i.imageUrl ?? ""}:${i.title}`,
        )
        .join("|"),
    [items],
  );

  const copies = items.length <= 1 ? 4 : items.length === 2 ? 3 : 2;
  const canLoop = items.length >= 1;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () =>
      setReduceMotion(mq.matches || shouldSkipHeavyMedia());
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  const applyTransform = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
  }, []);

  const measure = useCallback(() => {
    const setEl = setRef.current;
    if (!setEl) return;
    // include trailing gap between duplicated sets
    setWidthRef.current = setEl.offsetWidth + GAP_PX;
    setReady(setWidthRef.current > 8);
    offsetRef.current = wrapOffset(offsetRef.current, setWidthRef.current || 1);
    applyTransform();
  }, [applyTransform]);

  useEffect(() => {
    offsetRef.current = 0;
    setReady(false);
    // wait a frame so duplicated DOM is laid out with latest item images/titles
    const id = requestAnimationFrame(() => measure());
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;
    if (setRef.current) ro?.observe(setRef.current);
    if (viewportRef.current) ro?.observe(viewportRef.current);
    return () => {
      cancelAnimationFrame(id);
      ro?.disconnect();
    };
  }, [measure, dataKey, copies]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreenRef.current = entry.isIntersecting;
      },
      { threshold: 0.08 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [dataKey]);

  const pauseAuto = useCallback((ms = RESUME_DELAY_MS) => {
    pauseUntilRef.current = Date.now() + ms;
  }, []);

  useEffect(() => {
    if (reduceMotion || !canLoop || !ready || items.length < 2) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (
        !onScreenRef.current ||
        document.hidden ||
        draggingRef.current ||
        Date.now() < pauseUntilRef.current
      ) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const setW = setWidthRef.current;
      if (setW <= 0) return;
      offsetRef.current = wrapOffset(
        offsetRef.current + AUTO_PX_PER_SEC * dt,
        setW,
      );
      applyTransform();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion, canLoop, ready, applyTransform, items.length, dataKey]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    draggingRef.current = true;
    dragMovedRef.current = false;
    dragStartXRef.current = e.clientX;
    dragStartOffsetRef.current = offsetRef.current;
    pauseAuto(RESUME_DELAY_MS);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartXRef.current;
    if (Math.abs(dx) > DRAG_CLICK_THRESHOLD_PX) dragMovedRef.current = true;
    const setW = setWidthRef.current || 1;
    offsetRef.current = wrapOffset(dragStartOffsetRef.current - dx, setW);
    applyTransform();
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    pauseAuto(RESUME_DELAY_MS);
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onClickCapture = (e: ReactMouseEvent) => {
    if (dragMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      dragMovedRef.current = false;
    }
  };

  if (!items.length) return null;

  // Static fallback when motion off or too few items to need a loop
  if (reduceMotion || items.length < 2) {
    return (
      <section
        className="border-t border-zinc-100 pt-1.5 dark:border-zinc-800"
        aria-label={title}
      >
        <div className="mb-1 px-0.5">
          <h2 className="text-[12px] font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          {subtitle ? (
            <p className="text-[9px] font-medium leading-tight text-zinc-400 dark:text-zinc-500">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="tm-cat-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => (
            <RelatedTile key={item.id} item={item} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className="border-t border-zinc-100 pt-1.5 dark:border-zinc-800"
      aria-label={title}
    >
      <div className="mb-1 px-0.5">
        <h2 className="text-[12px] font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        {subtitle ? (
          <p className="text-[9px] font-medium leading-tight text-zinc-400 dark:text-zinc-500">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div
        ref={viewportRef}
        className="relative -mx-1 overflow-hidden px-1"
        style={{ touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onPointerEnter={() => pauseAuto(800)}
        onPointerLeave={() => pauseAuto(RESUME_DELAY_MS)}
      >
        <div
          ref={trackRef}
          className="flex w-max will-change-transform"
          style={{ gap: GAP_PX }}
        >
          <div ref={setRef}>
            <RailSet items={items} setKey={`a-${dataKey.slice(0, 24)}`} />
          </div>
          {Array.from({ length: copies - 1 }, (_, i) => (
            <RailSet
              key={`copy-${i}-${dataKey.slice(0, 12)}`}
              items={items}
              setKey={`b${i}-${dataKey.slice(0, 16)}`}
            />
          ))}
        </div>
        {!ready ? (
          <div className="pointer-events-none absolute inset-0 flex gap-1.5 overflow-hidden opacity-60">
            {items.slice(0, 4).map((item) => (
              <RelatedTile key={`ph-${item.id}`} item={item} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
