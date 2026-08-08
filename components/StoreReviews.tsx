"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchReviewsByShopId, submitReview, computeRatingStats } from "@/services/reviewService";
import type { Review } from "@/types";
import { formatRelativeTime } from "@/lib/formatters";
import { useToast } from "@/components/Toast";

/* -------------------------------------------------------------------------- */
/*  Star Rating Display                                                        */
/* -------------------------------------------------------------------------- */

interface StarRatingProps {
  rating: number; // 0-5, supports half-stars (e.g., 3.5)
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onChange?: (rating: number) => void;
}

function StarRating({ rating, size = "md", interactive = false, onChange }: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-7 w-7",
  };

  const starClass = sizeClasses[size];

  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const fillLevel = hoverRating
          ? star <= hoverRating
            ? "full"
            : hoverRating === star - 0.5
              ? "half"
              : "empty"
          : star <= Math.floor(rating)
            ? "full"
            : star === Math.ceil(rating) && rating % 1 !== 0
              ? "half"
              : "empty";

        return (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => {
              if (interactive) {
                // Toggle: if clicking the same full star, set to half; if same half, set to 0
                if (rating === star) {
                  onChange?.(star - 0.5);
                } else if (rating === star - 0.5) {
                  onChange?.(0);
                } else {
                  onChange?.(star);
                }
              }
            }}
            onMouseEnter={() => interactive && setHoverRating(star)}
            onMouseLeave={() => interactive && setHoverRating(0)}
            onDoubleClick={() => {
              if (interactive) {
                // Double-click on a star for half-star
                if (rating === star) {
                  onChange?.(star - 0.5);
                }
              }
            }}
            className={`${interactive ? "cursor-pointer transition-transform hover:scale-110" : "cursor-default"} focus:outline-none`}
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          >
            {/* Full star */}
            {fillLevel === "full" && (
              <svg className={`${starClass} text-amber-400`} viewBox="0 0 20 20" fill="currentColor">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            )}
            {/* Half star */}
            {fillLevel === "half" && (
              <svg className={`${starClass} text-amber-400`} viewBox="0 0 20 20">
                <defs>
                  <linearGradient id={`halfStar-${star}`}>
                    <stop offset="50%" stopColor="currentColor" />
                    <stop offset="50%" stopColor="#d4d4d8" />
                  </linearGradient>
                </defs>
                <path
                  fill={`url(#halfStar-${star})`}
                  d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                />
              </svg>
            )}
            {/* Empty star */}
            {fillLevel === "empty" && (
              <svg className={`${starClass} text-zinc-300 dark:text-zinc-600`} viewBox="0 0 20 20" fill="currentColor">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rating Distribution Bar                                                    */
/* -------------------------------------------------------------------------- */

interface RatingDistributionProps {
  distribution: readonly [number, number, number, number, number];
  total: number;
}

function RatingDistributionBar({ distribution, total }: RatingDistributionProps) {
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[star - 1];
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;

        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="w-8 text-right font-medium text-zinc-600 dark:text-zinc-400">
              {star}★
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Review Card                                                                */
/* -------------------------------------------------------------------------- */

interface ReviewCardProps {
  review: Review;
}

function ReviewCard({ review }: ReviewCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {review.customer_name}
          </p>
          <StarRating rating={review.rating} size="sm" />
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {review.created_at ? formatRelativeTime(review.created_at) : ""}
        </span>
      </div>
      {review.comment && (
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {review.comment}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Review Submission Modal                                                    */
/* -------------------------------------------------------------------------- */

interface ReviewSubmissionModalProps {
  shopId: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

function ReviewSubmissionModal({
  shopId,
  isOpen,
  onClose,
  onSubmitted,
}: ReviewSubmissionModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  const resetForm = useCallback(() => {
    setCustomerName("");
    setRating(0);
    setComment("");
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);

    // Validate
    if (!customerName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (rating < 1 || rating > 5) {
      setError("Please select a rating (1-5 stars).");
      return;
    }

    setSubmitting(true);

    try {
      const result = await submitReview(shopId, customerName, rating, comment);
      if (result.success) {
        addToast("Review submitted successfully! 🎉", "success");
        resetForm();
        onSubmitted();
        onClose();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [shopId, customerName, rating, comment, addToast, resetForm, onSubmitted, onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Write a Review
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close modal"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Name Input */}
          <div>
            <label
              htmlFor="review-customer-name"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Your Name
            </label>
            <input
              id="review-customer-name"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={60}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>

          {/* Rating */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Rating
            </label>
            <div className="flex items-center gap-2">
              <StarRating
                rating={rating}
                size="lg"
                interactive
                onChange={setRating}
              />
              {rating > 0 && (
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                  {rating} / 5
                </span>
              )}
            </div>
          </div>

          {/* Comment */}
          <div>
            <label
              htmlFor="review-comment"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Your Review
            </label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience with this store..."
              maxLength={500}
              rows={4}
              className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
            <p className="mt-1 text-right text-xs text-zinc-400">
              {comment.length}/500
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Submitting...
              </span>
            ) : (
              "Submit Review"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  StoreReviewsSummary (Compact — for store cards)                           */
/* -------------------------------------------------------------------------- */

interface StoreReviewsSummaryProps {
  shopId: string;
  compact?: boolean;
}

export function StoreReviewsSummary({ shopId, compact = false }: StoreReviewsSummaryProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadReviews() {
      setLoading(true);
      const result = await fetchReviewsByShopId(shopId);
      if (!cancelled) {
        if (result.success) {
          setReviews(result.data);
        }
        setLoading(false);
      }
    }

    loadReviews();
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const stats = useMemo(() => computeRatingStats(reviews), [reviews]);

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1 animate-pulse">
        <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-3 w-8 rounded bg-zinc-200 dark:bg-zinc-700" />
      </div>
    );
  }

  if (stats.total === 0) {
    if (compact) return <span className="text-xs text-zinc-400">No reviews yet</span>;
    return (
      <div className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        No reviews yet. Be the first to review!
      </div>
    );
  }

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <StarRating rating={stats.average} size="sm" />
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {stats.average}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          ({stats.total})
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {stats.average}
          </p>
          <StarRating rating={stats.average} size="sm" />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {stats.total} review{stats.total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex-1">
          <RatingDistributionBar distribution={stats.distribution} total={stats.total} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component: StoreReviews                                               */
/* -------------------------------------------------------------------------- */

interface StoreReviewsProps {
  shopId: string;
  /** Optional maximum number of reviews to display (default: all) */
  limit?: number;
  /** Whether to show the "Write a Review" button */
  allowSubmission?: boolean;
  /** Callback when a new review is submitted */
  onReviewSubmitted?: () => void;
}

export default function StoreReviews({
  shopId,
  limit,
  allowSubmission = true,
  onReviewSubmitted,
}: StoreReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await fetchReviewsByShopId(shopId);
    if (result.success) {
      setReviews(result.data);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [shopId]);

  useEffect(() => {
    let cancelled = false;

    async function fetchReviews() {
      setLoading(true);
      setError(null);
      const result = await fetchReviewsByShopId(shopId);
      if (!cancelled) {
        if (result.success) {
          setReviews(result.data);
        } else {
          setError(result.error);
        }
        setLoading(false);
      }
    }

    fetchReviews();
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const stats = useMemo(() => computeRatingStats(reviews), [reviews]);

  const displayedReviews = useMemo(
    () => (limit ? reviews.slice(0, limit) : reviews),
    [reviews, limit],
  );

  const handleReviewSubmitted = useCallback(() => {
    loadReviews();
    onReviewSubmitted?.();
  }, [loadReviews, onReviewSubmitted]);

  // ── Loading State ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        {/* Summary Skeleton */}
        <div className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-lg bg-zinc-200 dark:bg-zinc-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          </div>
        </div>
        {/* Review Card Skeletons */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="space-y-2">
              <div className="h-4 w-1/4 rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load reviews: {error}
        </p>
        <button
          onClick={loadReviews}
          className="mt-2 text-xs font-semibold text-red-600 underline hover:text-red-700 dark:text-red-400"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Rating Summary ───────────────────────────────────────────────── */}
      {stats.total > 0 && (
        <StoreReviewsSummary shopId={shopId} compact={false} />
      )}

      {/* ── Write Review Button ───────────────────────────────────────────── */}
      {allowSubmission && (
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          Write a Review
        </button>
      )}

      {/* ── Reviews List ──────────────────────────────────────────────────── */}
      {displayedReviews.length > 0 ? (
        <div className="space-y-3">
          {displayedReviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      ) : stats.total === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 text-3xl">⭐</div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            No reviews yet
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Be the first to share your experience!
          </p>
        </div>
      ) : null}

      {/* ── Review Submission Modal ───────────────────────────────────────── */}
      <ReviewSubmissionModal
        shopId={shopId}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmitted={handleReviewSubmitted}
      />
    </div>
  );
}