/* -------------------------------------------------------------------------- */
/*  POST /api/reviews  — submit a verified customer review                    */
/*  PATCH /api/reviews — shop owner reply                                     */
/* -------------------------------------------------------------------------- */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  checkRateLimit,
  RATE_LIMITS,
  buildRateLimitResponse,
} from "@/lib/rateLimiter";
import { sanitizeHtml, sanitizeLight, sanitizeNumeric, truncate } from "@/lib/sanitization";
import { lockedDisplayName, phonesMatch, normalizePhoneDigits, MAX_REVIEWS_PER_IP_PER_DAY } from "@/lib/reviewRules";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIp(request: NextRequest): string {
  // SECURITY: prefer proxy-set headers that a client cannot spoof. Only fall
  // back to `x-forwarded-for` (which a client can forge) as a last resort.
  const raw =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return raw.replace(/[^0-9a-fA-F.:]/g, "").slice(0, 45) || "unknown";
}

function hashIp(ip: string): string {
  const salt = process.env.REVIEW_IP_SALT || "trendmart-review-ip";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function sanitizeComment(comment: unknown): string {
  if (typeof comment !== "string") return "";
  let cleaned = sanitizeHtml(sanitizeLight(comment.trim()));
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return truncate(cleaned, 1000);
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { ...RATE_LIMITS.REVIEWS, name: "reviews-post" });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  let body: { shopId?: string; rating?: unknown; comment?: unknown };
  try {
    body = (await request.json()) as { shopId?: string; rating?: unknown; comment?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  const shopId = typeof body.shopId === "string" ? body.shopId.trim() : "";
  if (!UUID_RE.test(shopId)) {
    return NextResponse.json({ success: false, error: "Invalid shop." }, { status: 400 });
  }

  const rating = sanitizeNumeric(body.rating, 1, 5, 0);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ success: false, error: "Rating must be a whole number between 1 and 5." }, { status: 400 });
  }

  const comment = sanitizeComment(body.comment);
  if (comment.length > 20) {
    const capsRatio =
      comment.replace(/[^A-Z]/g, "").length / Math.max(1, comment.replace(/[^a-zA-Z]/g, "").length);
    if (/(.)\1{9,}/.test(comment) || capsRatio > 0.7) {
      return NextResponse.json({ success: false, error: "Please write a genuine review." }, { status: 400 });
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Sign in to leave a review." },
      { status: 401 },
    );
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("id, owner_id")
    .eq("id", shopId)
    .maybeSingle();

  if (!shop) {
    return NextResponse.json({ success: false, error: "Shop not found." }, { status: 404 });
  }
  if (shop.owner_id === user.id) {
    return NextResponse.json(
      { success: false, error: "You cannot review your own store." },
      { status: 403 },
    );
  }

  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("shop_id", shopId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { success: false, error: "You have already reviewed this store." },
      { status: 409 },
    );
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, phone")
    .eq("user_id", user.id)
    .maybeSingle();

  const displayName = lockedDisplayName(
    profile?.full_name,
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    user.email,
  );
  if (!displayName) {
    return NextResponse.json(
      { success: false, error: "Add your name in account settings before reviewing." },
      { status: 400 },
    );
  }

  // Primary: exact account match (orders store customer_user_id). Targeted and
  // index-friendly — no `.limit(80)` sweep that could miss heavy buyers.
  const { data: userOrders } = await supabase
    .from("orders")
    .select("id, status")
    .eq("shop_id", shopId)
    .eq("customer_user_id", user.id)
    .limit(1);

  let purchased = (userOrders ?? []).some(
    (row) => String(row.status ?? "").toLowerCase() !== "cancelled",
  );

  // Secondary: phone fallback for orders placed before sign-up (guest checkout).
  if (!purchased && profile?.phone) {
    const last10 = normalizePhoneDigits(profile.phone).slice(-10);
    if (last10.length === 10) {
      const { data: phoneOrders } = await supabase
        .from("orders")
        .select("id, customer_phone, status")
        .eq("shop_id", shopId)
        .like("customer_phone", `%${last10}`)
        .limit(5);
      purchased = (phoneOrders ?? []).some((row) => {
        if (String(row.status ?? "").toLowerCase() === "cancelled") return false;
        return phonesMatch(row.customer_phone, profile.phone);
      });
    }
  }

  if (!purchased) {
    return NextResponse.json(
      { success: false, error: "Only customers who ordered from this store can leave a review." },
      { status: 403 },
    );
  }

  const ipHash = hashIp(clientIp(request));
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count: ipDayCount } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("visitor_ip_hash", ipHash)
    .gte("created_at", dayAgo);

  if ((ipDayCount ?? 0) >= MAX_REVIEWS_PER_IP_PER_DAY) {
    return NextResponse.json(
      { success: false, error: "Too many reviews from this network. Try again later." },
      { status: 429 },
    );
  }

  const { data: recentSameShop } = await supabase
    .from("reviews")
    .select("id")
    .eq("shop_id", shopId)
    .eq("visitor_ip_hash", ipHash)
    .gte("created_at", weekAgo)
    .limit(1)
    .maybeSingle();

  if (recentSameShop) {
    return NextResponse.json(
      { success: false, error: "A review from this network was already posted for this store." },
      { status: 429 },
    );
  }

  const { data: inserted, error } = await supabase
    .from("reviews")
    .insert({
      shop_id: shopId,
      user_id: user.id,
      customer_name: displayName,
      rating,
      comment,
      visitor_ip_hash: ipHash,
      verified_purchase: true,
    })
    .select("id, shop_id, customer_name, rating, comment, created_at, merchant_reply, merchant_reply_at, verified_purchase")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { success: false, error: "You have already reviewed this store." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Could not submit review. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, data: inserted });
}

export async function PATCH(request: NextRequest) {
  const limited = checkRateLimit(request, { ...RATE_LIMITS.REVIEWS, name: "reviews-reply" });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  let body: { reviewId?: string; reply?: unknown };
  try {
    body = (await request.json()) as { reviewId?: string; reply?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  const reviewId = typeof body.reviewId === "string" ? body.reviewId.trim() : "";
  if (!UUID_RE.test(reviewId)) {
    return NextResponse.json({ success: false, error: "Invalid review." }, { status: 400 });
  }

  const reply = sanitizeComment(body.reply);
  if (!reply) {
    return NextResponse.json({ success: false, error: "Reply cannot be empty." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });
  }

  const { data: review } = await supabase
    .from("reviews")
    .select("id, shop_id")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) {
    return NextResponse.json({ success: false, error: "Review not found." }, { status: 404 });
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("owner_id")
    .eq("id", review.shop_id)
    .maybeSingle();
  if (!shop || shop.owner_id !== user.id) {
    return NextResponse.json(
      { success: false, error: "Only the store owner can reply." },
      { status: 403 },
    );
  }

  const { data: updated, error } = await supabase
    .from("reviews")
    .update({
      merchant_reply: reply,
      merchant_reply_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .select("id, shop_id, customer_name, rating, comment, created_at, merchant_reply, merchant_reply_at, verified_purchase")
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: "Could not save reply." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, data: updated });
}
