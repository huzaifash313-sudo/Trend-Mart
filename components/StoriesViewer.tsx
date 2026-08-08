"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import type { Story } from "@/types";
import { fetchActiveStories } from "@/services/storyService";
import { getSafeImageUrl } from "@/services/storageService";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function CloseIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      className="h-8 w-8"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="h-8 w-8"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  StoryImage — handles onError fallback for story images                    */
/* -------------------------------------------------------------------------- */

function StoryImage({ story }: { story: Story }) {
  const [imgError, setImgError] = useState(false);

  const hasImageUrl = story.image_url && story.image_url.trim() !== "";

  if (!hasImageUrl || imgError) {
    return (
      <div className="flex flex-col items-center gap-4 text-white/60">
        <span className="text-6xl">📷</span>
        <p className="text-sm">No image</p>
      </div>
    );
  }

  return (
    <img
      src={getSafeImageUrl(story.image_url, "product")}
      alt=""
      onError={() => setImgError(true)}
      className="max-h-[65vh] w-full rounded-2xl object-contain shadow-2xl"
    />
  );
}

function ShoppingBagIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stories Viewer Component                                                   */
/* -------------------------------------------------------------------------- */

interface StoriesViewerProps {
  initialIndex?: number;
  onClose: () => void;
}

const STORY_DURATION_MS = 5000;

export default function StoriesViewer({
  initialIndex = 0,
  onClose,
}: StoriesViewerProps) {
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);

  /* Use refs for values accessed inside intervals to avoid stale closures */
  const storiesRef = useRef<Story[]>([]);
  const currentIndexRef = useRef(initialIndex);
  const onCloseRef = useRef(onClose);

  /* Sync state to refs (including onClose) */
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    storiesRef.current = stories;
  }, [stories]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  /* ── Advance / goBack (defined early so interval can reference them) ───── */
  const advance = useCallback(() => {
    const total = storiesRef.current.length;
    if (total === 0) return;
    if (currentIndexRef.current >= total - 1) {
      onCloseRef.current();
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
    setProgress(0);
  }, []);

  const goBack = useCallback(() => {
    const total = storiesRef.current.length;
    if (total === 0) return;
    if (currentIndexRef.current > 0) {
      setCurrentIndex((prev) => prev - 1);
    } else {
      setCurrentIndex(total - 1);
    }
    setProgress(0);
  }, []);

  /* ── Fetch stories on mount ───────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await fetchActiveStories();
        if (!cancelled && result.success) {
          setStories(result.data);
          setCurrentIndex(initialIndex);
        }
      } catch {
        // Silently fail — show empty state handled below
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [initialIndex]);

  /* ── Progress timer ───────────────────────────────────────────────────── */
  const startTimeRef = useRef(0);

  /*
   * Progress timer — resets when story index changes.
   * Uses a single interval that self-manages auto-advance.
   */
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
          setCurrentIndex((prev) => prev + 1);
        }
      } else {
        setProgress(pct);
      }
    }, 50);

    return () => clearInterval(timer);
  }, [currentIndex, stories.length, loading, paused]);

  /* ── Touch / click handlers ───────────────────────────────────────────── */
  const touchStartXRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const diff = touchStartXRef.current - e.changedTouches[0].clientX;
      if (diff > 50) advance();
      else if (diff < -50) goBack();
    },
    [advance, goBack],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width / 3) goBack();
      else advance();
    },
    [advance, goBack],
  );

  /* ── Keyboard navigation ──────────────────────────────────────────────── */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") advance();
      else if (e.key === "ArrowLeft") goBack();
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [advance, goBack, onClose]);

  /* ── Close if empty ───────────────────────────────────────────────────── */
  if (!loading && stories.length === 0) {
    onClose();
    return null;
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /*  Render                                                                  */
  /* ──────────────────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-sm">
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
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
          className="relative flex h-full w-full max-w-md flex-col"
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Progress bar row */}
          <div className="absolute left-3 right-3 top-4 z-10 flex gap-1">
            {stories.map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
              >
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-75 ease-linear"
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

          {/* Navigation arrows */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goBack();
            }}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-1 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
            aria-label="Previous story"
          >
            <ChevronLeftIcon />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              advance();
            }}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-1 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
            aria-label="Next story"
          >
            <ChevronRightIcon />
          </button>

          {/* Image */}
          {stories[currentIndex] && (
            <div className="flex flex-1 items-center justify-center px-4 pb-12 pt-16">
              <StoryImage story={stories[currentIndex]} />

              {/* Caption + CTA button */}
              <div className="absolute bottom-12 left-4 right-4 flex flex-col items-center gap-3">
                {stories[currentIndex].caption && (
                  <p className="rounded-xl bg-black/40 px-4 py-2 text-center text-sm text-white backdrop-blur-sm">
                    {stories[currentIndex].caption}
                  </p>
                )}

                {/* Quick CTA: Visit the merchant's store */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                    router.push(`/shop/${stories[currentIndex].shop_id}`);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all hover:bg-emerald-700 hover:shadow-emerald-600/50 active:scale-95"
                >
                  <ShoppingBagIcon />
                  View Store
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
