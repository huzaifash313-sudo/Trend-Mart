"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import type { Story } from "@/types";
import { fetchActiveStories, deleteStory, recordStoryView } from "@/services/storyService";
import { getSafeImageUrl } from "@/services/storageService";
import { markStoryViewed, sortStoriesUnseenFirst, formatStoryViewCount } from "@/lib/storyViewed";
import { patchStoryViewCount } from "@/lib/cacheBus";
import { useConfirm } from "@/components/ConfirmProvider";
import { useToast } from "@/components/Toast";

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

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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

function EyeIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Compact "time ago" (WhatsApp-style: 5m · 2h · 1d). */
function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-PK", { day: "numeric", month: "short" });
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
/*  Stories Viewer — WhatsApp/Instagram-style                                  */
/* -------------------------------------------------------------------------- */

interface StoriesViewerProps {
  initialIndex?: number;
  /** Prefer parent-sorted list so tray order matches viewer */
  stories?: Story[];
  /** The merchant's own shop id — enables "Delete my story" in the viewer. */
  myShopId?: string | null;
  onClose: () => void;
}

const STORY_DURATION_MS = 5500;
/** A press shorter than this is a tap; longer is a hold-to-pause. */
const TAP_MAX_MS = 300;
const SWIPE_THRESHOLD = 50;

/**
 * WhatsApp/Instagram: progress + counter are per shop ring, not the whole tray.
 * Flat list stays ordered by tray groups (contiguous same shop_id).
 */
function getShopSegment(stories: Story[], index: number) {
  const current = stories[index];
  if (!current?.shop_id) {
    return {
      groupStart: index,
      localIndex: 0,
      groupLength: 1,
      groupStories: current ? [current] : [],
    };
  }
  let start = index;
  while (start > 0 && stories[start - 1]?.shop_id === current.shop_id) start -= 1;
  let end = index;
  while (end < stories.length - 1 && stories[end + 1]?.shop_id === current.shop_id) {
    end += 1;
  }
  const groupStories = stories.slice(start, end + 1);
  return {
    groupStart: start,
    localIndex: index - start,
    groupLength: groupStories.length,
    groupStories,
  };
}

