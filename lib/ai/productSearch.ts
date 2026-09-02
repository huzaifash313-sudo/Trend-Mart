/* Server-side product search for AI assistant — returns deep links */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fuzzyFilterAndRank, FUZZY_MIN_SCORE } from "@/lib/fuzzySearch";
import { getProductSeoPath } from "@/lib/seo/productSlug";
import { buildSupabaseOrFilter, detectSortMode, expandSearchTerms, applySpellFixes, type SearchSortMode } from "@/lib/ai/queryExpand";
import { getShopCategoryPrompts } from "@/lib/ai/shopCategoryPrompts";
import { sanitizeChatNumber, sanitizeChatString } from "@/lib/ai/sanitize";
import { haversineDistance } from "@/services/geoRadiusService";

export interface ProductSearchHit {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  shopId: string;
  shopName: string;
  shopLocation: string;
  score: number;
  discountPct: number;
  productPath: string;
  shopPath: string;
  imageUrl: string | null;
  distanceKm: number | null;
  avgRating?: number;
  reviewCount?: number;
}

type ProductRow = {
  id: string;
  name: string;
  price: number;
  original_price: number | null;
  short_code: string | null;
  description: string;
  image_url: string | null;
  images: string[] | null;
  shop_id: string;
  avg_rating?: number | null;
  review_count?: number | null;
  shops: {
    id: string;
    name: string;
    location: string;
    is_live: boolean;
    latitude?: number | null;
    longitude?: number | null;
    category?: string | null;
  } | null;
};

function sanitizeSearchTerm(input: string): string {
  return input
    .replace(/[%_\\]/g, "")
    .replace(/[^\w\s\u0600-\u06FF-]/g, " ")
    .trim()
    .slice(0, 80);
}

function discountPercent(price: number, original: number | null): number {
  if (!original || original <= price) return 0;
  return Math.round(((original - price) / original) * 100);
}

function rankBoost(query: string, hit: ProductSearchHit, sortMode?: SearchSortMode): number {
  let boost = 0;
  const q = query.toLowerCase();
  const name = hit.name.toLowerCase();
  if (name.includes(q)) boost += 15;
  if (name.startsWith(q)) boost += 8;
  if (hit.discountPct >= 5) boost += Math.min(hit.discountPct / 2, 12);
  if (sortMode === "best_pick" && hit.discountPct >= 3) boost += hit.discountPct;
  // Denormalized product rating — no extra query; lifts trusted items.
  const rating = Number(hit.avgRating) || 0;
  const reviews = Number(hit.reviewCount) || 0;
  if (rating >= 4 && reviews > 0) boost += Math.min(rating * 1.5 + Math.log10(reviews + 1) * 2, 10);
  else if (rating > 0 && reviews > 0) boost += Math.min(rating, 5);
  return boost;
}

