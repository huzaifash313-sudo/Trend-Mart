"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Dynamic 24-Hour Stories & Promotional Banner Viewer           */
/*  Prompt 3: Mobile-first Instagram-style stories with touch navigation,     */
/*           auto-advancing progress bars, smooth transitions, and            */
/*           direct call-to-action overlays for products and storefronts.      */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import type { Story } from "@/types";
import { fetchActiveStories } from "@/services/storyService";
import { getSafeImageUrl } from "@/services/storageService";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface StoryViewerProps {
  /** Starting story index. */
  initialIndex?: number;
  /** Filter stories to a specific shop (optional). */
  shopId?: string;
  /** Called when the viewer is closed. */
  onClose: () => void;
}

interface StoryWithMeta extends Story {
  /** CTA type for the story: where does tapping take the user? */
  ctaType?: "shop" | "product" | "url" | "none";
  /** CTA target (shop ID, product ID, or URL). */
  ctaTarget?: string;
}

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function CloseIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ShoppingBagIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.12-5.6A1 1 0 0 1 5.1 3h13.8a1 1 0 0 1 .98.8L21 9" /><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /><path d="M9 21V9h6v12" />
    </svg>
  );
}

function FlashIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  StoryImage — with graceful error fallback and loading state               */
/* -------------------------------------------------------------------------- */

