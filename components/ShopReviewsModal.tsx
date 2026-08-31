"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  fetchReviewsByShopId,
  submitReview,
  computeRatingStats,
  fetchReviewSessionContext,
  type ReviewSessionContext,
} from "@/services/reviewService";
import type { Review } from "@/types";
import { formatRelativeTime } from "@/lib/formatters";
import { paginateReviews, REVIEW_PAGE_SIZE } from "@/lib/reviewRules";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Shop Reviews Modal                                             */
/*  Global popup opened from shop cards: summary + distribution + all reviews  */
/*  (scrollable) + write-a-review form for customers with a delivered order.   */
/* -------------------------------------------------------------------------- */

interface ShopReviewsModalProps {
  shop: { id: string; name: string };
  onClose: () => void;
}

function StarPath() {
  return (
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  );
}

function Stars({ value, size = "h-4 w-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${Number(value).toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, value - (star - 1)));
        const pct = Math.round(fill * 100);
        return (
          <span key={star} className={`relative inline-block ${size}`} aria-hidden="true">
            <svg className={`${size} text-zinc-300 dark:text-zinc-600`} viewBox="0 0 20 20" fill="currentColor">
              <StarPath />
            </svg>
            {pct > 0 ? (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
                <svg className={`${size} text-amber-400`} viewBox="0 0 20 20" fill="currentColor">
                  <StarPath />
                </svg>
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function InteractiveStars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="rounded-sm transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
        >
          <svg className={`h-8 w-8 ${display >= star ? "text-amber-400" : "text-zinc-300 dark:text-zinc-600"}`} viewBox="0 0 20 20" fill="currentColor">
            <StarPath />
          </svg>
        </button>
      ))}
    </div>
  );
}

function DistributionBar({
  distribution,
  total,
}: {
  distribution: readonly [number, number, number, number, number];
  total: number;
}) {
  return (
    <div className="space-y-1">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[star - 1];
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="flex w-6 shrink-0 items-center justify-end gap-0.5 tabular-nums font-semibold text-zinc-600 dark:text-zinc-400">
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
            <span className="w-7 shrink-0 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewItem({ review }: { review: Review }) {
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
          <div className="mt-0.5">
            <Stars value={review.rating} size="h-3.5 w-3.5" />
          </div>
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
      ) : null}
    </div>
  );
}

function WriteReviewForm({
  shopId,
  displayName,
  onSubmitted,
}: {
  shopId: string;
  displayName: string;
  onSubmitted: (review: Review) => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError("Please select a star rating.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await submitReview(shopId, displayName, rating, comment);
    setSubmitting(false);
    if (result.success) {
      onSubmitted(result.data);
      setRating(0);
      setComment("");
    } else {
      setError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Write a review</h4>
      <div className="flex items-center justify-center">
        <InteractiveStars value={rating} onChange={setRating} />
      </div>
      {rating > 0 && (
        <p className="text-center text-xs font-medium text-amber-600 dark:text-amber-400">
          {rating === 1 ? "Poor" : rating === 2 ? "Fair" : rating === 3 ? "Good" : rating === 4 ? "Great" : "Excellent!"}
        </p>
      )}
      <textarea
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your experience (optional)"
        maxLength={500}
        className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit review"}
      </button>
      <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">
        Reviews are locked to your account name. Only customers with a delivered order from this store can review.
      </p>
    </form>
  );
}

export default function ShopReviewsModal({ shop, onClose }: ShopReviewsModalProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<ReviewSessionContext | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchReviewsByShopId(shop.id), fetchReviewSessionContext(shop.id)]).then(
      ([reviewResult, ctx]) => {
        if (cancelled) return;
        if (reviewResult.success) setReviews(reviewResult.data);
        setSession(ctx);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [shop.id]);

  const stats = useMemo(() => computeRatingStats(reviews), [reviews]);
  const paged = useMemo(() => paginateReviews(reviews, page, REVIEW_PAGE_SIZE), [reviews, page]);

  useEffect(() => {
    if (page > paged.totalPages) setPage(paged.totalPages);
  }, [page, paged.totalPages]);

  const handleSubmitted = useCallback(
    (review: Review) => {
      setReviews((prev) => [review, ...prev]);
      setSession((prev) => (prev ? { ...prev, alreadyReviewed: true, canSubmit: false } : prev));
      setPage(1);
    },
    [],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const isOwner = Boolean(session?.isOwner);

  const modal = (
    <div
      className="fixed inset-0 z-[180] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Reviews for ${shop.name}`}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-zinc-50 shadow-2xl sm:rounded-2xl dark:bg-[color:var(--tm-surface)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">
              Ratings & reviews
            </p>
            <h3 className="truncate text-lg font-bold text-zinc-900 dark:text-zinc-100">{shop.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close reviews"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              {stats.total > 0 ? (
                <div className="rounded-2xl border border-amber-100/80 bg-gradient-to-br from-amber-50/90 via-white to-white p-4 shadow-sm dark:border-amber-900/30 dark:from-amber-950/30 dark:via-zinc-900 dark:to-zinc-900">
                  <div className="flex items-center gap-4">
                    <div className="min-w-[4.5rem] text-center">
                      <p className="text-3xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                        {Number(stats.average).toFixed(1)}
                      </p>
                      <div className="mt-1 flex justify-center">
                        <Stars value={stats.average} size="h-3.5 w-3.5" />
                      </div>
                      <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        {stats.total.toLocaleString()} review{stats.total !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <DistributionBar distribution={stats.distribution} total={stats.total} />
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Write review */}
              {isOwner ? (
                <p className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  You can read customer reviews here. Store owners cannot review their own shop.
                </p>
              ) : session?.alreadyReviewed ? (
                <p className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  You already reviewed this store. Thank you! ⭐
                </p>
              ) : session?.signedIn && session.canSubmit ? (
                <WriteReviewForm
                  shopId={shop.id}
                  displayName={session.displayName}
                  onSubmitted={handleSubmitted}
                />
              ) : (
                <p className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Reviews are for customers who received a delivered order from this store.{" "}
                  <Link href="/login" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                    Sign in
                  </Link>{" "}
                  with the same account you used at checkout.
                </p>
              )}

              {/* Reviews list */}
              {paged.items.length > 0 ? (
                <div className="space-y-3">
                  {paged.items.map((review) => (
                    <ReviewItem key={review.id} review={review} />
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-zinc-400">
                  No reviews yet — be the first to rate this store.
                </p>
              )}

              {/* Pagination */}
              {paged.totalPages > 1 ? (
                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={!paged.hasPrev}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
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
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
