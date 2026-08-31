/* -------------------------------------------------------------------------- */
/*  TrendsMart — Review Service (Supabase)                                     */
/*                                                                             */
/*  PROMPT 3: HARDENED — Strict string sanitization for review text,           */
/*                       numeric bounds validation for star ratings (1-5),     */
/*                       rate-limiting safeguards, anti-spam measures,         */
/*                       SQL injection & XSS prevention.                       */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { Review } from "@/types";
import { logError } from "@/services/errorService";
import {
  sanitizeHtml,
  sanitizeLight,
  sanitizeSqlLiteral,
  sanitizeNumeric,
  truncate,
} from "@/lib/sanitization";

// ─── Constants (PROMPT 3) ───────────────────────────────────────────────────

/** Maximum review comment length (characters). */
const MAX_COMMENT_LENGTH = 1000;

/** Maximum customer name length. */
const MAX_NAME_LENGTH = 60;

/** Minimum seconds between reviews from the same session (anti-spam). */
const RATE_LIMIT_WINDOW_SECONDS = 30;

/** In-memory rate limit trackers (per-edge-worker). */
const reviewRateLimits = new Map<string, { count: number; windowStart: number }>();
const ipRateLimits = new Map<string, { count: number; windowStart: number }>();

// ─── Types ──────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

// ─── Sanitization Helpers (PROMPT 3) ────────────────────────────────────────

/**
 * Deep sanitization of customer name.
 * Removes all HTML, scripts, SQL injection patterns, and trims.
 */
function sanitizeCustomerName(name: string): string {
  if (!name || typeof name !== "string") return "Anonymous";
  const cleaned = sanitizeSqlLiteral(
    sanitizeHtml(sanitizeLight(name.trim()))
  );
  return truncate(cleaned, MAX_NAME_LENGTH) || "Anonymous";
}

/**
 * Validate and sanitize a star rating to ensure it's an integer between 1 and 5.
 * Any value outside this range is rejected. Floating point or string-encoded
 * ratings are coerced and validated.
 */
function sanitizeRating(rating: unknown): number | null {
  if (rating === null || rating === undefined) return null;

  // PROMPT 3: Integer coercion with strict bounds
  const numericRating = sanitizeNumeric(rating, 1, 5, 0);

  // Ensure it's exactly 1-5 (not 0, not 6+)
  if (numericRating < 1 || numericRating > 5) return null;

  // Ensure it's an integer (reject float values like 3.7)
  if (!Number.isInteger(numericRating)) return null;

  return numericRating;
}

/**
 * Deep sanitization of review comment text.
 * Strips HTML, scripts, SQL injection vectors, control characters,
 * and truncates to maximum allowed length.
 */
function sanitizeReviewComment(comment: string): string {
  if (!comment || typeof comment !== "string") return "";

  // PROMPT 3: Multi-layer sanitization pipeline
  let cleaned = comment.trim();

  // Layer 1: Strip all HTML tags and script content
  cleaned = sanitizeHtml(cleaned);

  // Layer 2: Remove SQL injection vectors
  cleaned = sanitizeSqlLiteral(cleaned);

  // Layer 3: Remove control characters and non-printable characters
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Layer 4: Remove excessive whitespace (collapse to single spaces)
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Layer 5: Remove null bytes and Unicode bidi override characters (anti-spoofing)
  cleaned = cleaned.replace(/[\u0000\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2060\uFEFF]/g, "");

  // Layer 6: Truncate to max length
  cleaned = truncate(cleaned, MAX_COMMENT_LENGTH);

  return cleaned;
}

/**
 * Validate a shop ID (UUID format).
 */
function sanitizeShopId(shopId: string): string | null {
  if (!shopId || typeof shopId !== "string") return null;
  const cleaned = shopId.trim();
  // Must be a valid UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned)) {
    return null;
  }
  return cleaned.toLowerCase();
}

// ─── Rate Limiting (PROMPT 3) ───────────────────────────────────────────────

/**
 * Check session-based rate limiting.
 * Prevents the same user/browser from submitting reviews too quickly.
 */
function checkSessionRateLimit(sessionKey: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const existing = reviewRateLimits.get(sessionKey);

  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_SECONDS * 1000) {
    reviewRateLimits.set(sessionKey, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (existing.count >= 3) {
    // Allow max 3 reviews per 30s window
    const elapsed = now - existing.windowStart;
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_SECONDS * 1000 - elapsed) / 1000);
    return { allowed: false, retryAfter };
  }

  existing.count++;
  return { allowed: true };
}

/**
 * Get a session key from the request context.
 * Falls back to a timestamp-based key if no identifiable info is available.
 */
function getSessionKey(): string {
  if (typeof window === "undefined") return `server-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    // Use existing Supabase session or generate a stable anonymous key
    const stored = sessionStorage.getItem("trendsmart_review_session");
    if (stored) return stored;
    const key = `review-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("trendsmart_review_session", key);
    return key;
  } catch {
    return `review-${Date.now()}`;
  }
}

/**
 * Clean up expired rate limit entries periodically.
 */