function StoryImage({ story, onLoad }: { story: StoryWithMeta; onLoad?: () => void }) {
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const hasImageUrl = story.image_url && story.image_url.trim() !== "";

  if (!hasImageUrl || imgError) {
    return (
      <div className="flex flex-col items-center gap-4 text-white/50">
        <span className="text-7xl">📷</span>
        <p className="text-xs">Image not available</p>
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
        </div>
      )}
      <img
        src={getSafeImageUrl(story.image_url, "generic")}
        alt={story.caption ?? ""}
        onLoad={() => { setLoaded(true); onLoad?.(); }}
        onError={() => setImgError(true)}
        className="max-h-[70vh] w-full rounded-3xl object-contain shadow-2xl transition-opacity duration-300"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const STORY_DURATION_MS = 5000;
const SWIPE_THRESHOLD = 60;

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function StoryViewer({
  initialIndex = 0,
  shopId,
  onClose,
}: StoryViewerProps) {
  const router = useRouter();

  // ── State ───────────────────────────────────────────────────────────────
  const [stories, setStories] = useState<StoryWithMeta[]>([]);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [imageLoaded, setImageLoaded] = useState(false);

  // ── Refs for stale-closure-proof values ─────────────────────────────────
  const storiesRef = useRef<StoryWithMeta[]>([]);
  const currentIndexRef = useRef(initialIndex);
  const onCloseRef = useRef(onClose);
  const startTimeRef = useRef(0);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const progressRef = useRef(0);

  // Sync to refs
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { storiesRef.current = stories; }, [stories]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { progressRef.current = progress; }, [progress]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const advance = useCallback(() => {
    const total = storiesRef.current.length;
    if (total === 0) return;
    if (currentIndexRef.current >= total - 1) {
      onCloseRef.current();
    } else {
      setDirection("forward");
      setCurrentIndex((prev) => prev + 1);
    }
    setProgress(0);
    setImageLoaded(false);
  }, []);

  const goBack = useCallback(() => {
    const total = storiesRef.current.length;
    if (total === 0) return;
    setDirection("backward");
    if (currentIndexRef.current > 0) {
      setCurrentIndex((prev) => prev - 1);
    } else {
      // Wrap to last story
      setCurrentIndex(total - 1);
    }
    setProgress(0);
    setImageLoaded(false);
  }, []);

  // ── Fetch stories ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = shopId
          ? await (await import("@/services/storyService")).fetchStoriesByShopId(shopId)
          : await fetchActiveStories();

        if (!cancelled && result.success) {
          const enriched: StoryWithMeta[] = (result.data as StoryWithMeta[]).map((s) => ({
            ...s,
            ctaType: (s as StoryWithMeta).ctaType ?? "shop",
            ctaTarget: (s as StoryWithMeta).ctaTarget ?? s.shop_id,
          }));
          setStories(enriched);
          setCurrentIndex(initialIndex);
        }
      } catch {
        // Silent fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [initialIndex, shopId]);

  // ── Auto-advance timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (loading || stories.length === 0 || paused) return;

    startTimeRef.current = Date.now();

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(elapsed / STORY_DURATION_MS, 1);

      if (pct >= 1) {
        clearInterval(timer);
        const total = storiesRef.current.length;
        const idx = currentIndexRef.current;
        if (idx >= total - 1) {
          onCloseRef.current();
        } else {
          setDirection("forward");
          setCurrentIndex((prev) => prev + 1);
          setImageLoaded(false);
        }
      } else {
        setProgress(pct);
      }
    }, 50);

    return () => clearInterval(timer);
  }, [currentIndex, stories.length, loading, paused]);

  // ── Touch / swipe handlers ──────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    setPaused(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // Prevent scrolling on swipe
    const dx = Math.abs(e.touches[0].clientX - touchStartXRef.current);
    const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current);
    if (dx > dy && dx > 20) {
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      setPaused(false);
      const diff = touchStartXRef.current - e.changedTouches[0].clientX;
      if (Math.abs(diff) > SWIPE_THRESHOLD) {
        if (diff > 0) advance();
        else goBack();
      }
    },
    [advance, goBack],
  );

  // ── Click handlers (left/right regions) ─────────────────────────────────
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const half = rect.width / 2;

      if (x < half) goBack();
      else advance();
    },
    [advance, goBack],
  );

  // ── CTA handler ─────────────────────────────────────────────────────────
  const handleCTA = useCallback(
    (e: React.MouseEvent, story: StoryWithMeta) => {
      e.stopPropagation();
      onClose();

      const ctaType = story.ctaType ?? "shop";
      const target = story.ctaTarget ?? story.shop_id;

      setTimeout(() => {
        switch (ctaType) {
          case "product":
            router.push(`/shop/${story.shop_id}?product=${target}`);
            break;
          case "url":
            if (target) window.open(target, "_blank");
            break;
          case "shop":
          default:
            router.push(`/shop/${target || story.shop_id}`);
            break;
        }
      }, 200);
    },
    [onClose, router],
  );

  // ── Keyboard ────────────────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") advance();
      else if (e.key === "ArrowLeft") goBack();
      else if (e.key === "Escape") onClose();
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [advance, goBack, onClose]);

  // ── Auto-close if empty ─────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && stories.length === 0) {
      onClose();
    }
  }, [loading, stories.length, onClose]);

  // ── Compute CTA button label based on story type ────────────────────────
  const currentStory = stories[currentIndex] ?? null;
  const ctaLabel = useMemo(() => {
    if (!currentStory) return "View Store";
    switch (currentStory.ctaType) {
      case "product": return "View Product";
      case "url": return "Learn More";
      case "shop":
      default: return "View Store";
    }
  }, [currentStory]);

  const ctaIcon = useMemo(() => {
    if (!currentStory) return <StoreIcon />;
    switch (currentStory.ctaType) {
      case "product": return <ShoppingBagIcon />;
      case "url": return <FlashIcon />;
      case "shop":
      default: return <StoreIcon />;
    }
  }, [currentStory]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (!loading && stories.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md">
      {/* Close button (top-right, accessible tap target) */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-all hover:bg-white/25 active:scale-95"
        aria-label="Close stories"
      >
        <CloseIcon />
      </button>

      {/* Loading spinner */}
      {loading && (
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      )}

      {/* Story content */}
      {!loading && stories.length > 0 && (
        <div
          className="relative flex h-full w-full max-w-lg flex-col select-none"
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Pause indicator */}
          {paused && (
            <div className="absolute left-6 top-10 z-10 rounded-full bg-white/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white backdrop-blur-md">
              Paused
            </div>
          )}

          {/* Progress bar row */}
          <div className="absolute left-4 right-4 top-4 z-10 flex gap-1">
            {stories.map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
              >
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-75 ease-linear shadow-[0_0_4px_rgba(255,255,255,0.5)]"
                  style={{
                    width:
                      i < currentIndex
                        ? "100%"
                        : i === currentIndex
                          ? `${progress * 100}%`
                          : "0%",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Story count */}
          <div className="absolute left-4 top-10 z-10 rounded-full bg-black/30 px-3 py-1 text-[10px] font-semibold text-white/80 backdrop-blur-sm">
            {currentIndex + 1} / {stories.length}
          </div>

          {/* Navigation arrows (desktop) */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goBack(); }}
            className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/8 p-2 text-white/70 backdrop-blur-sm transition-all hover:bg-white/15 hover:text-white sm:block"
            aria-label="Previous story"
          >
            <ChevronLeftIcon />
          </button>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); advance(); }}
            className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/8 p-2 text-white/70 backdrop-blur-sm transition-all hover:bg-white/15 hover:text-white sm:block"
            aria-label="Next story"
          >
            <ChevronRightIcon />
          </button>

          {/* Image with smooth transition */}
          {currentStory && (
            <div className="relative flex flex-1 items-center justify-center px-4 pb-20 pt-14">
              <div
                className="transition-all duration-300 ease-out"
                style={{
                  transform: `scale(${imageLoaded ? 1 : 0.95})`,
                  opacity: imageLoaded ? 1 : 0,
                }}
              >
                <StoryImage
                  story={currentStory}
                  onLoad={() => setImageLoaded(true)}
                />
              </div>

              {/* Bottom overlay: Caption + CTA */}
              <div className="absolute bottom-10 left-4 right-4 flex flex-col items-center gap-3">
                {/* Caption */}
                {currentStory.caption && (
                  <p className="rounded-2xl bg-black/45 px-5 py-2.5 text-center text-sm font-medium leading-relaxed text-white shadow-lg backdrop-blur-sm">
                    {currentStory.caption}
                  </p>
                )}

                {/* Primary CTA button */}
                <button
                  type="button"
                  onClick={(e) => handleCTA(e, currentStory)}
                  className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all hover:from-emerald-600 hover:to-emerald-700 hover:shadow-emerald-600/50 active:scale-95"
                >
                  {ctaIcon}
                  <span>{ctaLabel}</span>
                  <span className="opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100">→</span>
                </button>

                {/* Timestamp */}
                {currentStory.created_at && (
                  <p className="text-[10px] font-medium text-white/40">
                    {new Date(currentStory.created_at).toLocaleString("en-PK", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}