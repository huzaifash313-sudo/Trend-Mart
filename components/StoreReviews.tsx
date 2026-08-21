"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  fetchReviewsByShopId,
  submitReview,
  replyToReview,
  computeRatingStats,
  fetchReviewSessionContext,
  type ReviewSessionContext,
} from "@/services/reviewService";
import type { Review } from "@/types";
import { formatRelativeTime } from "@/lib/formatters";
import { useToast } from "@/components/Toast";
import { paginateReviews, REVIEW_PAGE_SIZE } from "@/lib/reviewRules";
import { subscribeToReviews, type ReviewPayload } from "@/lib/supabase/realtime";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/* -------------------------------------------------------------------------- */
/*  Star Rating                                                                */
/* -------------------------------------------------------------------------- */

interface StarRatingProps {
  rating: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onChange?: (rating: number) => void;
}

function StarPath() {
  return (
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  );
}

function StarRating({ rating, size = "md", interactive = false, onChange }: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);
  const starClass = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5";
  const display = hoverRating || rating;

  return (
    <div className="inline-flex items-center gap-0.5" role={interactive ? "radiogroup" : "img"} aria-label={`${Number(rating).toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        if (interactive) {
          const filled = display >= star;
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange?.(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="cursor-pointer transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded-sm"
              aria-label={`${star} star${star !== 1 ? "s" : ""}`}
            >
              <svg className={`${starClass} ${filled ? "text-amber-400" : "text-zinc-300 dark:text-zinc-600"}`} viewBox="0 0 20 20" fill="currentColor">
                <StarPath />
              </svg>
            </button>
          );
        }

        // Partial fill for averages (e.g. 4.3)
        const fill = Math.max(0, Math.min(1, display - (star - 1)));
        const pct = Math.round(fill * 100);

        return (
          <span key={star} className={`relative inline-block ${starClass}`} aria-hidden="true">
            <svg className={`${starClass} text-zinc-300 dark:text-zinc-600`} viewBox="0 0 20 20" fill="currentColor">
              <StarPath />
            </svg>
            {pct > 0 ? (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
                <svg className={`${starClass} text-amber-400`} viewBox="0 0 20 20" fill="currentColor">
                  <StarPath />
                </svg>
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function RatingDistributionBar({
  distribution,
  total,
}: {
  distribution: readonly [number, number, number, number, number];
  total: number;
}) {
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[star - 1];
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="flex w-7 shrink-0 items-center justify-end gap-0.5 tabular-nums font-semibold text-zinc-600 dark:text-zinc-400">
              {star}
              <svg className="h-3 w-3 text-amber-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <StarPath />
              </svg>
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Review card + owner reply                                                  */
/* -------------------------------------------------------------------------- */

function ReviewCard({
  review,
  isOwner,
  onReplied,
}: {
  review: Review;
  isOwner: boolean;
  onReplied: (updated: Review) => void;
}) {
  const { addToast } = useToast();
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleReply = async () => {
    if (!reply.trim()) return;
    setSaving(true);
    const result = await replyToReview(review.id, reply);
    if (result.success) {
      addToast("Reply posted.", "success");
      onReplied(result.data);
      setOpen(false);
      setReply("");
    } else {
      addToast(result.error, "error");
    }
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{review.customer_name}</p>
            {review.verified_purchase ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                Verified order
              </span>
            ) : null}
          </div>
          <StarRating rating={review.rating} size="sm" />
        </div>
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
          {review.created_at ? formatRelativeTime(review.created_at) : ""}
        </span>
      </div>
      {review.comment ? (
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{review.comment}</p>
      ) : null}
      {review.merchant_reply ? (
        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Store reply
          </p>
          <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">{review.merchant_reply}</p>
        </div>
      ) : isOwner ? (
        open ? (
          <div className="mt-3 space-y-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Reply"
              className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReply}
                disabled={saving || !reply.trim()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Post reply"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Reply
          </button>
        )
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Write review form                                                          */
/* -------------------------------------------------------------------------- */

function ReviewForm({
  shopId,
  displayName,
  onSubmitted,
}: {
  shopId: string;
  displayName: string;
  onSubmitted: (review: Review) => void;
}) {
  const { addToast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      addToast("Please select a star rating.", "error");
      return;
    }
    setSubmitting(true);
    const result = await submitReview(shopId, displayName, rating, comment);
    if (result.success) {
      addToast("Thank you for your review.", "success");
      onSubmitted(result.data);
      setRating(0);
      setComment("");
    } else {
      addToast(result.error, "error");
    }
    setSubmitting(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Write a review</h3>
      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Your name</label>
        <input
          type="text"
          value={displayName}
          readOnly
          aria-readonly="true"
          className="w-full cursor-not-allowed rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        />
        <p className="mt-1 text-[0.65rem] text-zinc-400">Locked to your account name so reviews stay genuine.</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Rating *</label>
        <div className="flex items-center gap-2">
          <StarRating rating={rating} size="lg" interactive onChange={setRating} />
          {rating > 0 ? <span className="text-xs text-zinc-500">{rating} / 5</span> : null}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Comment (optional)</label>
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience"
          maxLength={500}
          className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Compact summary (shop cards)                                               */
/* -------------------------------------------------------------------------- */

export function StoreReviewsSummary({ shopId, compact = false }: { shopId: string; compact?: boolean }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchReviewsByShopId(shopId).then((result) => {
      if (cancelled) return;
      if (result.success) setReviews(result.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const stats = useMemo(() => computeRatingStats(reviews), [reviews]);
  if (loading) {
    return <div className="h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />;
  }
  if (stats.total === 0) {
    return compact ? <span className="text-xs text-zinc-400">No reviews yet</span> : null;
  }
  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-200/80 bg-amber-50/80 px-1.5 py-0.5 dark:border-amber-500/25 dark:bg-amber-950/40">
        <StarRating rating={stats.average} size="sm" />
        <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          {Number(stats.average).toFixed(1)}
        </span>
        <span className="text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
          ({stats.total})
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-amber-100/80 bg-gradient-to-br from-amber-50/90 via-white to-white p-5 shadow-sm dark:border-amber-900/30 dark:from-amber-950/30 dark:via-zinc-900 dark:to-zinc-900">
      <div className="flex items-center gap-5">
        <div className="min-w-[5.5rem] text-center">
          <p className="text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
            {Number(stats.average).toFixed(1)}
          </p>
          <div className="mt-1.5 flex justify-center">
            <StarRating rating={stats.average} size="sm" />
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {stats.total.toLocaleString()} review{stats.total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <RatingDistributionBar distribution={stats.distribution} total={stats.total} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main store reviews                                                         */
/* -------------------------------------------------------------------------- */

interface StoreReviewsProps {
  shopId: string;
  ownerId?: string | null;
  onReviewSubmitted?: () => void;
}

export default function StoreReviews({ shopId, ownerId, onReviewSubmitted }: StoreReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [session, setSession] = useState<ReviewSessionContext | null>(null);

  const loadReviews = useCallback(async () => {
    const result = await fetchReviewsByShopId(shopId);
    if (result.success) {
      setReviews(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
  }, [shopId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchReviewsByShopId(shopId), fetchReviewSessionContext(shopId, ownerId)]).then(
      ([reviewResult, ctx]) => {
        if (cancelled) return;
        if (reviewResult.success) setReviews(reviewResult.data);
        else setError(reviewResult.error);
        setSession(ctx);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [shopId, ownerId]);

  // Live social proof: reviews posted by other customers while this page is
  // open show up instantly (no refresh needed).
  useEffect(() => {
    let cancelled = false;

    const unsub = subscribeToReviews(shopId, (payload) => {
      const row = (payload as RealtimePostgresChangesPayload<ReviewPayload>).new;
      if (cancelled || !row || !("id" in row)) return;
      const incoming: Review = {
        id: String(row.id),
        shop_id: String(row.shop_id ?? shopId),
        customer_name: String(row.customer_name ?? "Anonymous"),
        rating: Math.min(5, Math.max(1, Number(row.rating) || 0)),
        comment: String(row.comment ?? ""),
        created_at: String(row.created_at ?? new Date().toISOString()),
        user_id: null,
        merchant_reply: "",
        merchant_reply_at: null,
        verified_purchase: false,
      };
      setReviews((prev) => (prev.some((r) => r.id === incoming.id) ? prev : [incoming, ...prev]));
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [shopId]);

  const stats = useMemo(() => computeRatingStats(reviews), [reviews]);
  const paged = useMemo(() => paginateReviews(reviews, page, REVIEW_PAGE_SIZE), [reviews, page]);

  useEffect(() => {
    if (page > paged.totalPages) setPage(paged.totalPages);
  }, [page, paged.totalPages]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Failed to load reviews.{" "}
        <button type="button" onClick={() => void loadReviews()} className="font-semibold underline">
          Try again
        </button>
      </div>
    );
  }

  const isOwner = Boolean(session?.isOwner);

  return (
    <div className="space-y-4">
      {stats.total > 0 ? (
        <div className="rounded-2xl border border-amber-100/80 bg-gradient-to-br from-amber-50/90 via-white to-white p-4 shadow-sm dark:border-amber-900/30 dark:from-amber-950/30 dark:via-zinc-900 dark:to-zinc-900 sm:p-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="min-w-[5rem] text-center sm:min-w-[5.5rem]">
              <p className="text-3xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
                {Number(stats.average).toFixed(1)}
              </p>
              <div className="mt-1.5 flex justify-center">
                <StarRating rating={stats.average} size="sm" />
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                {stats.total.toLocaleString()} review{stats.total !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <RatingDistributionBar distribution={stats.distribution} total={stats.total} />
            </div>
          </div>
        </div>
      ) : null}

      {isOwner ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          You can read customer reviews and reply. Store owners cannot review their own shop.
        </p>
      ) : session?.alreadyReviewed ? (
        <p className="text-xs text-zinc-500">You already reviewed this store. Thank you.</p>
      ) : session?.signedIn && session.canSubmit ? (
        <ReviewForm
          shopId={shopId}
          displayName={session.displayName}
          onSubmitted={(review) => {
            setReviews((prev) => [review, ...prev]);
            setSession((prev) => (prev ? { ...prev, alreadyReviewed: true, canSubmit: false } : prev));
            onReviewSubmitted?.();
          }}
        />
      ) : (
        <p className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Reviews are for customers who received a delivered order from this store.{" "}
          {session?.signedIn ? (
            <span className="font-medium">
              Only the account that placed the order can review it.
            </span>
          ) : (
            <>
              <Link href="/login" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                Sign in
              </Link>{" "}
              with the same account you used at checkout.
            </>
          )}
        </p>
      )}

      {paged.items.length > 0 ? (
        <div className="space-y-3">
          {paged.items.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              isOwner={isOwner}
              onReplied={(updated) =>
                setReviews((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
              }
            />
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-zinc-400">No reviews yet.</p>
      )}

      {paged.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            type="button"
            disabled={!paged.hasPrev}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            Page {paged.page} of {paged.totalPages}
          </span>
          <button
            type="button"
            disabled={!paged.hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