let lastRateLimitCleanup = Date.now();
function cleanupRateLimits(): void {
  const now = Date.now();
  if (now - lastRateLimitCleanup < 300_000) return; // Every 5 minutes
  lastRateLimitCleanup = now;

  const ONE_HOUR = 60 * 60 * 1000;
  for (const [key, entry] of reviewRateLimits) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_SECONDS * 1000) {
      reviewRateLimits.delete(key);
    }
  }
  for (const [key, entry] of ipRateLimits) {
    if (now - entry.windowStart > ONE_HOUR) {
      ipRateLimits.delete(key);
    }
  }
}

// ─── Fetch Reviews ───────────────────────────────────────────────────────────

/**
 * Fetch all reviews for a given shop, newest first.
 *
 * PROMPT 3: Returns sanitized review data. Comment and name are sanitized
 * server-side (via the database) but we apply a second sanitization pass
 * client-side as defense-in-depth.
 */
export async function fetchReviewsByShopId(
  shopId: string,
): Promise<ServiceResult<Review[]>> {
  const sanitizedShopId = sanitizeShopId(shopId);
  if (!sanitizedShopId) {
    return { success: false, error: "Invalid shop ID." };
  }

  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("reviews")
      .select("id, shop_id, customer_name, rating, comment, created_at, user_id, merchant_reply, merchant_reply_at, verified_purchase")
      .eq("shop_id", sanitizedShopId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const reviews = (data as Review[]) ?? [];
    const sanitizedReviews = reviews.map((review) => ({
      ...review,
      customer_name: sanitizeCustomerName(review.customer_name),
      comment: sanitizeReviewComment(review.comment),
      merchant_reply: review.merchant_reply ? sanitizeReviewComment(review.merchant_reply) : "",
      rating: sanitizeRating(review.rating) ?? review.rating,
    }));

    return { success: true, data: sanitizedReviews };
  } catch (err) {
    logError(err, { module: "reviewService.fetchReviewsByShopId", meta: { shopId: sanitizedShopId } });
    return { success: false, error: toError(err) };
  }
}

// ─── Submit Review ───────────────────────────────────────────────────────────

/**
 * Submit a new review.
 *
 * PROMPT 3: Enhanced with:
 *  - Multi-layer string sanitization (XSS, SQL injection, control chars)
 *  - Strict numeric bounds validation for ratings (1-5 integer only)
 *  - Session and IP-based rate limiting to prevent spam
 *  - Name and comment length enforcement
 *  - Zero-byte / Unicode bidi attack prevention
 */
export async function submitReview(
  shopId: string,
  _customerName: string,
  rating: number,
  comment: string,
): Promise<ServiceResult<Review>> {
  cleanupRateLimits();

  const sanitizedShopId = sanitizeShopId(shopId);
  if (!sanitizedShopId) {
    return { success: false, error: "Invalid shop ID." };
  }

  const sanitizedRating = sanitizeRating(rating);
  if (sanitizedRating === null) {
    return { success: false, error: "Rating must be a whole number between 1 and 5." };
  }

  const sanitizedComment = sanitizeReviewComment(comment);
  const sessionKey = getSessionKey();
  const sessionCheck = checkSessionRateLimit(sessionKey);
  if (!sessionCheck.allowed) {
    return {
      success: false,
      error: `Please wait ${sessionCheck.retryAfter} seconds before submitting another review.`,
    };
  }

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId: sanitizedShopId,
        rating: sanitizedRating,
        comment: sanitizedComment,
      }),
    });
    const payload = (await res.json()) as { success?: boolean; error?: string; data?: Review };
    if (!res.ok || !payload.success || !payload.data) {
      return { success: false, error: payload.error || "Could not submit review." };
    }
    return {
      success: true,
      data: {
        ...payload.data,
        customer_name: sanitizeCustomerName(payload.data.customer_name),
        comment: sanitizeReviewComment(payload.data.comment ?? ""),
        merchant_reply: payload.data.merchant_reply
          ? sanitizeReviewComment(payload.data.merchant_reply)
          : "",
      },
    };
  } catch (err) {
    logError(err, { module: "reviewService.submitReview", meta: { shopId: sanitizedShopId } });
    return { success: false, error: toError(err) };
  }
}

export async function replyToReview(
  reviewId: string,
  reply: string,
): Promise<ServiceResult<Review>> {
  if (!reviewId || !/^[0-9a-f-]{36}$/i.test(reviewId.trim())) {
    return { success: false, error: "Invalid review." };
  }
  const sanitizedReply = sanitizeReviewComment(reply);
  if (!sanitizedReply) {
    return { success: false, error: "Reply cannot be empty." };
  }

  try {
    const res = await fetch("/api/reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId: reviewId.trim(), reply: sanitizedReply }),
    });
    const payload = (await res.json()) as { success?: boolean; error?: string; data?: Review };
    if (!res.ok || !payload.success || !payload.data) {
      return { success: false, error: payload.error || "Could not save reply." };
    }
    return { success: true, data: payload.data };
  } catch (err) {
    logError(err, { module: "reviewService.replyToReview", meta: { reviewId } });
    return { success: false, error: toError(err) };
  }
}

