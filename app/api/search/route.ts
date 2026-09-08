/* -------------------------------------------------------------------------- */
/*  TrendsMart — Unified Search API                                            */
/*  GET /api/search?q=shoes&limit=10&type=all|products|shops|deals            */
/*  • Case-insensitive at every layer (normalise → ILIKE → fuzzy rank)        */
/*  • Searches: name, category, description, shop name, store_bio             */
/*  • Parallel fetch → client-side re-rank → interleaved response             */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  fuzzyFilterAndRank,
  buildFuzzyIlikeOr,
  FUZZY_MIN_SCORE,
  normalizeSearchText,
} from "@/lib/fuzzySearch";
import { scoreProductPopularity } from "@/lib/marketplaceDiversity";
import type { MarketplaceProduct } from "@/types";

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

/* -------------------------------------------------------------------------- */
/*  Shop search                                                                */
/* -------------------------------------------------------------------------- */

async function searchShops(supabase: SupabaseClient, q: string, limit: number) {
  // Search across name, category, location AND store_bio
  const ilike = buildFuzzyIlikeOr(q, ["name", "category", "location", "store_bio"]);
  if (!ilike) return [];

  const { data } = await supabase
    .from("shops")
    .select(
      "id, name, slug, category, location, logo_url, avg_rating, review_count, store_bio",
    )
    .eq("is_live", true)
    .eq("verification_status", "approved")
    .or(ilike)
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .order("review_count", { ascending: false, nullsFirst: false })
    .limit(clamp(limit * 4, 12, 80));

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
    {
      minScore: FUZZY_MIN_SCORE,
      weights: [1, 0.85, 0.65, 0.5],
    },
  );

  return ranked.slice(0, limit).map((r) => ({
    type: "shop" as const,
    id:         String(r.item.id),
    name:       String(r.item.name ?? ""),
    slug:       r.item.slug ? String(r.item.slug) : null,
    category:   String(r.item.category ?? ""),
    location:   String(r.item.location ?? ""),
    logo_url:   r.item.logo_url ? String(r.item.logo_url) : null,
    avg_rating: Number(r.item.avg_rating) || 0,
    score:      r.score,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Product search                                                             */
/* -------------------------------------------------------------------------- */

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
  "category",                   // ← searched now
  "description",
  "shop_id",
  "shops:shop_id ( name, slug, category, is_live, verification_status )",
].join(", ");

async function searchProducts(supabase: SupabaseClient, q: string, limit: number) {
  // Search name, category, AND description — catches "grocery", "clothing" etc.
  const ilike = buildFuzzyIlikeOr(q, ["name", "category", "description"]);
  if (!ilike) return [];

  const { data } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_available", true)
    .or(ilike)
    .order("orders_count", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(clamp(limit * 4, 24, 120));

  const rows = (data as unknown as Record<string, unknown>[]) ?? [];

  // Filter to only approved shops (do it client-side so the join filter
  // doesn't interfere with the top-level OR clause)
  const liveRows = rows.filter((p) => {
    const shop = (p.shops ?? {}) as Record<string, unknown>;
    return shop.is_live === true && shop.verification_status === "approved";
  });

  const ranked = fuzzyFilterAndRank(
    liveRows,
    q,
    (p) => [
      String(p.name ?? ""),
      String(p.category ?? ""),
      String((p.shops as Record<string, unknown>)?.name ?? ""),
      String(p.description ?? ""),
    ],
    {
      minScore: FUZZY_MIN_SCORE,
      weights: [1, 0.8, 0.7, 0.5],
    },
  );

  return ranked.slice(0, limit).map((r) => {
    const p    = r.item as Record<string, unknown>;
    const shop = (p.shops ?? {}) as Record<string, unknown>;
    const price    = Number(p.price) || 0;
    const original = Number(p.original_price) || 0;
    const discountPct =
      original > price ? Math.round(((original - price) / original) * 100) : 0;

    // Freshness signal (0–100, decays over 30 days)
    const ageMs     = p.created_at ? Date.now() - Date.parse(String(p.created_at)) : 0;
    const freshness = Math.max(0, 100 - (ageMs / (30 * 24 * 60 * 60 * 1000)) * 100);

    // Discount signal (0–100, sqrt to avoid over-weighting)
    const discountSignal =
      discountPct > 0 ? Math.sqrt(Math.min(discountPct, 60) / 60) * 100 : 0;

    const popularity = scoreProductPopularity(p as unknown as MarketplaceProduct);
    const blended    =
      r.score * 0.5 + popularity * 0.25 + freshness * 0.15 + discountSignal * 0.1;

    return {
      type:          "product" as const,
      id:            String(p.id),
      name:          String(p.name ?? ""),
      price,
      original_price: original || null,
      discount_pct:  discountPct,
      image_url:     p.image_url ? String(p.image_url) : null,
      shop_id:       String(p.shop_id ?? ""),
      shop_name:     String(shop.name ?? ""),
      shop_slug:     shop.slug ? String(shop.slug) : null,
      score:         blended,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Deal search                                                                */
/* -------------------------------------------------------------------------- */

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
    .limit(clamp(limit * 4, 12, 80));

  const rows   = (data as unknown as Record<string, unknown>[]) ?? [];
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
    const d    = r.item as Record<string, unknown>;
    const shop = (d.shops ?? {}) as Record<string, unknown>;
    const price    = Number(d.price) || 0;
    const original = Number(d.original_price) || 0;
    const discountPct =
      original > price ? Math.round(((original - price) / original) * 100) : 0;

    return {
      type:          "deal" as const,
      id:            String(d.id),
      title:         String(d.title ?? ""),
      badge_text:    d.badge_text ? String(d.badge_text) : null,
      image_url:     d.image_url ? String(d.image_url) : null,
      is_featured:   d.is_featured === true,
      price,
      original_price: original || null,
      discount_pct:  discountPct,
      shop_id:       String(d.shop_id ?? ""),
      shop_name:     String(shop.name ?? ""),
      shop_slug:     shop.slug ? String(shop.slug) : null,
      score:         r.score,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Handler                                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Always normalise the raw query — caps/small NEVER matter here
  const rawQ  = (searchParams.get("q") ?? "").trim();
  const q     = normalizeSearchText(rawQ);   // lowercased, cleaned
  const type  = searchParams.get("type") ?? "all";
  const limit = clamp(Number(searchParams.get("limit") ?? "10"), 4, 24);

  if (!q) {
    return NextResponse.json({ query: "", results: [], counts: { products: 0, shops: 0, deals: 0 } });
  }

  const supabase = await createServerClient();

  // Run all three in parallel — independent queries
  const [products, shops, deals] = await Promise.all([
    type === "shops"    || type === "deals"    ? [] : searchProducts(supabase, q, limit),
    type === "products" || type === "deals"    ? [] : searchShops(supabase, q, limit),
    type === "products" || type === "shops"    ? [] : searchDeals(supabase, q, limit),
  ]);

  // Sort each bucket by blended score desc, then interleave round-robin
  const p = [...products].sort((a, b) => b.score - a.score).slice(0, limit);
  const s = [...shops   ].sort((a, b) => b.score - a.score).slice(0, limit);
  const d = [...deals   ].sort((a, b) => b.score - a.score).slice(0, limit);

  const mixed: (typeof p[number] | typeof s[number] | typeof d[number])[] = [];
  const maxLen = Math.max(p.length, s.length, d.length);
  for (let i = 0; i < maxLen; i++) {
    if (p[i]) mixed.push(p[i]);
    if (s[i]) mixed.push(s[i]);
    if (d[i]) mixed.push(d[i]);
  }

  return NextResponse.json(
    {
      query:   rawQ,          // return original so UI can display it
      results: mixed,
      counts: {
        products: products.length,
        shops:    shops.length,
        deals:    deals.length,
      },
    },
    {
      status: 200,
      headers: {
        // Short cache — results should feel fresh
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
