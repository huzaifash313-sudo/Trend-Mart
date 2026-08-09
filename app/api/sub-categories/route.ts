/* -------------------------------------------------------------------------- */
/*  TrendMart — Sub-Categories API Endpoint                                    */
/*  GET /api/sub-categories?category=<main_category>                           */
/*                                                                             */
/*  PROMPT 5: Enhanced with secure caching layer, response sanitization,       */
/*            hardened error handling, and ETag-based cache validation.        */
/*                                                                             */
/*  Returns all active sub-categories for a given main category, always        */
/*  including the mandatory 'Others / General' fallback.                       */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SubCategory } from "@/types";
import { SHOP_CATEGORIES } from "@/types";
import { sanitizeLight } from "@/lib/sanitization";
import {
  apiCache,
  buildCacheKey,
  generateETag,
  getCacheHeaders,
  startCacheCleanup,
} from "@/lib/apiCache";
import { sanitizeApiResponse, buildSafeErrorResponse } from "@/lib/responseSanitizer";

// ─── Initialize cache cleanup on first import (server-side) ──────────────────
startCacheCleanup();

// ─── Allowed categories (single source: types/SHOP_CATEGORIES) ─

const ALLOWED_CATEGORIES = SHOP_CATEGORIES;

// ─── Cache configuration ─────────────────────────────────────────────────────

const CACHE_NAMESPACE = "subcategories";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Server-side Supabase client ─────────────────────────────────────────────

function getServerClient() {
  // PROMPT 5: Never hardcode credentials — always use environment variables
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!url || !key) {
    // Return null to signal that the client cannot be created
    return null;
  }

  return createClient(url, key, {
    db: {
      schema: "public",
    },
  });
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCategory = searchParams.get("category");

    // ── Validate required parameter ───────────────────────────────────────
    if (!rawCategory) {
      return NextResponse.json(
        buildSafeErrorResponse(400, "Missing 'category' query parameter."),
        {
          status: 400,
          headers: getCacheHeaders("private"),
        },
      );
    }

    // Sanitize and validate the category against allowed values
    const category = sanitizeLight(rawCategory);
    if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json(
        buildSafeErrorResponse(400, `Invalid category: "${category}". Please provide a valid main category.`),
        {
          status: 400,
          headers: getCacheHeaders("private"),
        },
      );
    }

    // ── PROMPT 5: Check cache first ───────────────────────────────────────
    const cacheKey = buildCacheKey([category]);
    const cachedData = apiCache.get<SubCategory[]>(CACHE_NAMESPACE, cacheKey);

    // Check for conditional request (If-None-Match / ETag)
    const ifNoneMatch = request.headers.get("if-none-match");
    const cachedEntry = apiCache.getEntry(CACHE_NAMESPACE, cacheKey);
    const currentEtag = cachedEntry
      ? generateETag(cachedEntry.data)
      : undefined;

    if (ifNoneMatch && currentEtag && ifNoneMatch === currentEtag && cachedData) {
      // PROMPT 5: 304 Not Modified — client can use its cached copy
      return new NextResponse(null, {
        status: 304,
        headers: {
          ...getCacheHeaders("static"),
          ETag: currentEtag,
        },
      });
    }

    if (cachedData) {
      // PROMPT 5: Return cached response
      const sanitized = sanitizeApiResponse({
        success: true,
        data: cachedData,
        category,
        total: cachedData.length,
      });

      return NextResponse.json(sanitized, {
        status: 200,
        headers: {
          ...getCacheHeaders("static"),
          ETag: currentEtag ?? generateETag(cachedData),
          "X-Cache": "HIT",
        },
      });
    }

    // ── Cache miss: fetch from database ───────────────────────────────────
    const supabase = getServerClient();
    if (!supabase) {
      return NextResponse.json(
        buildSafeErrorResponse(500, "Service temporarily unavailable. Please try again later."),
        {
          status: 500,
          headers: getCacheHeaders("private"),
        },
      );
    }

    const { data, error } = await supabase
      .from("sub_categories")
      .select("*")
      .eq("category", category)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      // PROMPT 5: Safe error — don't expose database error details
      return NextResponse.json(
        buildSafeErrorResponse(500, "Unable to fetch sub-categories.", error),
        {
          status: 500,
          headers: getCacheHeaders("static"),
        },
      );
    }

    const subs = (data as SubCategory[]) ?? [];
    const hasOthers = subs.some((s) => s.is_others);

    // Programmatic 'Others' fallback — guaranteed for every category
    if (!hasOthers) {
      subs.push({
        id: `fallback-others-${category.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`,
        category,
        name: "Others / General",
        slug: `${category.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-others`,
        description: `General items in ${category}`,
        icon: "📦",
        is_active: true,
        sort_order: 999,
        is_others: true,
      });
    }

    // ── PROMPT 5: Sanitize response data before caching ───────────────────
    // Strip any internal fields that might have leaked from the database
    const sanitizedSubs = subs.map((sub) => ({
      id: sub.id,
      category: sub.category,
      name: sanitizeLight(sub.name),
      slug: sub.slug,
      description: sub.description ? sanitizeLight(sub.description) : undefined,
      icon: sub.icon,
      is_active: sub.is_active,
      sort_order: sub.sort_order,
      is_others: sub.is_others,
    })) as SubCategory[];

    // ── PROMPT 5: Store in cache ──────────────────────────────────────────
    apiCache.set(CACHE_NAMESPACE, cacheKey, sanitizedSubs, {
      ttl: CACHE_TTL_MS,
      maxEntries: 100,
    });

    // ── PROMPT 5: Build safe response ─────────────────────────────────────
    const responsePayload = sanitizeApiResponse({
      success: true,
      data: sanitizedSubs,
      category,
      total: sanitizedSubs.length,
    });

    const newEtag = generateETag(sanitizedSubs);

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: {
        ...getCacheHeaders("static"),
        ETag: newEtag,
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    // PROMPT 5: Catch-all error — never leak raw error details
    const message = err instanceof Error ? err.message : "Unknown error.";
    // Log the error server-side but don't expose it
    if (process.env.NODE_ENV !== "production") {
      console.error("[SubCategories API Error]", message);
    }

    return NextResponse.json(
      buildSafeErrorResponse(500, "An unexpected error occurred. Please try again."),
      {
        status: 500,
        headers: getCacheHeaders("private"),
      },
    );
  }
}

// ─── OPTIONS (CORS preflight) ───────────────────────────────────────────────

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, If-None-Match",
        ...getCacheHeaders("static"),
      },
    },
  );
}