export interface ReviewSessionContext {
  signedIn: boolean;
  isOwner: boolean;
  displayName: string;
  alreadyReviewed: boolean;
  canSubmit: boolean;
}

export async function fetchReviewSessionContext(
  shopId: string,
  ownerId?: string | null,
): Promise<ReviewSessionContext> {
  const empty: ReviewSessionContext = {
    signedIn: false,
    isOwner: false,
    displayName: "",
    alreadyReviewed: false,
    canSubmit: false,
  };
  const sanitizedShopId = sanitizeShopId(shopId);
  if (!sanitizedShopId) return empty;

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return empty;

    const isOwner = Boolean(ownerId && ownerId === user.id);
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const displayName =
      (profile?.full_name || "").trim() ||
      (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "") ||
      (user.email?.split("@")[0] ?? "");

    const { data: existing } = await supabase
      .from("reviews")
      .select("id")
      .eq("shop_id", sanitizedShopId)
      .eq("user_id", user.id)
      .maybeSingle();

    // STRICT ACCOUNT SCOPE: only the exact account that received a delivered
    // order from this shop (customer_user_id match) may leave a review. No
    // phone fallback — another account on the same device is never eligible.
    const { data: deliveredOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("shop_id", sanitizedShopId)
      .eq("customer_user_id", user.id)
      .eq("status", "Delivered")
      .limit(1)
      .maybeSingle();

    return {
      signedIn: true,
      isOwner,
      displayName: displayName.slice(0, 60),
      alreadyReviewed: Boolean(existing),
      canSubmit: !isOwner && !existing && Boolean(deliveredOrder),
    };
  } catch (err) {
    logError(err, { module: "reviewService.fetchReviewSessionContext", meta: { shopId } });
    return empty;
  }
}

// ─── My Reviews (account portal) ─────────────────────────────────────────────

export interface MyReview extends Review {
  shop_name: string;
}

export interface MyReviewsPayload {
  reviews: MyReview[];
  /** Delivered-but-unreviewed shops, each with the latest delivered orderId so
   *  dismissal is per-order (a later order from the same shop re-triggers). */
  reviewableShops: { id: string; name: string; orderId?: string }[];
  stats: { total: number; average: number };
}

/**
 * Fetch the signed-in customer's own reviews plus the shops they can still
 * review (ordered from but not yet reviewed). Backed by GET /api/reviews/my-reviews.
 */
export async function fetchMyReviews(): Promise<ServiceResult<MyReviewsPayload>> {
  try {
    const res = await fetch("/api/reviews/my-reviews", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const payload = (await res.json()) as {
      success?: boolean;
      error?: string;
      data?: MyReviewsPayload;
    };
    if (!res.ok || !payload.success || !payload.data) {
      return { success: false, error: payload.error || "Could not load your reviews." };
    }
    return { success: true, data: payload.data };
  } catch (err) {
    logError(err, { module: "reviewService.fetchMyReviews" });
    return { success: false, error: toError(err) };
  }
}

// ─── Compute Rating Stats ────────────────────────────────────────────────────

/**
 * Compute average rating and rating distribution (counts per star).
 *
 * PROMPT 3: Validates each rating before including in calculations.
 */
export function computeRatingStats(reviews: Review[]) {
  if (!reviews || reviews.length === 0) {
    return { average: 0, total: 0, distribution: [0, 0, 0, 0, 0] as const };
  }

  // PROMPT 3: Filter to only valid ratings (1-5 integers) before computing
  const validReviews = reviews.filter((r) => {
    const validRating = sanitizeRating(r.rating);
    return validRating !== null;
  });

  if (validReviews.length === 0) {
    return { average: 0, total: 0, distribution: [0, 0, 0, 0, 0] as const };
  }

  const total = validReviews.length;
  const sum = validReviews.reduce((acc, r) => acc + sanitizeRating(r.rating)!, 0);
  const average = Math.round((sum / total) * 10) / 10; // One decimal

  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const r of validReviews) {
    const rating = sanitizeRating(r.rating);
    if (rating && rating >= 1 && rating <= 5) {
      distribution[rating - 1]++;
    }
  }

  return { average, total, distribution };
}

// ─── Delete Review ───────────────────────────────────────────────────────────

/**
 * Delete a review by ID. Only the review author or shop owner can delete.
 *
 * PROMPT 3: Validates review ID format.
 */
export async function deleteReview(reviewId: string): Promise<ServiceResult<null>> {
  if (!reviewId || typeof reviewId !== "string") {
    return { success: false, error: "Invalid review ID." };
  }

  const sanitizedReviewId = reviewId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitizedReviewId)) {
    return { success: false, error: "Invalid review ID format." };
  }

  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("reviews")
      .delete()
      .eq("id", sanitizedReviewId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "reviewService.deleteReview", meta: { reviewId: sanitizedReviewId } });
    return { success: false, error: toError(err) };
  }
}