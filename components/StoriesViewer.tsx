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
import { markStoryViewed, sortStoriesUnseenFirst } from "@/lib/storyViewed";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
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
/*  Story media                                                               */
/* -------------------------------------------------------------------------- */

function StoryImage({ story }: { story: Story }) {
  const [imgError, setImgError] = useState(false);
  const hasImageUrl = story.image_url && story.image_url.trim() !== "";

  if (!hasImageUrl || imgError) {
    return (
      <div className="flex flex-col items-center gap-3 text-white/70">
        <span className="text-5xl">📷</span>
        <p className="text-sm">No image</p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={getSafeImageUrl(story.image_url, "product")}
      alt={story.shop_name || story.caption || "Story"}
      onError={() => setImgError(true)}
      className="max-h-full max-w-full object-contain"
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Stories Viewer                                                            */
/* -------------------------------------------------------------------------- */

interface StoriesViewerProps {
  initialIndex?: number;
  /** Prefer parent-sorted list so tray order matches viewer */
  stories?: Story[];
  onClose: () => void;
}

const STORY_DURATION_MS = 5500;

export default function StoriesViewer({
  initialIndex = 0,
  stories: storiesProp,
  onClose,
}: StoriesViewerProps) {
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>(storiesProp ?? []);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(!storiesProp?.length);

  const storiesRef = useRef<Story[]>([]);
  const currentIndexRef = useRef(initialIndex);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    storiesRef.current = stories;
  }, [stories]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

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
    }
    setProgress(0);
  }, []);

  /* Seed once from parent list, or fetch if none passed */
  useEffect(() => {
    if (storiesProp && storiesProp.length > 0) {
      setStories(storiesProp);
      setCurrentIndex(Math.min(Math.max(0, initialIndex), storiesProp.length - 1));
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const result = await fetchActiveStories();
        if (!cancelled && result.success) {
          const sorted = sortStoriesUnseenFirst(result.data);
          setStories(sorted);
          setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, sorted.length - 1)));
        }
      } catch {
        /* empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // Only on mount — do not reset mid-view when parent re-sorts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Mark current story as viewed */
  useEffect(() => {
    const story = stories[currentIndex];
    if (story?.id) markStoryViewed(story.id);
  }, [stories, currentIndex]);

  /* Progress timer */
  const startTimeRef = useRef(0);
  useEffect(() => {
    if (loading || stories.length === 0 || paused) return;
    startTimeRef.current = Date.now();
    setProgress(0);

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(elapsed / STORY_DURATION_MS, 1);
      if (pct >= 1) {
        clearInterval(timer);
        const total = storiesRef.current.length;
        const idx = currentIndexRef.current;
        if (idx >= total - 1) onCloseRef.current();
        else setCurrentIndex((prev) => prev + 1);
      } else {
        setProgress(pct);
      }
    }, 40);

    return () => clearInterval(timer);
  }, [currentIndex, stories.length, loading, paused]);

  const touchStartXRef = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? 0;
  }, []);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const diff = touchStartXRef.current - (e.changedTouches[0]?.clientX ?? 0);
      if (diff > 50) advance();
      else if (diff < -50) goBack();
    },
    [advance, goBack],
  );

  const handleTapZones = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width / 3) goBack();
      else advance();
    },
    [advance, goBack],
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") advance();
      else if (e.key === "ArrowLeft") goBack();
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [advance, goBack, onClose]);

  if (!loading && stories.length === 0) {
    onClose();
    return null;
  }

  const current = stories[currentIndex];
  const shopLabel = current?.shop_name?.trim() || "TrendMart Store";
  const initial = shopLabel.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black">
      {loading && (
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      )}

      {!loading && current && (
        <div
          className="relative flex h-full w-full max-w-lg flex-col"
          onClick={handleTapZones}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Progress */}
          <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">
            {stories.map((s, i) => (
              <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-75 ease-linear"
                  style={{
                    width:
                      i < currentIndex ? "100%" : i === currentIndex ? `${progress * 100}%` : "0%",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Header — shop name */}
          <div className="absolute left-3 right-3 top-6 z-20 flex items-center gap-2.5 pt-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/30 bg-emerald-600 text-sm font-bold text-white">
              {current.shop_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getSafeImageUrl(current.shop_logo_url, "shop")}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                initial
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white drop-shadow">
                {shopLabel}
              </p>
              {current.caption ? (
                <p className="truncate text-[11px] text-white/75 drop-shadow">
                  {current.caption}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="rounded-full bg-black/35 p-2 text-white backdrop-blur-sm hover:bg-black/50"
              aria-label="Close stories"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Media */}
          <div className="flex flex-1 items-center justify-center px-2 pb-24 pt-20">
            <div className="flex h-full max-h-[78vh] w-full items-center justify-center overflow-hidden rounded-2xl bg-zinc-950/40">
              <StoryImage story={current} />
            </div>
          </div>

          {/* Footer CTA */}
          <div className="absolute bottom-8 left-4 right-4 z-20 flex justify-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
                router.push(`/shop/${current.shop_id}`);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/40 transition hover:bg-emerald-700 active:scale-95"
            >
              <ShoppingBagIcon />
              Visit {shopLabel.length > 18 ? "Store" : shopLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