export async function searchProductsForAssistant(
  supabase: SupabaseClient,
  options: {
    query: string;
    shopId?: string;
    limit?: number;
    sortMode?: SearchSortMode;
    originalMessage?: string;
    userLat?: number;
    userLng?: number;
  },
): Promise<ProductSearchHit[]> {
  const query = applySpellFixes(sanitizeSearchTerm(options.query));
  if (!query || query.length < 2) return [];

  const sortMode = options.sortMode ?? (options.originalMessage ? detectSortMode(options.originalMessage) : "relevance");
  const limit = options.limit ?? 6;
  const expandedTerms = expandSearchTerms(query);

  let dbQuery = supabase
    .from("products")
    .select(
      "id, name, price, original_price, short_code, description, image_url, images, shop_id, is_available, avg_rating, review_count, shops!inner(id, name, location, is_live, latitude, longitude)",
    )
    .eq("is_available", true)
    .eq("shops.is_live", true);

  if (options.shopId) {
    dbQuery = dbQuery.eq("shop_id", sanitizeChatString(options.shopId, 100));
  }

  dbQuery = dbQuery.or(buildSupabaseOrFilter(expandedTerms));

  let { data, error } = await dbQuery.limit(150);

  // Pre-migration: product rating columns may be missing.
  if (error && /avg_rating|review_count|column .* does not exist/i.test(error.message || "")) {
    let legacy = supabase
      .from("products")
      .select(
        "id, name, price, original_price, short_code, description, image_url, images, shop_id, is_available, shops!inner(id, name, location, is_live, latitude, longitude)",
      )
      .eq("is_available", true)
      .eq("shops.is_live", true);
    if (options.shopId) {
      legacy = legacy.eq("shop_id", sanitizeChatString(options.shopId, 100));
    }
    legacy = legacy.or(buildSupabaseOrFilter(expandedTerms));
    const fallback = await legacy.limit(150);
    data = fallback.data;
    error = fallback.error;
  }

  let rows: ProductRow[] = [];
  if (!error && data?.length) {
    rows = (data as unknown as ProductRow[]).filter((r) => r.shops?.is_live !== false);
  }

  if (!rows.length) return [];

  const ranked = fuzzyFilterAndRank(
    rows,
    query,
    (r) => [r.name, r.description, r.shops?.name, r.shops?.location],
    { minScore: Math.max(FUZZY_MIN_SCORE - 12, 14), limit: 20 },
  );

  const hits: ProductSearchHit[] = ranked.map(({ item, score }) => {
    const price = sanitizeChatNumber(item.price, 0);
    const original = item.original_price != null ? sanitizeChatNumber(item.original_price, 0) : null;
    const name = sanitizeChatString(item.name, 100);
    const shopName = sanitizeChatString(item.shops?.name, 80) || "Shop";
    const shopId = sanitizeChatString(item.shop_id, 100);
    const imageFromArr = Array.isArray(item.images) ? item.images.find((u) => typeof u === "string" && u.length > 0) : null;
    const imageUrl = (item.image_url && String(item.image_url)) || imageFromArr || null;
    let distanceKm: number | null = null;
    if (
      options.userLat != null &&
      options.userLng != null &&
      item.shops?.latitude != null &&
      item.shops?.longitude != null
    ) {
      distanceKm = haversineDistance(
        options.userLat,
        options.userLng,
        Number(item.shops.latitude),
        Number(item.shops.longitude),
      );
    }
    const hit: ProductSearchHit = {
      id: String(item.id),
      name,
      price,
      originalPrice: original,
      shopId,
      shopName,
      shopLocation: sanitizeChatString(item.shops?.location, 80),
      score,
      discountPct: discountPercent(price, original),
      productPath: getProductSeoPath(name, item.short_code, String(item.id)),
      shopPath: `/shop/${shopId}`,
      imageUrl,
      distanceKm,
      avgRating: Number(item.avg_rating) || 0,
      reviewCount: Number(item.review_count) || 0,
    };
    hit.score += rankBoost(query, hit, sortMode);
    if (distanceKm != null && distanceKm < 5) hit.score += 6;
    else if (distanceKm != null && distanceKm < 10) hit.score += 3;
    return hit;
  });

  hits.sort((a, b) => {
    if (sortMode === "cheapest") return a.price - b.price || b.score - a.score;
    if (sortMode === "best_deal") return b.discountPct - a.discountPct || b.score - a.score;
    if (sortMode === "best_pick") {
      const scoreA = a.score + a.discountPct * 1.5;
      const scoreB = b.score + b.discountPct * 1.5;
      return scoreB - scoreA || a.price - b.price;
    }
    // Prefer nearer shops when location known
    if (a.distanceKm != null && b.distanceKm != null) {
      const distDelta = a.distanceKm - b.distanceKm;
      if (Math.abs(distDelta) > 2 && Math.abs(a.score - b.score) < 12) return distDelta;
    }
    return b.score - a.score;
  });
  return hits.slice(0, limit);
}

