"use client";

import { useState, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`h-8 w-8 transition-colors ${filled ? "text-amber-400" : "text-zinc-300 dark:text-zinc-600"}`}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="h-5 w-5"
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

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface QuickRatingModalProps {
  /** The shop ID being rated. */
  shopId: string;
  /** Shop name for display context. */
  shopName: string;
  /** Called when the modal is closed (e.g., user dismisses or submits). */
  onClose: () => void;
  /** Called after a successful rating submission with the new average. */
  onRatingSubmitted?: (newAverage: number) => void;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * QuickRatingModal — A lightweight customer feedback modal.
 *
 * Allows customers to submit a quick 1-to-5 star rating with an optional
 * short comment after interacting with a merchant. Updates the store's
 * average rating dynamically via the review service.
 */
export default function QuickRatingModal({
  shopId,
  shopName,
  onClose,
  onRatingSubmitted,
}: QuickRatingModalProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isRatingValid = rating >= 1 && rating <= 5;

  const handleSubmit = useCallback(async () => {
    if (!isRatingValid) {
      setError("Please select a rating (1-5 stars).");
      return;
    }
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { submitReview, computeRatingStats, fetchReviewsByShopId } =
        await import("@/services/reviewService");

      // Submit the review
      const result = await submitReview(
        shopId,
        name.trim() || "Customer",
        rating,
        comment.trim(),
      );

      if (result.success) {
        setSubmitted(true);

        // Fetch updated reviews to compute new average
        const reviewsResult = await fetchReviewsByShopId(shopId);
        if (reviewsResult.success) {
          const stats = computeRatingStats(reviewsResult.data);
          onRatingSubmitted?.(stats.average);
        }
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit rating.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [shopId, rating, comment, name, isRatingValid, onRatingSubmitted]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {submitted ? "Thank You! 🎉" : "Rate Your Experience"}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {submitted
                ? "Your feedback helps improve this shop."
                : `How was your experience with ${shopName}?`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        {!submitted ? (
          <div className="space-y-5 px-6 py-5">
            {/* Star Rating */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Rating *
              </label>
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="rounded-full p-1 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    aria-label={`${star} star${star > 1 ? "s" : ""}`}
                  >
                    <StarIcon filled={star <= (hoverRating || rating)} />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="mt-2 text-center text-xs font-medium text-amber-600 dark:text-amber-400">
                  {rating === 1
                    ? "Poor"
                    : rating === 2
                      ? "Fair"
                      : rating === 3
                        ? "Good"
                        : rating === 4
                          ? "Great"
                          : "Excellent!"}
                </p>
              )}
            </div>

            {/* Name Field */}
            <div>
              <label
                htmlFor="quick-rating-name"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                Your Name *
              </label>
              <input
                id="quick-rating-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={60}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Comment Field */}
            <div>
              <label
                htmlFor="quick-rating-comment"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                Comment <span className="font-normal">(optional)</span>
              </label>
              <textarea
                id="quick-rating-comment"
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share a quick note about your experience..."
                maxLength={300}
                className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
          </div>
        ) : (
          /* Submitted state */
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <svg
                className="h-8 w-8 text-emerald-600 dark:text-emerald-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Rating submitted!
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                You rated {shopName} {rating} star{rating !== 1 ? "s" : ""}.
              </p>
            </div>
          </div>
        )}

        {/* Footer CTA */}
        <div className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          {!submitted ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 hover:shadow-emerald-600/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-zinc-900"
            >
              {submitting ? (
                <>
                  <SpinnerIcon />
                  Submitting...
                </>
              ) : (
                "Submit Rating"
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full bg-zinc-100 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Close
            </button>
          )}
          {!submitted && (
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full rounded-full py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Maybe later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}