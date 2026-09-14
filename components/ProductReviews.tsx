"use client";

/**
 * Product-scoped reviews on PDP — list, filter, sort, rate CTA, policies.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  computeRatingStats,
  deleteReview,
  fetchProductReviewContext,
  fetchReviewsByProductId,
  replyToReview,
  type ProductReviewContext,
} from "@/services/reviewService";
import type { Review } from "@/types";
import { formatRelativeTime } from "@/lib/formatters";
import { useToast } from "@/components/Toast";
import {
  REVIEW_PAGE_SIZE,
  REVIEW_POLICY_POINTS,
  filterReviewsByStars,
  paginateReviews,
  sortReviews,
  type ReviewSortMode,
} from "@/lib/reviewRules";
import { createClient } from "@/lib/supabase/client";

function StarPath() {
  return (
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  );
}

function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const starClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`${Number(rating).toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, rating - (star - 1)));
        const pct = Math.round(fill * 100);
        return (
          <span key={star} className={`relative inline-block ${starClass}`}>
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

export interface ProductReviewsProps {
  productId: string;
  shopId: string;
  productName: string;
  /** Denormalized avg from product row (shown while list loads) */
  avgRating?: number | null;
  reviewCount?: number | null;
  onRequestRate: () => void;
  /** Bump after a successful rate to reload list */
  refreshKey?: number;
  /** Parent can refresh rating CTA / product aggregates */
  onReviewsChanged?: () => void;
}

