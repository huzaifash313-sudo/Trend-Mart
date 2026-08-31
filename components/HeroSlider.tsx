"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Interactive Storefront Banner Carousel & Promotional Slider    */
/*                                                                             */
/*  Features:                                                                  */
/*   - Automatic slide transitions with configurable interval                  */
/*   - Touch/swipe navigation for mobile users                                */
/*   - Responsive image scaling with Next.js Image optimization               */
/*   - Direct category/store redirection links                                */
/*   - Dot indicators with animated transitions                               */
/*   - Pause on hover / touch hold                                            */
/*   - Accessible keyboard navigation (left/right arrows)                     */
/*   - Skeleton loading placeholder                                           */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type TouchEvent,
} from "react";
import Link from "next/link";
import Image from "next/image";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface SlideData {
  id: string;
  imageUrl: string;
  altText: string;
  /** Optional heading overlay text */
  heading?: string;
  /** Optional subheading overlay text */
  subheading?: string;
  /** Redirection link — can be a shop page, category search, or external URL */
  linkUrl: string;
  /** Open in new tab for external links */
  openInNewTab?: boolean;
  /** Optional badge label (e.g. "New", "Sale", "Trending") */
  badge?: string;
  /** Optional gradient overlay for text legibility */
  overlayGradient?: string;
}

export interface HeroSliderProps {
  slides: SlideData[];
  /** Auto-advance interval in ms (default: 5000). Set to 0 to disable. */
  autoPlayInterval?: number;
  /** Called when a slide is clicked/tapped (for analytics tracking) */
  onSlideClick?: (slide: SlideData, index: number) => void;
  /** Additional CSS class names */
  className?: string;
  /** Height class — e.g. "h-64", "h-80", "h-96". Default: "h-72 sm:h-80 lg:h-96" */
  heightClass?: string;
  /** Show loading skeleton while slides are being fetched */
  loading?: boolean;
}

