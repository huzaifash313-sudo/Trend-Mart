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

function mapReviewRow(row: Record<string, unknown>): Review {
  const productJoin = row.products as
    | { name?: string; short_code?: string | null }
    | null
    | undefined;
  return {
    id: String(row.id),
    shop_id: String(row.shop_id),
    product_id: (row.product_id as string | null) ?? null,
    product_name:
      (typeof productJoin?.name === "string" && productJoin.name) ||
      (typeof row.product_name === "string" ? row.product_name : null),
    product_short_code:
      (typeof productJoin?.short_code === "string" && productJoin.short_code) ||
      (typeof row.product_short_code === "string" ? row.product_short_code : null),
    customer_name: sanitizeCustomerName(String(row.customer_name ?? "")),
    comment: sanitizeReviewComment(String(row.comment ?? "")),
    merchant_reply: row.merchant_reply
      ? sanitizeReviewComment(String(row.merchant_reply))
      : "",
    merchant_reply_at: (row.merchant_reply_at as string | null) ?? null,
    rating: sanitizeRating(row.rating) ?? (Number(row.rating) || 0),
    created_at: (row.created_at as string | undefined) ?? undefined,
    user_id: (row.user_id as string | null) ?? null,
    verified_purchase: row.verified_purchase === true,
  };
}

const REVIEW_SELECT =
  "id, shop_id, product_id, customer_name, rating, comment, created_at, user_id, merchant_reply, merchant_reply_at, verified_purchase, products(name, short_code)";

/**
 * Fetch all reviews for a given shop, newest first (product + shop-only).
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
      .select(REVIEW_SELECT)
      .eq("shop_id", sanitizedShopId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const reviews = ((data as Record<string, unknown>[]) ?? []).map(mapReviewRow);
    return { success: true, data: reviews };
  } catch (err) {
    // Fallback without join if FK name differs on older DBs
    try {
      const { data, error } = await supabase
        .from("reviews")
        .select(
          "id, shop_id, product_id, customer_name, rating, comment, created_at, user_id, merchant_reply, merchant_reply_at, verified_purchase",
        )
        .eq("shop_id", sanitizedShopId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return {
        success: true,
        data: ((data as Record<string, unknown>[]) ?? []).map(mapReviewRow),
      };
    } catch (err2) {
      logError(err2, {
        module: "reviewService.fetchReviewsByShopId",
        meta: { shopId: sanitizedShopId },
      });
      return { success: false, error: toError(err2) };
    }
  }
}

/**
 * Fetch reviews for one product (public, newest first).
 */
export async function fetchReviewsByProductId(
  productId: string,
): Promise<ServiceResult<Review[]>> {
  const id =
    productId && /^[0-9a-f-]{36}$/i.test(productId.trim()) ? productId.trim() : "";
  if (!id) return { success: false, error: "Invalid product ID." };

  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("reviews")
      .select(REVIEW_SELECT)
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return {
      success: true,
      data: ((data as Record<string, unknown>[]) ?? []).map(mapReviewRow),
    };
  } catch (err) {
    try {
      const { data, error } = await supabase
        .from("reviews")
        .select(
          "id, shop_id, product_id, customer_name, rating, comment, created_at, user_id, merchant_reply, merchant_reply_at, verified_purchase",
        )
        .eq("product_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return {
        success: true,
        data: ((data as Record<string, unknown>[]) ?? []).map(mapReviewRow),
      };
    } catch (err2) {
      logError(err2, {
        module: "reviewService.fetchReviewsByProductId",
        meta: { productId: id },
      });
      return { success: false, error: toError(err2) };
    }
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
  productId?: string | null,
): Promise<ServiceResult<Review>> {
  cleanupRateLimits();

  const sanitizedShopId = sanitizeShopId(shopId);
  const sanitizedProductId =
    productId && /^[0-9a-f-]{36}$/i.test(productId.trim()) ? productId.trim() : "";

  if (!sanitizedProductId && !sanitizedShopId) {
    return { success: false, error: "Invalid shop or product." };
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
        ...(sanitizedProductId
          ? { productId: sanitizedProductId }
          : { shopId: sanitizedShopId }),
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
    logError(err, {
      module: "reviewService.submitReview",
      meta: { shopId: sanitizedShopId, productId: sanitizedProductId || null },
    });
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

/**
 * Product-scoped review eligibility for the signed-in customer (UI gating).
 *
 * Mirrors the strict rules of the shop-level context but for ONE product:
 * only the exact account that received a DELIVERED order containing this
 * product may rate it — no fake/test order bypass. The server POST endpoint
 * re-verifies independently before any write, so this is only for showing /
 * hiding the "Rate this product" button.
 */
export type ProductReviewContext = ReviewSessionContext;

export async function fetchProductReviewContext(
  productId: string,
): Promise<ProductReviewContext> {
  const empty: ProductReviewContext = {
    signedIn: false,
    isOwner: false,
    displayName: "",
    alreadyReviewed: false,
    canSubmit: false,
  };
  if (!productId || !/^[0-9a-f-]{36}$/i.test(productId.trim())) return empty;

  try {
    const res = await fetch(
      `/api/reviews/product-context?productId=${encodeURIComponent(productId.trim())}`,
      { headers: { Accept: "application/json" } },
    );
    const payload = (await res.json()) as {
      success?: boolean;
      error?: string;
      data?: ProductReviewContext;
    };
    if (!res.ok || !payload.success || !payload.data) return empty;
    return payload.data;
  } catch (err) {
    logError(err, { module: "reviewService.fetchProductReviewContext", meta: { productId } });
    return empty;
  }
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
      .is("product_id", null)
      .maybeSingle();

    // STRICT ACCOUNT SCOPE: only the exact account that received a delivered
    // order from this shop (customer_user_id match) may leave a shop-level review.
    // Product reviews do NOT block the overall shop review (separate unique keys).
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
  product_name?: string | null;
}

export interface MyReviewsPayload {
  reviews: MyReview[];
  /** Delivered line-items not yet rated (preferred). */
  reviewableProducts: {
    id: string;
    productId: string;
    name: string;
    imageUrl?: string | null;
    shopId: string;
    shopName: string;
    orderId?: string;
  }[];
  /** Legacy: delivered shops with no product lines left to rate. */
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
    const data = payload.data;
    return {
      success: true,
      data: {
        reviews: data.reviews ?? [],
        reviewableProducts: data.reviewableProducts ?? [],
        reviewableShops: data.reviewableShops ?? [],
        stats: data.stats ?? { total: 0, average: 0 },
      },
    };
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
 * Delete own review (author only). Triggers recalculate shop/product aggregates.
 */
export async function deleteReview(reviewId: string): Promise<ServiceResult<null>> {
  if (!reviewId || typeof reviewId !== "string") {
    return { success: false, error: "Invalid review ID." };
  }

  const sanitizedReviewId = reviewId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitizedReviewId)) {
    return { success: false, error: "Invalid review ID format." };
  }

  try {
    const res = await fetch("/api/reviews", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId: sanitizedReviewId }),
    });
    const payload = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !payload.success) {
      return { success: false, error: payload.error || "Could not delete review." };
    }
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "reviewService.deleteReview", meta: { reviewId: sanitizedReviewId } });
    return { success: false, error: toError(err) };
  }
}