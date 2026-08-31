"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import {
  fetchMyReviews,
  submitReview,
  type MyReviewsPayload,
} from "@/services/reviewService";
import { getAppReview, saveAppReview, type AppReview } from "@/services/appReviewService";
import { formatRelativeTime } from "@/lib/formatters";

/* -------------------------------------------------------------------------- */
/*  Star helpers                                                               */
/* -------------------------------------------------------------------------- */

function StarPath() {
  return (
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  );
}

function Stars({
  rating,
  size = "sm",
  interactive = false,
  onChange,
}: {
  rating: number;
  size?: "sm" | "md";
  interactive?: boolean;
  onChange?: (rating: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const starClass = size === "md" ? "h-6 w-6" : "h-4 w-4";
  const display = hover || rating;

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role={interactive ? "radiogroup" : "img"}
      aria-label={`${Number(rating).toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        if (interactive) {
          const filled = display >= star;
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange?.(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              className="cursor-pointer rounded-sm transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
              aria-label={`${star} star${star !== 1 ? "s" : ""}`}
            >
              <svg
                className={`${starClass} ${filled ? "text-amber-400" : "text-zinc-300 dark:text-zinc-600"}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <StarPath />
              </svg>
            </button>
          );
        }

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

/* -------------------------------------------------------------------------- */
/*  Modal — give a review + view all reviews                                   */
/* -------------------------------------------------------------------------- */

function MyReviewsModal({
  data,
  onChange,
  onClose,
}: {
  data: MyReviewsPayload;
  onChange: (next: MyReviewsPayload) => void;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const [openShopId, setOpenShopId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // App review (rate the TrendsMart app itself — always available)
  const [appRating, setAppRating] = useState(0);
  const [appComment, setAppComment] = useState("");
  const [appReview, setAppReview] = useState<AppReview | null>(() => {
    if (typeof window === "undefined") return null;
    return getAppReview();
  });

  const handleAppReviewSubmit = () => {
    if (appRating < 1) {
      addToast("Please select a star rating for the app.", "error");
      return;
    }
    const saved = saveAppReview(appRating, appComment);
    setAppReview(saved);
    addToast("Thanks for rating TrendsMart!", "success");
  };

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleSubmit = async (shop: { id: string; name: string }) => {
    const rating = ratings[shop.id];
    if (!rating || rating < 1) {
      addToast("Please select a star rating.", "error");
      return;
    }
    setSubmitting(true);
    const result = await submitReview(shop.id, "", rating, comments[shop.id] ?? "");
    setSubmitting(false);

    if (!result.success) {
      addToast(result.error, "error");
      return;
    }

    addToast(`Review submitted for ${shop.name}.`, "success");
    const submitted = {
      ...result.data,
      shop_name: shop.name,
    };
    const nextReviews = [submitted, ...data.reviews];
    const nextRatings = nextReviews
      .filter((r) => Number.isInteger(r.rating) && Number(r.rating) >= 1 && Number(r.rating) <= 5)
      .map((r) => Number(r.rating));
    const total = nextRatings.length;
    const average =
      total > 0 ? Math.round((nextRatings.reduce((a, b) => a + b, 0) / total) * 10) / 10 : 0;
    onChange({
      reviews: nextReviews,
      reviewableShops: data.reviewableShops.filter((s) => s.id !== shop.id),
      stats: { total, average },
    });
    setOpenShopId(null);
  };

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Your Reviews</h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Rate the shops you ordered from and view your feedback.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Combined summary */}
          <div className="rounded-2xl border border-amber-100/80 bg-gradient-to-br from-amber-50/90 via-white to-white p-4 text-center shadow-sm dark:border-amber-900/30 dark:from-amber-950/30 dark:via-zinc-900 dark:to-zinc-900">
            {data.stats.total > 0 ? (
              <>
                <p className="text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                  {Number(data.stats.average).toFixed(1)}
                </p>
                <div className="mt-1.5 flex justify-center">
                  <Stars rating={data.stats.average} />
                </div>
                <p className="mt-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {data.stats.total.toLocaleString()} review{data.stats.total !== 1 ? "s" : ""} total
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  No reviews yet
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Rate a shop below to get started.
                </p>
              </>
            )}
          </div>

          {/* Shops pending review */}
          {data.reviewableShops.length > 0 ? (
            <section className="space-y-2.5">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Give your review
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {data.reviewableShops.length} shop{data.reviewableShops.length !== 1 ? "s" : ""}
                </span>
              </h4>
              {data.reviewableShops.map((shop) => {
                const isOpen = openShopId === shop.id;
                return (
                  <div
                    key={shop.id}
                    className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {shop.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => setOpenShopId(isOpen ? null : shop.id)}
                        className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        {isOpen ? "Cancel" : "Rate ★"}
                      </button>
                    </div>

                    {isOpen ? (
                      <div className="mt-3 space-y-2.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                          <Stars
                            rating={ratings[shop.id] ?? 0}
                            size="md"
                            interactive
                            onChange={(r) => setRatings((prev) => ({ ...prev, [shop.id]: r }))}
                          />
                          {ratings[shop.id] ? (
                            <span className="text-xs text-zinc-500">{ratings[shop.id]} / 5</span>
                          ) : null}
                        </div>
                        <textarea
                          rows={2}
                          value={comments[shop.id] ?? ""}
                          onChange={(e) =>
                            setComments((prev) => ({ ...prev, [shop.id]: e.target.value }))
                          }
                          maxLength={500}
                          placeholder="Share your experience (optional)"
                          className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleSubmit(shop)}
                          className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {submitting ? "Submitting…" : "Submit review"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : data.stats.total === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              You haven&apos;t placed an order yet. Once you order from a shop, you can rate it
              right here from your profile.
            </p>
          ) : (
            <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-center text-xs font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
              You&apos;ve reviewed every shop you ordered from. Thank you!
            </p>
          )}

          {/* My reviews */}
          {data.reviews.length > 0 ? (
            <section className="space-y-2.5">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                All my reviews ({data.reviews.length})
              </h4>
              {data.reviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {review.shop_name}
                    </p>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {review.created_at ? formatRelativeTime(review.created_at) : ""}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Stars rating={review.rating} />
                  </div>
                  {review.comment ? (
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {review.comment}
                    </p>
                  ) : null}
                  {review.merchant_reply ? (
                    <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        Store reply
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                        {review.merchant_reply}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {/* Rate the TrendsMart app — always available, no order needed */}
          <section className="space-y-2.5">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Rate the TrendsMart app
            </h4>
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {appReview ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-2">
                    <Stars rating={appReview.rating} />
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      You rated the app {appReview.rating}★
                    </span>
                  </div>
                  {appReview.updatedAt ? (
                    <span className="text-[0.65rem] text-emerald-600/80 dark:text-emerald-300/70">
                      {formatRelativeTime(appReview.updatedAt)}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <Stars
                  rating={appRating}
                  size="md"
                  interactive
                  onChange={setAppRating}
                />
                {appRating ? (
                  <span className="text-xs text-zinc-500">{appRating} / 5</span>
                ) : null}
              </div>
              <textarea
                rows={2}
                value={appComment}
                onChange={(e) => setAppComment(e.target.value)}
                maxLength={500}
                placeholder="What do you think about TrendsMart? (optional)"
                className="mt-2.5 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={handleAppReviewSubmit}
                className="mt-2.5 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                {appReview ? "Update app rating" : "Submit app rating"}
              </button>
              <p className="mt-2 text-[0.65rem] text-zinc-400">
                This rating is for the TrendsMart app itself — you can update it anytime.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Profile card + entry point                                                 */
/* -------------------------------------------------------------------------- */

export default function ProfileReviewsCard() {
  const [data, setData] = useState<MyReviewsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchMyReviews();
    if (result.success) setData(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = data?.reviewableShops.length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!data) void load();
          setOpen(true);
        }}
        className="w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        aria-label="Open your reviews"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Give your review</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Rate the shops you ordered from, or view all your reviews.
            </p>
          </div>
          {pendingCount > 0 ? (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {pendingCount} shop{pendingCount !== 1 ? "s" : ""} to review
            </span>
          ) : (
            <span className="shrink-0 text-zinc-400" aria-hidden>
              →
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          {loading ? (
            <div className="h-5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          ) : data && data.stats.total > 0 ? (
            <>
              <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                {Number(data.stats.average).toFixed(1)}
              </span>
              <Stars rating={data.stats.average} />
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {data.stats.total.toLocaleString()} review{data.stats.total !== 1 ? "s" : ""} given
              </span>
            </>
          ) : data ? (
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              No reviews yet — rate the shops you ordered from.
            </span>
          ) : (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Could not load reviews. Tap to try again.
            </span>
          )}
        </div>
      </button>

      {open && data ? (
        <MyReviewsModal
          data={data}
          onChange={(next) => {
            setData(next);
            void load();
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
