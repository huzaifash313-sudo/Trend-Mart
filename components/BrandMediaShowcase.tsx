"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Brand video + Instagram-style image carousel (homepage)       */
/*                                                                            */
/*  - Promo reel: always looping muted autoplay while in view                 */
/*  - Image carousel: auto-advance, swipe, arrows, Instagram-style dots       */
/*  - Creatives already include headline text — no extra overlays             */
/* -------------------------------------------------------------------------- */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BRAND_HERO_SLIDES,
  BRAND_PROMO_VIDEO,
  type BrandSlide,
} from "@/lib/brandMedia";

const AUTO_MS = 4200;
const SWIPE_THRESHOLD = 48;

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === "left" ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  );
}

function BrandVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      video.pause();
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!video) return;
        if (entry.isIntersecting) {
          video.play().catch(() => {
            /* autoplay blocked — still show poster frame */
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (failed) return null;

  return (
    <div ref={wrapRef} className="tm-brand-video">
      <video
        ref={videoRef}
        className="tm-brand-video-el"
        src={BRAND_PROMO_VIDEO}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="TrendMart brand promo"
        onError={() => setFailed(true)}
      />
      <div className="tm-brand-video-glow" aria-hidden />
    </div>
  );
}

function InstagramCarousel({ slides }: { slides: BrandSlide[] }) {
  const total = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const widthRef = useRef(1);
  const trackRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      widthRef.current = entry.contentRect.width || 1;
    });
    ro.observe(el);
    widthRef.current = el.offsetWidth || 1;
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (paused || total <= 1 || reduceMotion.current) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % total);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused, total, index]);

  const goTo = useCallback(
    (i: number) => setIndex(((i % total) + total) % total),
    [total],
  );
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    setDragging(true);
    setPaused(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (startX.current == null) return;
    setDragX(e.clientX - startX.current);
  };

  const onPointerUp = () => {
    if (startX.current == null) {
      setDragging(false);
      return;
    }
    if (dragX > SWIPE_THRESHOLD) goPrev();
    else if (dragX < -SWIPE_THRESHOLD) goNext();
    startX.current = null;
    setDragX(0);
    setDragging(false);
    window.setTimeout(() => setPaused(false), 1800);
  };

  const offset =
    dragging && dragX !== 0
      ? `translateX(calc(-${index * 100}% + ${(dragX / widthRef.current) * 100}%))`
      : `translateX(-${index * 100}%)`;

  if (total === 0) return null;

  return (
    <div
      className="tm-brand-carousel group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="TrendMart highlights"
    >
      <div
        ref={trackRef}
        className="tm-brand-carousel-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="tm-brand-carousel-track"
          style={{
            transform: offset,
            transitionDuration: dragging ? "0ms" : "520ms",
          }}
        >
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              className="tm-brand-slide"
              aria-hidden={i !== index}
              aria-label={`Slide ${i + 1} of ${total}`}
            >
              <Link
                href={slide.href}
                className="tm-brand-slide-link"
                tabIndex={i === index ? 0 : -1}
                draggable={false}
                onClick={(e) => {
                  if (Math.abs(dragX) > 8) e.preventDefault();
                }}
              >
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 72rem"
                  priority={i === 0}
                  quality={92}
                  draggable={false}
                />
              </Link>
            </div>
          ))}
        </div>
      </div>

      {total > 1 ? (
        <>
          <button
            type="button"
            className="tm-brand-nav tm-brand-nav--prev"
            aria-label="Previous slide"
            onClick={goPrev}
          >
            <Chevron dir="left" />
          </button>
          <button
            type="button"
            className="tm-brand-nav tm-brand-nav--next"
            aria-label="Next slide"
            onClick={goNext}
          >
            <Chevron dir="right" />
          </button>

          {/* Instagram-style progress dots */}
          <div className="tm-brand-dots" role="tablist" aria-label="Slides">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Go to slide ${i + 1}`}
                className={`tm-brand-dot${i === index ? " is-active" : ""}`}
                onClick={() => {
                  goTo(i);
                  setPaused(true);
                  window.setTimeout(() => setPaused(false), 1800);
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function BrandMediaShowcase({
  className = "",
}: {
  className?: string;
}) {
  return (
    <section
      aria-label="TrendMart highlights"
      className={`tm-brand-showcase ${className}`.trim()}
    >
      <div className="tm-brand-showcase-head">
        <h2 className="tm-section-title tm-section-title--sm">Discover TrendMart</h2>
        <p className="tm-brand-showcase-sub">Swipe · tap · explore</p>
      </div>

      <BrandVideo />
      <InstagramCarousel slides={BRAND_HERO_SLIDES} />
    </section>
  );
}
