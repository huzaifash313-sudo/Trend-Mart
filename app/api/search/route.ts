/* -------------------------------------------------------------------------- */
/*  TrendsMart — Unified Search API                                            */
/*  GET /api/search?q=shoes&limit=10                                           */
/*  Returns combined results: products + shops + deals ranked by relevance.   */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { fuzzyFilterAndRank, buildFuzzyIlikeOr, FUZZY_MIN_SCORE } from "@/lib/fuzzySearch";
import { scoreProductPopularity } from "@/lib/marketplaceDiversity";
import type { MarketplaceProduct } from "@/types";

/** Clamp a number between min and max. */
function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

// ─── Shop search ─────────────────────────────────────────────────────────────

async function searchShops(supabase: SupabaseClient, q: string, limit: number) {
  const ilike = buildFuzzyIlikeOr(q, ["name", "category", "location", "store_bio"]);
  if (!ilike) return [];

  let query = supabase
    .from("shops")
    .select("id, name, slug, category, location, logo_url, avg_rating, review_count, store_bio")
    .eq("is_live", true)
    .eq("verification_status", "approved")
    .or(ilike)
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .order("review_count", { ascending: false, nullsFirst: false })
    .limit(clamp(limit * 3, 10, 60));

  const { data } = await query;
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  const ranked = fuzzyFilterAndRank(
    rows,
    q,
    (s) => [
      String(s.name ?? ""),
      String(s.category ?? ""),
      String(s.location ?? ""),
      String(s.store_bio ?? ""),
    ],
    { minScore: FUZZY_MIN_SCORE, weights: [1, 0.75, 0.6, 0.45] },
  );

  return ranked.slice(0, limit).map((r) => ({
    type: "shop" as const,
    id: String(r.item.id),
    name: String(r.item.name ?? ""),
    slug: r.item.slug ? String(r.item.slug) : null,
    category: String(r.item.category ?? ""),
    location: String(r.item.location ?? ""),
    logo_url: r.item.logo_url ? String(r.item.logo_url) : null,
    avg_rating: Number(r.item.avg_rating) || 0,
    score: r.score,
  }));
}

// ─── Product search ───────────────────────────────────────────────────────────

const PRODUCT_SELECT = [
  "id",
  "name",
  "price",
  "original_price",
  "image_url",
  "is_available",
  "created_at",
  "orders_count",
  "click_count",
  "avg_rating",
  "review_count",
  "shop_id",
  "shops:shop_id ( name, slug, avg_rating, review_count, is_live, verification_status )",
].join(", ");

async function searchProducts(supabase: SupabaseClient, q: string, limit: number) {
  const ilike = buildFuzzyIlikeOr(q, ["name", "description"]);
  if (!ilike) return [];

  const { data } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_available", true)
    .eq("shops.is_live", true)
    .eq("shops.verification_status", "approved")
    .or(ilike)
    .order("created_at", { ascending: false })
    .limit(clamp(limit * 3, 20, 90));

  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  const ranked = fuzzyFilterAndRank(
    rows,
    q,
    (p) => [
      String(p.name ?? ""),
      String((p.shops as Record<string, unknown>)?.name ?? ""),
    ],
    { minScore: FUZZY_MIN_SCORE, weights: [1, 0.65] },
  );

  return ranked.slice(0, limit).map((r) => {
    const p = r.item as Record<string, unknown>;
    const shop = (p.shops ?? {}) as Record<string, unknown>;
    const price = Number(p.price) || 0;
    const original = Number(p.original_price) || 0;
    const discountPct =
      original > price ? Math.round(((original - price) / original) * 100) : 0;

    // Freshness decay (0–100)
    const ageMs = p.created_at ? Date.now() - Date.parse(String(p.created_at)) : 0;
    const freshness = Math.max(0, 100 - (ageMs / (30 * 24 * 60 * 60 * 1000)) * 100);
    const discountSignal = discountPct > 0 ? Math.sqrt(Math.min(discountPct, 60) / 60) * 100 : 0;
    const popularity = scoreProductPopularity(p as unknown as MarketplaceProduct);
    const blended = r.score * 0.5 + popularity * 0.25 + freshness * 0.15 + discountSignal * 0.1;

    return {
      type: "product" as const,
      id: String(p.id),
      name: String(p.name ?? ""),
      price,
      original_price: original || null,
      discount_pct: discountPct,
      image_url: p.image_url ? String(p.image_url) : null,
      shop_id: String(p.shop_id ?? ""),
      shop_name: String(shop.name ?? ""),
      shop_slug: shop.slug ? String(shop.slug) : null,
      score: blended,
    };
  });
}