export default function ProductReviews({
  productId,
  shopId,
  productName,
  avgRating,
  reviewCount,
  onRequestRate,
  refreshKey = 0,
  onReviewsChanged,
}: ProductReviewsProps) {
  const { addToast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<ProductReviewContext | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<ReviewSortMode>("newest");
  const [page, setPage] = useState(1);
  const [showPolicy, setShowPolicy] = useState(false);

  const load = useCallback(async () => {
    const [listRes, context, auth] = await Promise.all([
      fetchReviewsByProductId(productId),
      fetchProductReviewContext(productId),
      createClient().auth.getUser(),
    ]);
    if (listRes.success) setReviews(listRes.data);
    setCtx(context);
    setViewerId(auth.data.user?.id ?? null);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, refreshKey]);

  const stats = useMemo(() => computeRatingStats(reviews), [reviews]);
  const filtered = useMemo(() => {
    const byStar = filterReviewsByStars(reviews, starFilter);
    return sortReviews(byStar, sort);
  }, [reviews, starFilter, sort]);
  const paged = useMemo(
    () => paginateReviews(filtered, page, REVIEW_PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [starFilter, sort]);

  const displayAvg =
    stats.total > 0 ? stats.average : Number(avgRating) > 0 ? Number(avgRating) : 0;
  const displayCount = stats.total > 0 ? stats.total : Number(reviewCount) || 0;

  async function handleDelete(id: string) {
    if (!window.confirm("Delete your review? This cannot be undone.")) return;
    const res = await deleteReview(id);
    if (!res.success) {
      addToast(res.error, "error");
      return;
    }
    setReviews((prev) => prev.filter((r) => r.id !== id));
    setCtx((prev) =>
      prev ? { ...prev, alreadyReviewed: false, canSubmit: !prev.isOwner && prev.signedIn } : prev,
    );
    addToast("Review deleted", "success");
    // Re-check eligibility after delete
    void fetchProductReviewContext(productId).then((next) => {
      setCtx(next);
      onReviewsChanged?.();
    });
  }

  async function handleReply(reviewId: string, text: string) {
    const res = await replyToReview(reviewId, text);
    if (!res.success) {
      addToast(res.error, "error");
      return;
    }
    setReviews((prev) => prev.map((r) => (r.id === reviewId ? { ...r, ...res.data } : r)));
    addToast("Reply posted", "success");
  }

  return (
    <section
      id="product-reviews"
      className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
            Product reviews
          </h2>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            Ratings for <span className="font-medium text-zinc-700 dark:text-zinc-300">{productName}</span>
            {" · "}
            <Link
              href={`/shop/${shopId}#reviews`}
              className="text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Store reviews
            </Link>
          </p>
        </div>
        {ctx?.signedIn && !ctx.isOwner && ctx.canSubmit ? (
          <button
            type="button"
            onClick={onRequestRate}
            className="rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-600"
          >
            Write a review
          </button>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <div className="text-center">
          <p className="text-2xl font-black tabular-nums text-zinc-900 dark:text-zinc-50">
            {displayCount > 0 ? displayAvg.toFixed(1) : "—"}
          </p>
          <Stars rating={displayAvg} />
          <p className="mt-1 text-[11px] text-zinc-500">
            {displayCount.toLocaleString()} review{displayCount !== 1 ? "s" : ""}
          </p>
        </div>
        {stats.total > 0 ? (
          <div className="min-w-0 flex-1 space-y-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = stats.distribution[star - 1];
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setStarFilter((f) => (f === star ? null : star))}
                  className={`flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] ${
                    starFilter === star
                      ? "bg-amber-50 dark:bg-amber-950/40"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span className="w-4 font-semibold tabular-nums text-zinc-600">{star}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-right tabular-nums text-zinc-400">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as ReviewSortMode)}
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] font-semibold dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="newest">Newest</option>
          <option value="highest">Highest rated</option>
          <option value="lowest">Lowest rated</option>
        </select>
        {starFilter ? (
          <button
            type="button"
            onClick={() => setStarFilter(null)}
            className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
          >
            {starFilter}★ only · clear
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowPolicy((v) => !v)}
          className="ml-auto text-[10px] font-semibold text-zinc-500 underline-offset-2 hover:underline"
        >
          Review policy
        </button>
      </div>

      {showPolicy ? (
        <ul className="mt-2 space-y-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
          {REVIEW_POLICY_POINTS.map((p) => (
            <li key={p}>· {p}</li>
          ))}
          <li>
            · Full rules:{" "}
            <Link href="/legal/reviews" className="font-semibold text-emerald-600 hover:underline">
              Review & rating policy
            </Link>
          </li>
        </ul>
      ) : null}

      {!ctx?.signedIn ? (
        <p className="mt-3 text-[11px] text-zinc-500">
          <Link href="/login" className="font-semibold text-emerald-600 hover:underline">
            Sign in
          </Link>{" "}
          with the account that received this product to leave a verified review.
        </p>
      ) : ctx.isOwner ? (
        <p className="mt-3 text-[11px] text-zinc-500">
          Store owners can reply to reviews but cannot rate their own products.
        </p>
      ) : ctx.alreadyReviewed ? (
        <p className="mt-3 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          You already reviewed this product. You can delete it below to post again.
        </p>
      ) : !ctx.canSubmit ? (
        <p className="mt-3 text-[11px] text-zinc-500">
          Rate after your order for this product is marked Delivered.
        </p>
      ) : null}

      <div className="mt-2.5 space-y-2">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"
            />
          ))
        ) : paged.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">
            No product reviews yet
            {ctx?.canSubmit ? " — be the first." : "."}
          </p>
        ) : (
          paged.items.map((review) => (
            <article
              key={review.id}
              className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {review.customer_name}
                    </p>
                    {review.verified_purchase ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        Verified order
                      </span>
                    ) : null}
                  </div>
                  <Stars rating={review.rating} />
                </div>
                <span className="shrink-0 text-[11px] text-zinc-400">
                  {review.created_at ? formatRelativeTime(review.created_at) : ""}
                </span>
              </div>
              {review.comment ? (
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {review.comment}
                </p>
              ) : null}
              {review.merchant_reply ? (
                <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Store reply
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                    {review.merchant_reply}
                  </p>
                </div>
              ) : ctx?.isOwner ? (
                <OwnerReplyInline onSubmit={(t) => void handleReply(review.id, t)} />
              ) : null}
              {viewerId && review.user_id === viewerId ? (
                <button
                  type="button"
                  onClick={() => void handleDelete(review.id)}
                  className="mt-2 text-[11px] font-semibold text-red-600 hover:underline dark:text-red-400"
                >
                  Delete my review
                </button>
              ) : null}
            </article>
          ))
        )}
      </div>

      {paged.totalPages > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={!paged.hasPrev}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold disabled:opacity-40 dark:border-zinc-700"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            {paged.page} / {paged.totalPages}
          </span>
          <button
            type="button"
            disabled={!paged.hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold disabled:opacity-40 dark:border-zinc-700"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

function OwnerReplyInline({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
      >
        Reply
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Reply as store"
        className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => {
            onSubmit(text.trim());
            setText("");
            setOpen(false);
          }}
          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-40"
        >
          Post
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
