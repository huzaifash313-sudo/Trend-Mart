/* -------------------------------------------------------------------------- */
/*  TrendsMart — Unified Search API                                            */
/*  GET /api/search?q=shoes&limit=10&type=all|products|shops|deals            */
/*  • Case-insensitive at every layer (normalise → ILIKE → fuzzy rank)        */
/*  • Products: name, title, description (no non-existent products.category)  */
/*  • Parallel fetch → client-side re-rank → interleaved response             */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  fuzzyFilterAndRank,
  buildFuzzyIlikeOr,
  FUZZY_MIN_SCORE,
  normalizeSearchText,
  scoreTextMatch,
} from "@/lib/fuzzySearch";
import { scoreProductPopularity } from "@/lib/marketplaceDiversity";
import { getProductSeoPath } from "@/lib/seo/productSlug";
import { getDealSeoPath } from "@/lib/seo/dealSlug";
import type { MarketplaceProduct } from "@/types";

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

/** Collapse "Chicken Zinger Burger — 10% OFF" → "chicken zinger burger" for dedupe. */
function normalizeDealTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*[—–-]\s*\d+\s*%\s*off\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/*  Shop search                                                                */
/* -------------------------------------------------------------------------- */

async function searchShops(supabase: SupabaseClient, q: string, limit: number) {
  const ilike = buildFuzzyIlikeOr(q, ["name", "category", "location", "store_bio"]);
  if (!ilike) return [];

  const { data, error } = await supabase
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

  if (error) {
    console.error("[api/search] shops:", error.message);
    return [];
  }

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

/* -------------------------------------------------------------------------- */
/*  Product search                                                             */
/* -------------------------------------------------------------------------- */

const PRODUCT_SELECT = [
  "id",
  "name",
  "title",
  "price",
  "original_price",
  "image_url",
  "is_available",
  "created_at",
  "orders_count",
  "click_count",
  "avg_rating",
  "review_count",
  "description",
  "short_code",
  "shop_id",
  "shops!inner ( name, slug, category, is_live, verification_status )",
].join(", ");

async function searchProducts(
  supabase: SupabaseClient,
  q: string,
  limit: number,
  offset = 0,
) {
  // Real columns only — products.category does not exist (use name/title/description).
  const ilike = buildFuzzyIlikeOr(q, ["name", "title", "description"], 12);
  if (!ilike) return { items: [], hasMore: false };

  const pool = clamp(Math.max(limit + offset, limit) * 4, 24, 120);
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_available", true)
    .eq("shops.is_live", true)
    .eq("shops.verification_status", "approved")
    .or(ilike)
    .order("orders_count", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(pool);

  if (error) {
    console.error("[api/search] products:", error.message);
    return { items: [], hasMore: false };
  }

  const rows = (data as unknown as Record<string, unknown>[]) ?? [];

  const ranked = fuzzyFilterAndRank(
    rows,
    q,
    (p) => [
      String(p.name ?? ""),
      String(p.title ?? ""),
      String((p.shops as Record<string, unknown>)?.name ?? ""),
      String((p.shops as Record<string, unknown>)?.category ?? ""),
      String(p.description ?? ""),
    ],
    {
      minScore: FUZZY_MIN_SCORE,
      weights: [1, 0.95, 0.7, 0.55, 0.45],
    },
  );

  const mapped = ranked
    .map((r) => mapProductHit(r.item as Record<string, unknown>, r.score, q))
    .sort((a, b) => b.score - a.score);

  const slice = mapped.slice(offset, offset + limit);
  return { items: slice, hasMore: offset + limit < mapped.length };
}

function mapProductHit(
  p: Record<string, unknown>,
  fuzzyScore: number,
  q: string,
) {
  const shop = (p.shops ?? {}) as Record<string, unknown>;
  const price = Number(p.price) || 0;
  const original = Number(p.original_price) || 0;
  const discountPct =
    original > price ? Math.round(((original - price) / original) * 100) : 0;

  const ageMs = p.created_at ? Date.now() - Date.parse(String(p.created_at)) : 0;
  const freshness = Math.max(0, 100 - (ageMs / (30 * 24 * 60 * 60 * 1000)) * 100);

  const discountSignal =
    discountPct > 0 ? Math.sqrt(Math.min(discountPct, 60) / 60) * 100 : 0;

  const popularity = scoreProductPopularity(p as unknown as MarketplaceProduct);
  const name = String(p.name ?? p.title ?? "");
  // Exact / prefix name matches always rank above popularity noise.
  const nameExact = scoreTextMatch(q, name);
  const blended =
    nameExact * 0.55 +
    fuzzyScore * 0.2 +
    popularity * 0.15 +
    freshness * 0.05 +
    discountSignal * 0.05;

  const shortCode = p.short_code ? String(p.short_code) : null;
  const id = String(p.id);

  return {
    type: "product" as const,
    id,
    name,
    price,
    original_price: original || null,
    discount_pct: discountPct,
    image_url: p.image_url ? String(p.image_url) : null,
    shop_id: String(p.shop_id ?? ""),
    shop_name: String(shop.name ?? ""),
    shop_slug: shop.slug ? String(shop.slug) : null,
    short_code: shortCode,
    path: getProductSeoPath(name, shortCode, id),
    score: blended,
    exact: nameExact >= 94,
  };
}

/* -------------------------------------------------------------------------- */
/*  Deal search                                                                */
/* -------------------------------------------------------------------------- */

async function searchDeals(
  supabase: SupabaseClient,
  q: string,
  limit: number,
  offset = 0,
) {
  const ilike = buildFuzzyIlikeOr(q, ["title", "description", "badge_text"]);
  if (!ilike) return { items: [], hasMore: false };

  const pool = clamp(Math.max(limit + offset, limit) * 4, 12, 80);
  const { data, error } = await supabase
    .from("shop_deals")
    .select(
      "id, title, badge_text, image_url, is_featured, price, original_price, product_id, shop_id, created_at, shops!inner ( name, slug, is_live, verification_status )",
    )
    .eq("is_active", true)
    .eq("shops.is_live", true)
    .eq("shops.verification_status", "approved")
    .or(ilike)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(pool);

  if (error) {
    console.error("[api/search] deals:", error.message);
    return { items: [], hasMore: false };
  }

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

  // One tile per offer title — seed data often clones the same deal across shops
  // with different product_ids, so title-normalize (not product_id) is the key.
  const seen = new Set<string>();
  const deduped: typeof ranked = [];
  for (const r of ranked) {
    const d = r.item;
    const titleKey = normalizeDealTitle(String(d.title ?? ""));
    const key = titleKey || (d.product_id ? String(d.product_id) : String(d.id));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  const mapped = deduped
    .map((r) => mapDealHit(r.item as Record<string, unknown>, r.score, q))
    .sort((a, b) => b.score - a.score);

  const slice = mapped.slice(offset, offset + limit);
  return { items: slice, hasMore: offset + limit < mapped.length };
}

function mapDealHit(
  d: Record<string, unknown>,
  fuzzyScore: number,
  q: string,
) {
  const shop = (d.shops as Record<string, unknown>) ?? {};
  const price = Number(d.price) || 0;
  const original = Number(d.original_price) || 0;
  const discountPct =
    original > price ? Math.round(((original - price) / original) * 100) : 0;
  const id = String(d.id);
  const title = String(d.title ?? "");
  const titleExact = scoreTextMatch(q, title);
  const score = titleExact * 0.6 + fuzzyScore * 0.4;

  return {
    type: "deal" as const,
    id,
    title,
    badge_text: d.badge_text ? String(d.badge_text) : null,
    image_url: d.image_url ? String(d.image_url) : null,
    is_featured: d.is_featured === true,
    price,
    original_price: original || null,
    discount_pct: discountPct,
    shop_id: String(d.shop_id ?? ""),
    shop_name: String(shop.name ?? ""),
    shop_slug: shop.slug ? String(shop.slug) : null,
    path: getDealSeoPath(title, id),
    score,
    exact: titleExact >= 94,
  };
}

/* -------------------------------------------------------------------------- */
/*  Handler                                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const rawQ = (searchParams.get("q") ?? "").trim();
  const q = normalizeSearchText(rawQ);
  const type = searchParams.get("type") ?? "all";
  const limit = clamp(Number(searchParams.get("limit") ?? "10"), 4, 24);
  const offset = Math.max(0, Math.floor(Number(searchParams.get("offset") ?? "0") || 0));

  if (!q) {
    return NextResponse.json({
      query: "",
      results: [],
      related: [],
      counts: { products: 0, shops: 0, deals: 0 },
      hasMore: false,
      nextOffset: 0,
    });
  }

  const supabase = await createServerClient();

  const [productsRes, shops, dealsRes] = await Promise.all([
    type === "shops" || type === "deals"
      ? { items: [], hasMore: false }
      : searchProducts(supabase, q, limit, type === "products" ? offset : 0),
    type === "products" || type === "deals" ? [] : searchShops(supabase, q, limit),
    type === "products" || type === "shops"
      ? { items: [], hasMore: false }
      : searchDeals(supabase, q, limit, type === "deals" ? offset : 0),
  ]);

  const products = productsRes.items;
  const deals = dealsRes.items;
  const p = [...products].sort((a, b) => b.score - a.score);
  const s = [...shops].sort((a, b) => b.score - a.score);
  const d = [...deals].sort((a, b) => b.score - a.score);

  // Exact hits first in "all", then related (non-exact) so shoppers see true matches.
  const exactFirst = <T extends { exact?: boolean; score: number }>(items: T[]) => {
    const exact = items.filter((i) => i.exact);
    const rest = items.filter((i) => !i.exact);
    return [...exact, ...rest];
  };

  let mixed: (typeof p[number] | typeof s[number] | typeof d[number])[] = [];
  if (type === "products") {
    mixed = exactFirst(p);
  } else if (type === "deals") {
    mixed = exactFirst(d);
  } else if (type === "shops") {
    mixed = s;
  } else {
    const pExact = exactFirst(p);
    const dExact = exactFirst(d);
    const maxLen = Math.max(pExact.length, s.length, dExact.length);
    for (let i = 0; i < maxLen; i++) {
      if (pExact[i]) mixed.push(pExact[i]);
      if (s[i]) mixed.push(s[i]);
      if (dExact[i]) mixed.push(dExact[i]);
    }
  }

  // Related = soft matches (non-exact) from the same page — no extra DB hit.
  const related = mixed.filter((r) => "exact" in r && r.exact === false).slice(0, 8);
  const primary = mixed.filter((r) => !("exact" in r) || r.exact !== false);

  const hasMore =
    type === "products"
      ? productsRes.hasMore
      : type === "deals"
        ? dealsRes.hasMore
        : false;

  return NextResponse.json(
    {
      query: rawQ,
      results: primary.length > 0 ? primary : mixed,
      related: primary.length > 0 ? related : [],
      counts: {
        products: products.length,
        shops: shops.length,
        deals: deals.length,
      },
      hasMore,
      nextOffset: offset + limit,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