/** Token-by-token fallback when full-phrase search returns nothing. */
export async function searchProductsLoose(
  supabase: SupabaseClient,
  options: {
    message: string;
    shopId?: string;
    limit?: number;
    userLat?: number;
    userLng?: number;
  },
): Promise<ProductSearchHit[]> {
  const stop = new Set([
    "the", "and", "for", "you", "kya", "hai", "ka", "ki", "ke", "ko", "se", "par",
    "mein", "main", "mujhe", "bhai", "yar", "please", "batao", "dikhao", "dedo",
    "chahiye", "link", "url", "best", "sasta", "top", "find", "search", "shop",
  ]);
  const tokens = options.message
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stop.has(w))
    .slice(0, 5);

  if (!tokens.length) return [];

  const merged = new Map<string, ProductSearchHit>();
  for (const token of tokens) {
    const hits = await searchProductsForAssistant(supabase, {
      query: token,
      shopId: options.shopId,
      limit: 4,
      sortMode: "best_pick",
      userLat: options.userLat,
      userLng: options.userLng,
    });
    for (const h of hits) {
      const prev = merged.get(h.id);
      if (!prev || h.score > prev.score) merged.set(h.id, h);
    }
    if (merged.size >= (options.limit ?? 5) * 2) break;
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 5);
}

/** Live popular / discounted products in a category (API-free discovery). */
export async function searchProductsByCategory(
  supabase: SupabaseClient,
  options: {
    category: string;
    limit?: number;
    shopId?: string;
    userLat?: number;
    userLng?: number;
  },
): Promise<ProductSearchHit[]> {
  const category = sanitizeChatString(options.category, 80);
  if (!category) return [];
  const limit = options.limit ?? 5;

  let dbQuery = supabase
    .from("products")
    .select(
      "id, name, price, original_price, short_code, description, image_url, images, shop_id, is_available, shops!inner(id, name, location, is_live, latitude, longitude, category)",
    )
    .eq("is_available", true)
    .eq("shops.is_live", true)
    .eq("shops.category", category)
    .order("created_at", { ascending: false })
    .limit(40);

  if (options.shopId) {
    dbQuery = dbQuery.eq("shop_id", sanitizeChatString(options.shopId, 100));
  }

  const { data, error } = await dbQuery;
  if (error || !data?.length) return [];

  const rows = data as unknown as ProductRow[];
  const hits: ProductSearchHit[] = rows.map((item) => {
    const price = sanitizeChatNumber(item.price, 0);
    const original = item.original_price != null ? sanitizeChatNumber(item.original_price, 0) : null;
    const name = sanitizeChatString(item.name, 100);
    const shopName = sanitizeChatString(item.shops?.name, 80) || "Shop";
    const shopId = sanitizeChatString(item.shop_id, 100);
    const imageFromArr = Array.isArray(item.images)
      ? item.images.find((u) => typeof u === "string" && u.length > 0)
      : null;
    const imageUrl = (item.image_url && String(item.image_url)) || imageFromArr || null;
    let distanceKm: number | null = null;
    if (
      options.userLat != null &&
      options.userLng != null &&
      item.shops?.latitude != null &&
      item.shops?.longitude != null
    ) {
      distanceKm = haversineDistance(
        options.userLat,
        options.userLng,
        Number(item.shops.latitude),
        Number(item.shops.longitude),
      );
    }
    const discountPct = discountPercent(price, original);
    return {
      id: String(item.id),
      name,
      price,
      originalPrice: original,
      shopId,
      shopName,
      shopLocation: sanitizeChatString(item.shops?.location, 80),
      score: 40 + discountPct + (distanceKm != null && distanceKm < 5 ? 8 : 0),
      discountPct,
      productPath: getProductSeoPath(name, item.short_code, String(item.id)),
      shopPath: `/shop/${shopId}`,
      imageUrl,
      distanceKm,
    };
  });

  hits.sort((a, b) => b.discountPct - a.discountPct || b.score - a.score || a.price - b.price);
  return hits.slice(0, limit);
}

function rs(n: number): string {
  return `Rs. ${n.toLocaleString("en-PK")}`;
}

