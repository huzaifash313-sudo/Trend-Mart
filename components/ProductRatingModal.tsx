"use client";

import { useCallback, useState, type FormEvent } from "react";
import { submitReview } from "@/services/reviewService";

/* -------------------------------------------------------------------------- */
/*  Star picker                                                               */
/* -------------------------------------------------------------------------- */

function StarPath() {
  return (
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  );
}

function Stars({
  rating,
  onChange,
}: {
  rating: number;
  onChange: (rating: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || rating;
  return (
    <div className="flex items-center justify-center gap-1" role="radiogroup" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="cursor-pointer rounded-sm p-0.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
        >
          <svg
            className={`h-8 w-8 ${display >= star ? "text-amber-400" : "text-zinc-300 dark:text-zinc-600"}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <StarPath />
          </svg>
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modal                                                                     */
/* -------------------------------------------------------------------------- */

interface ProductRatingModalProps {
  productId: string;
  shopId: string;
  productName: string;
  imageUrl?: string | null;
  shopName?: string;
  /** Closed BEFORE any submit (X / overlay). */
  onClose: () => void;
  /** Called after the server accepted the rating (write happened). */
  onRated: () => void;
}

/**
 * ProductRatingModal — rate ONE product with stars + optional comment.
 *
 * The backend is the real gate (only the exact account with a delivered
 * order for this product may post). This modal only collects input and lets
 * the API respond — there is no fake-order / unverified path here.
 */
export default function ProductRatingModal({
  productId,
  shopId,
  productName,
  imageUrl,
  shopName,
  onClose,
  onRated,
}: ProductRatingModalProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (rating < 1) {
        setError("Please select a star rating.");
        return;
      }
      setSubmitting(true);
      setError(null);
      const result = await submitReview(shopId, "", rating, comment.trim(), productId);
      setSubmitting(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
      window.setTimeout(onRated, 900);
    },
    [rating, comment, shopId, productId, onRated],
  );

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Rate ${productName}`}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-zinc-900 dark:text-zinc-100">
              {submitted ? "Thank you! 🎉" : "Rate this product"}
            </h3>
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {submitted ? "Your stars also update the shop rating." : `${productName}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {submitted ? (
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
                You rated {productName} {rating} star{rating !== 1 ? "s" : ""}.
              </p>
            </div>
            <button
              type="button"
              onClick={onRated}
              className="mt-1 w-full rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            {imageUrl ? (
              <div className="mx-auto h-20 w-20 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="h-full w-full object-contain" />
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-center text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Your rating *
              </label>
              <Stars rating={rating} onChange={setRating} />
              {rating > 0 ? (
                <p className="mt-1.5 text-center text-xs font-medium text-amber-600 dark:text-amber-400">
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
              ) : null}
            </div>

            <div>
              <label
                htmlFor="product-rating-comment"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                Comment <span className="font-normal">(optional)</span>
              </label>
              <textarea
                id="product-rating-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={`How is ${productName}?`}
                maxLength={500}
                className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-zinc-900"
            >
              {submitting ? "Submitting…" : "Submit rating"}
            </button>

            {shopName ? (
              <p className="text-center text-[0.65rem] text-zinc-400 dark:text-zinc-500">
                Verified: only the account with a delivered order of this product
                {shopName ? ` from ${shopName}` : ""} can post.
              </p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