export default function StoriesViewer({
  initialIndex = 0,
  stories: storiesProp,
  myShopId,
  onClose,
}: StoriesViewerProps) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { addToast } = useToast();
  const [stories, setStories] = useState<Story[]>(storiesProp ?? []);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(!storiesProp?.length);
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);
  /** Local view counts so the badge updates live after a successful ping. */
  const [viewCounts, setViewCounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const s of storiesProp ?? []) {
      if (s.id) init[s.id] = Math.max(0, Number(s.view_count) || 0);
    }
    return init;
  });
  const recordedViewsRef = useRef<Set<string>>(new Set());

  const storiesRef = useRef<Story[]>([]);
  const currentIndexRef = useRef(initialIndex);
  const onCloseRef = useRef(onClose);
  /** Elapsed ms of the current story — lets pause/resume continue in place. */
  const elapsedRef = useRef(0);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const movedRef = useRef(false);
  /** Suppresses the synthetic click that follows a touch hold/swipe. */
  const suppressClickRef = useRef(false);

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
    elapsedRef.current = 0;
    setProgress(0);
    setPaused(false);
    if (currentIndexRef.current >= total - 1) {
      onCloseRef.current();
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  }, []);

  const goBack = useCallback(() => {
    const total = storiesRef.current.length;
    if (total === 0) return;
    elapsedRef.current = 0;
    setProgress(0);
    setPaused(false);
    if (currentIndexRef.current > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, []);

  useEffect(() => {
    if (storiesProp && storiesProp.length > 0) {
      setStories(storiesProp);
      setCurrentIndex(Math.min(Math.max(0, initialIndex), storiesProp.length - 1));
      setLoading(false);
      setViewCounts((prev) => {
        const next = { ...prev };
        for (const s of storiesProp) {
          if (!s.id) continue;
          const incoming = Math.max(0, Number(s.view_count) || 0);
          next[s.id] = Math.max(next[s.id] ?? 0, incoming);
        }
        return next;
      });
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
          setViewCounts(() => {
            const init: Record<string, number> = {};
            for (const s of sorted) {
              if (s.id) init[s.id] = Math.max(0, Number(s.view_count) || 0);
            }
            return init;
          });
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

  /* Mark current story as viewed (local "seen") + ping unique view count.
   * Merchants viewing their own story do NOT increment the counter. */
  useEffect(() => {
    const story = stories[currentIndex];
    if (!story?.id) return;
    markStoryViewed(story.id);

    const isOwn = Boolean(myShopId && story.shop_id === myShopId);
    if (isOwn) return;
    if (recordedViewsRef.current.has(story.id)) return;
    recordedViewsRef.current.add(story.id);

    void recordStoryView(story.id).then((count) => {
      if (typeof count !== "number") return;
      setViewCounts((prev) => ({ ...prev, [story.id]: count }));
      patchStoryViewCount(story.id, count);
      window.dispatchEvent(new Event("trendsmart:stories-updated"));
    });
  }, [stories, currentIndex, myShopId]);

  /* Delete the merchant's OWN story from the viewer (WhatsApp-style) */
  const handleDeleteOwnStory = useCallback(async () => {
    const story = storiesRef.current[currentIndexRef.current];
    if (!story || deletingStoryId) return;
    const ok = await confirm({
      title: "Delete story?",
      message: "Your story will be removed from the homepage immediately.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!ok) return;
    setDeletingStoryId(story.id);
    const result = await deleteStory(story.id);
    setDeletingStoryId(null);
    if (result.success) {
      const remaining = storiesRef.current.filter((s) => s.id !== story.id);
      if (remaining.length === 0) {
        onCloseRef.current();
        return;
      }
      // Stay on the same index but clamp so the next story fills the screen.
      const nextIndex = Math.min(currentIndexRef.current, remaining.length - 1);
      elapsedRef.current = 0;
      setProgress(0);
      setStories(remaining);
      setCurrentIndex(nextIndex);
      window.dispatchEvent(new Event("trendsmart:stories-updated"));
      addToast("Story deleted.", "success");
    } else {
      addToast(result.error, "error");
    }
  }, [confirm, addToast, deletingStoryId]);

  /* Preload the next story's image so transitions feel instant */
  useEffect(() => {
    const next = stories[currentIndex + 1];
    if (next?.image_url) {
      const img = new Image();
      img.src = getSafeImageUrl(next.image_url, "product");
    }
  }, [stories, currentIndex]);

  /* Progress timer — pauses in place, resumes from the exact same spot */
  useEffect(() => {
    if (loading || stories.length === 0) return;

    if (paused) {
      elapsedRef.current = Math.min(elapsedRef.current, STORY_DURATION_MS);
      return;
    }

    setProgress(Math.min(elapsedRef.current / STORY_DURATION_MS, 1));
    const start = Date.now() - elapsedRef.current;

    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      elapsedRef.current = elapsed;
      const pct = Math.min(elapsed / STORY_DURATION_MS, 1);
      if (pct >= 1) {
        clearInterval(timer);
        elapsedRef.current = 0;
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

  /* ── Touch: hold to pause, swipe or tap to navigate ──────────────────── */

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
    touchStartTimeRef.current = Date.now();
    movedRef.current = false;
    setPaused(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    const dx = Math.abs(t.clientX - touchStartXRef.current);
    const dy = Math.abs(t.clientY - touchStartYRef.current);
    if (dx > 12 || dy > 12) movedRef.current = true;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const held = Date.now() - touchStartTimeRef.current;
      const dx = t.clientX - touchStartXRef.current;
      const dy = t.clientY - touchStartYRef.current;
      setPaused(false);

      const suppressClick = () => {
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 600);
      };

      // Swipe left/right wins over everything.
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        suppressClick();
        if (dx < 0) advance();
        else goBack();
        return;
      }

      // Moved or held too long → treat as a scroll/hold, no navigation.
      if (movedRef.current || held >= TAP_MAX_MS) {
        suppressClick();
      }
      // Otherwise it's a quick tap — let the click handler navigate.
    },
    [advance, goBack],
  );

  /* Tap zones: left third → previous, right two thirds → next */
  const handleTapZones = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width / 3) goBack();
      else advance();
    },
    [advance, goBack],
  );

  /* Keyboard: arrows, Escape, Space toggles pause */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") advance();
      else if (e.key === "ArrowLeft") goBack();
      else if (e.key === "Escape") onClose();
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [advance, goBack, onClose]);

  // Auto-close once the list resolves empty — as an effect, not during render,
  // so we never update the parent component while it's still rendering.
  useEffect(() => {
    if (!loading && stories.length === 0) {
      onCloseRef.current();
    }
  }, [loading, stories.length]);

  if (!loading && stories.length === 0) {
    return null;
  }

  const current = stories[currentIndex];
  const shopLabel = current?.shop_name?.trim() || "TrendsMart Store";
  const isOwnStory = Boolean(myShopId && current?.shop_id === myShopId);
  const viewCount = current
    ? viewCounts[current.id] ?? Math.max(0, Number(current.view_count) || 0)
    : 0;
  const initial = shopLabel.charAt(0).toUpperCase();
  const segment = getShopSegment(stories, currentIndex);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black">
      {loading && (
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      )}

      {!loading && current && (
        <div
          className="relative flex h-full w-full max-w-lg select-none flex-col"
          onClick={handleTapZones}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseEnter={() => {
            // Hover-pause only on pointer devices — mobile synthesizes
            // mouse events on tap and would otherwise freeze the story.
            if (window.matchMedia("(hover: hover)").matches) setPaused(true);
          }}
          onMouseLeave={() => {
            if (window.matchMedia("(hover: hover)").matches) setPaused(false);
          }}
        >
          {/* Paused indicator */}
          {paused && (
            <div className="absolute left-1/2 top-11 z-20 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white backdrop-blur-md">
              Paused
            </div>
          )}

          {/* Progress segments — per shop only (WhatsApp-style), not whole tray */}
          <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">
            {segment.groupStories.map((s, i) => (
              <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-75 ease-linear"
                  style={{
                    width:
                      i < segment.localIndex
                        ? "100%"
                        : i === segment.localIndex
                          ? `${progress * 100}%`
                          : "0%",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Header — shop + View shop directly under (WhatsApp-adjacent) */}
          <div className="absolute left-3 right-3 top-6 z-20 flex flex-col gap-2 pt-1">
            <div className="flex items-center gap-2.5">
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
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-white drop-shadow">
                    {shopLabel}
                  </p>
                  {current.created_at ? (
                    <span className="shrink-0 rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] font-semibold text-white/80 backdrop-blur-sm">
                      {timeAgo(current.created_at)}
                    </span>
                  ) : null}
                </div>
                {!isOwnStory ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                      router.push(`/shop/${current.shop_id}`);
                    }}
                    className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
                  >
                    <ShoppingBagIcon />
                    View shop
                  </button>
                ) : null}
              </div>
              {myShopId && current.shop_id === myShopId ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteOwnStory();
                  }}
                  disabled={deletingStoryId === current.id}
                  className="rounded-full bg-black/35 p-2 text-white backdrop-blur-sm transition hover:bg-rose-600/80 disabled:opacity-50"
                  aria-label="Delete my story"
                  title="Delete story"
                >
                  {deletingStoryId === current.id ? (
                    <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <TrashIcon />
                  )}
                </button>
              ) : null}
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
          </div>

          {/* Media */}
          <div className="flex flex-1 items-center justify-center px-2 pb-28 pt-24">
            <div className="flex h-full max-h-[78vh] w-full items-center justify-center overflow-hidden rounded-2xl bg-zinc-950/40">
              <StoryImage story={current} />
            </div>
          </div>

          {/* Bottom — WhatsApp-style centered caption + counter */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-5 pb-6 pt-20">
            <div className="flex flex-col items-center gap-3">
              {current.caption?.trim() ? (
                <p className="max-w-[92%] text-center text-[15px] font-medium leading-snug text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] line-clamp-4">
                  {current.caption.trim()}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-black/40 px-2.5 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                  {segment.localIndex + 1} / {segment.groupLength}
                </div>
                {isOwnStory ? (
                  <div
                    className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm"
                    title={`${viewCount} ${viewCount === 1 ? "view" : "views"}`}
                    aria-label={`${viewCount} ${viewCount === 1 ? "view" : "views"}`}
                  >
                    <EyeIcon />
                    <span>
                      {formatStoryViewCount(viewCount)}
                      {viewCount === 1 ? " view" : " views"}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