export function formatProductSearchReply(
  hits: ProductSearchHit[],
  query: string,
  role: "customer" | "merchant" | "shop",
  sortMode: SearchSortMode = "relevance",
  shopCategory?: string,
  shopName?: string,
): {
  reply: string;
  intent: string;
  confidence: number;
  suggestions: string[];
  products: ProductSearchHit[];
} {
  const uniqueShops = new Set(hits.map((h) => h.shopId)).size;
  const sortLabel =
    sortMode === "cheapest"
      ? " (sorted by lowest price)"
      : sortMode === "best_deal"
        ? " (best discounts first)"
        : sortMode === "best_pick"
          ? " (top picks for you)"
          : "";

  const title =
    role === "shop"
      ? `Found at *${hits[0]?.shopName ?? "this shop"}* for "${query}"${sortLabel}`
      : role === "merchant"
        ? `Your catalog — "${query}"${sortLabel}`
        : `"${query}" — ${hits.length} product(s) across ${uniqueShops} shop(s)${sortLabel}`;

  const top = hits[0];
  const topSection = top
    ? `🔎 *Closest match:* *${top.name}* — ${rs(top.price)}${
        top.discountPct > 0 ? ` (*${top.discountPct}% OFF*)` : ""
      }\n` +
      `📍 *${top.shopName}*${top.shopLocation ? ` · ${top.shopLocation}` : ""}${
        top.distanceKm != null ? ` · ~${top.distanceKm < 1 ? `${Math.round(top.distanceKm * 1000)}m` : `${top.distanceKm.toFixed(1)}km`}` : ""
      }\n` +
      `👉 [Open product](${top.productPath}) · [Visit shop](${top.shopPath})\n`
    : "";

  const rest = hits.slice(1).map((h, i) => {
    const discount =
      h.discountPct > 0
        ? ` · *${h.discountPct}% OFF* (${rs(h.originalPrice!)} → ${rs(h.price)})`
        : ` · ${rs(h.price)}`;
    return (
      `${i + 2}. *${h.name}*${discount}\n` +
      `   🏪 *${h.shopName}*${h.shopLocation ? ` · ${h.shopLocation}` : ""}\n` +
      `   🔗 [Product link](${h.productPath}) · [Shop](${h.shopPath})`
    );
  });

  const browseLink =
    role === "customer"
      ? `\n\n🔎 [See all on marketplace](/products?q=${encodeURIComponent(query)})`
      : role === "merchant"
        ? `\n\n📦 [Edit products](/dashboard/products)`
        : "";

  const body = rest.length ? `\n*More options:*\n\n${rest.join("\n\n")}` : "";

  return {
    intent: "product_search",
    confidence: Math.min(0.94, 0.55 + (hits[0]?.score ?? 0) / 200),
    suggestions:
      role === "customer"
        ? ["Sasta mobile dhundo", "Electronics shop dhundo", "Best deals?", "Order kaise karun?"]
        : role === "merchant"
          ? ["Meri shop ki live summary", "Best selling product?", "Growth strategy"]
          : getShopCategoryPrompts(shopCategory, shopName),
    reply: `✨ *${title}*\n\n${topSection}${body}${browseLink}\n\n_Neeche cards tap karke product/shop kholen._`,
    products: hits,
  };
}

export function formatNoProductResults(
  query: string,
  role: "customer" | "merchant" | "shop",
  shopId?: string,
): { reply: string; intent: string; confidence: number; suggestions: string[] } {
  const searchLink =
    role === "customer"
      ? `[Browse marketplace](/products?q=${encodeURIComponent(query)})`
      : role === "merchant"
        ? `[Add product](/dashboard/products/new)`
        : shopId
          ? `[View shop](/shop/${shopId})`
          : `[Browse products](/products)`;

  return {
    intent: "product_search_empty",
    confidence: 0.8,
    suggestions:
      role === "customer"
        ? ["Best deals kahan hain?", "Achhi shops recommend karo", "Order kaise karun?"]
        : ["Meri shop ki summary", "Business grow strategy"],
    reply:
      `😕 *"${query}"* ke liye abhi koi product nahi mila.\n\n` +
      `*Kya hua:* TrendsMart catalog mein is naam se available product match nahi hua.\n\n` +
      (role === "merchant"
        ? `✅ *Try karein:*\n• Catalog mein product add karein\n• Naam/spelling check karein\n\n➕ ${searchLink}`
        : `✅ *Try karein:*\n• Spelling change karein (jaise "mobile", "samsung")\n• ${searchLink}\n• [All shops browse karein](/products)\n\n_TrendBot live data use karta hai — jab product add hoga, main link de dunga._`),
  };
}