/* ─── Icons ────────────────────────────────────────────────────────────────── */

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function HeroSlider({
  slides,
  autoPlayInterval = 5000,
  onSlideClick,
  className = "",
  heightClass = "h-72 sm:h-80 lg:h-96",
  loading = false,
}: HeroSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchDeltaX, setTouchDeltaX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [containerWidth, setContainerWidth] = useState(400);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // rAF batching for touchmove — update the state at most once per animation
  // frame instead of on every high-frequency touchmove event (smoother swipe).
  const rafRef = useRef<number | null>(null);
  const latestDeltaRef = useRef(0);

  const totalSlides = slides.length;

  // Track container width for drag calculations (avoids ref-during-render)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    // Set initial width
    setContainerWidth(el.offsetWidth);
    return () => observer.disconnect();
  }, []);

  // ── Auto-advance logic ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoPlayInterval || totalSlides <= 1 || isPaused) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % totalSlides);
    }, autoPlayInterval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoPlayInterval, totalSlides, isPaused]);

  // ── Navigation handlers ────────────────────────────────────────────────────
  const goTo = useCallback((index: number) => {
    setCurrentIndex((index + totalSlides) % totalSlides);
  }, [totalSlides]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("keydown", handleKeyDown);
      return () => container.removeEventListener("keydown", handleKeyDown);
    }
  }, [goPrev, goNext]);

  // ── Touch / swipe handlers ─────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchDeltaX(0);
    setIsDragging(true);
    setIsPaused(true);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (touchStartX === null) return;
    const currentX = e.touches[0].clientX;
    latestDeltaRef.current = currentX - touchStartX;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setTouchDeltaX(latestDeltaRef.current);
    });
  }, [touchStartX]);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX === null) return;

    const threshold = 50; // Minimum swipe distance in px
    if (touchDeltaX > threshold) {
      goPrev();
    } else if (touchDeltaX < -threshold) {
      goNext();
    }

    setTouchStartX(null);
    setTouchDeltaX(0);
    latestDeltaRef.current = 0;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsDragging(false);
    // Resume auto-play after a short delay
    setTimeout(() => setIsPaused(false), 2000);
  }, [touchStartX, touchDeltaX, goPrev, goNext]);

  // ── Click handler (only fire if not a drag) ────────────────────────────────
  const handleSlideClick = useCallback((slide: SlideData, index: number) => {
    if (Math.abs(touchDeltaX) > 10) return; // Was a swipe, not a click
    onSlideClick?.(slide, index);
  }, [touchDeltaX, onSlideClick]);

  // ── Drag transform for smooth swipe animation ──────────────────────────────
  const dragTransform = useMemo(() => {
    if (!isDragging || touchDeltaX === 0) return "";
    const offsetPercent = (touchDeltaX / Math.max(containerWidth, 1)) * 100;
    return `translateX(calc(-${currentIndex * 100}% + ${offsetPercent}%))`;
  }, [isDragging, touchDeltaX, currentIndex, containerWidth]);

  // ── Empty / loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`relative w-full overflow-hidden rounded-2xl ${heightClass} ${className}`}>
        <div className="h-full w-full animate-pulse bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  if (totalSlides === 0) {
    return (
      <div className={`relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800 ${heightClass} ${className}`}>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No promotions available</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`group relative w-full overflow-hidden rounded-2xl shadow-lg ${heightClass} ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="region"
      aria-roledescription="carousel"
      aria-label="Promotional banner slider"
      tabIndex={0}
    >
      {/* ── Slides Track ─────────────────────────────────────────────────── */}
      <div
        className="flex h-full transition-transform duration-500 ease-out"
        style={{
          transform: isDragging ? dragTransform : `translateX(-${currentIndex * 100}%)`,
          transitionDuration: isDragging ? "0ms" : "500ms",
        }}
      >
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className="relative h-full w-full flex-shrink-0"
            aria-roledescription="slide"
            aria-label={`Slide ${index + 1} of ${totalSlides}: ${slide.altText}`}
          >
            {/* Link wrapper */}
            <Link
              href={slide.linkUrl}
              target={slide.openInNewTab ? "_blank" : undefined}
              rel={slide.openInNewTab ? "noopener noreferrer" : undefined}
              className="block h-full w-full"
              onClick={() => handleSlideClick(slide, index)}
              tabIndex={-1}
              aria-hidden={currentIndex !== index}
            >
              {/* Image */}
              <Image
                src={slide.imageUrl}
                alt={slide.altText}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 80vw"
                priority={index === 0}
                loading={index === 0 ? "eager" : "lazy"}
              />

              {/* Gradient overlay for text contrast */}
              <div
                className="absolute inset-0"
                style={{
                  background: slide.overlayGradient ?? "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.1) 100%)",
                }}
                aria-hidden="true"
              />

              {/* Text overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 lg:p-10">
                {/* Badge */}
                {slide.badge && (
                  <span className="tm-badge-pulse mb-2 inline-block rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-lg">
                    {slide.badge}
                  </span>
                )}

                {/* Heading */}
                {slide.heading && (
                  <h2 className="text-xl font-extrabold text-white drop-shadow-lg sm:text-2xl lg:text-3xl">
                    {slide.heading}
                  </h2>
                )}

                {/* Subheading */}
                {slide.subheading && (
                  <p className="mt-1 max-w-md text-sm text-white/90 drop-shadow-md sm:text-base">
                    {slide.subheading}
                  </p>
                )}

                {/* Explore link indicator */}
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 drop-shadow sm:text-sm">
                  Explore <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {/* ── Navigation Arrows (visible on hover or focus) ────────────────── */}
      {totalSlides > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/80 p-2 text-zinc-700 shadow-lg opacity-0 backdrop-blur-sm transition-all hover:bg-white hover:scale-110 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 group-hover:opacity-100 sm:left-4 sm:p-2.5 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:bg-zinc-900"
            aria-label="Previous slide"
          >
            <ChevronLeftIcon />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/80 p-2 text-zinc-700 shadow-lg opacity-0 backdrop-blur-sm transition-all hover:bg-white hover:scale-110 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 group-hover:opacity-100 sm:right-4 sm:p-2.5 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:bg-zinc-900"
            aria-label="Next slide"
          >
            <ChevronRightIcon />
          </button>
        </>
      )}

      {/* ── Dot Indicators ───────────────────────────────────────────────── */}
      {totalSlides > 1 && (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 sm:bottom-4 sm:gap-2.5">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goTo(index);
              }}
              className={`rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                index === currentIndex
                  ? "h-2.5 w-8 bg-white shadow-md sm:h-3 sm:w-10"
                  : "h-2.5 w-2.5 bg-white/60 hover:bg-white/80 sm:h-3 sm:w-3"
              }`}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === currentIndex ? "true" : undefined}
            />
          ))}
        </div>
      )}

      {/* ── Slide Counter (visible on larger screens) ─────────────────────── */}
      {totalSlides > 1 && (
        <div className="absolute right-4 top-4 z-10 rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100">
          {currentIndex + 1} / {totalSlides}
        </div>
      )}
    </div>
  );
}