// ─── Deal search ──────────────────────────────────────────────────────────────

async function searchDeals(supabase: SupabaseClient, q: string, limit: number) {
  const ilike = buildFuzzyIlikeOr(q, ["title", "description", "badge_text"]);
  if (!ilike) return [];

  const { data } = await supabase
    .from("shop_deals")
    .select(
      "id, title, badge_text, image_url, is_featured, price, original_price, shop_id, created_at, shops:shop_id ( name, slug )",
    )
    .eq("is_active", true)
    .or(ilike)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(clamp(limit * 3, 10, 60));

  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  const ranked = fuzzyFilterAndRank(
    rows,
    q,
    (d) => [
      String(d.title ?? ""),
      String(d.badge_text ?? ""),
      String((d.shops as Record<string, unknown>)?.name ?? ""),
    ],
    { minScore: FUZZY_MIN_SCORE, weights: [1, 0.9, 0.7] },
  );

  return ranked.slice(0, limit).map((r) => {
    const d = r.item as Record<string, unknown>;
    const shop = (d.shops ?? {}) as Record<string, unknown>;
    const price = Number(d.price) || 0;
    const original = Number(d.original_price) || 0;
    const discountPct =
      original > price ? Math.round(((original - price) / original) * 100) : 0;

    return {
      type: "deal" as const,
      id: String(d.id),
      title: String(d.title ?? ""),
      badge_text: d.badge_text ? String(d.badge_text) : null,
      image_url: d.image_url ? String(d.image_url) : null,
      is_featured: d.is_featured === true,
      price,
      original_price: original || null,
      discount_pct: discountPct,
      shop_id: String(d.shop_id ?? ""),
      shop_name: String(shop.name ?? ""),
      shop_slug: shop.slug ? String(shop.slug) : null,
      score: r.score,
    };
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const type = searchParams.get("type") ?? "all"; // all | products | shops | deals
  const limit = clamp(Number(searchParams.get("limit") ?? "8"), 4, 20);

  if (!q) {
    return NextResponse.json({ query: "", results: [] }, { status: 200 });
  }

  const supabase = await createServerClient();

  const [products, shops, deals] = await Promise.all([
    type === "shops" || type === "deals" ? [] : searchProducts(supabase, q, limit),
    type === "products" || type === "deals" ? [] : searchShops(supabase, q, limit),
    type === "products" || type === "shops" ? [] : searchDeals(supabase, q, limit),
  ]);

  // Interleave: highest-scoring item from each bucket first, then second, etc.
  // This gives users a mix rather than "all products then all shops then all deals".
  const MAX_EACH = limit;
  const mixed: (typeof products[number] | typeof shops[number] | typeof deals[number])[] = [];
  const p = products.slice(0, MAX_EACH);
  const s = shops.slice(0, MAX_EACH);
  const d = deals.slice(0, MAX_EACH);
  const maxLen = Math.max(p.length, s.length, d.length);

  for (let i = 0; i < maxLen; i++) {
    if (p[i]) mixed.push(p[i]);
    if (s[i]) mixed.push(s[i]);
    if (d[i]) mixed.push(d[i]);
  }

  return NextResponse.json(
    {
      query: q,
      results: mixed,
      counts: {
        products: products.length,
        shops: shops.length,
        deals: deals.length,
      },
    },
    {
      status: 200,
      headers: {
        // Short CDN cache — search results should feel fresh
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
