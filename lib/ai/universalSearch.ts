/* Universal search — shops, deals + products in one response */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fuzzyFilterAndRank, FUZZY_MIN_SCORE } from "@/lib/fuzzySearch";
import { sanitizeChatString } from "@/lib/ai/sanitize";
import { formatProductSearchReply, searchProductsForAssistant } from "@/lib/ai/productSearch";
import { MIN_PRODUCT_SCORE } from "@/lib/ai/honestReply";

export interface ShopSearchHit {
  id: string;
  name: string;
  category: string;
  location: string;
  shopPath: string;
  score: number;
}

const SHOP_SEARCH =
  /(shop|dukan|dukaan|store|market|vendor|seller|kahan milega|kahan hai|dhundho|find shop|near me|qareeb|nearby)/i;

export function looksLikeUniversalSearch(message: string): boolean {
  const trimmed = message.trim();
  if (/^(hi|hello|salam|aoa|assalam|hey|ok|thanks|shukriya)[!.?\s]*$/i.test(trimmed)) {
    return false;
  }
  if (SHOP_SEARCH.test(message)) return true;
  const words = trimmed.split(/\s+/).length;
  if (words >= 2 && /(dhund|search|find|chahiye|milega|dikhao|recommend|suggest|batao|available)/i.test(message)) {
    return true;
  }
  // Multi-word marketplace queries (not pure greetings)
  return words >= 2 && words <= 10;
}

export async function searchShopsForAssistant(
  supabase: SupabaseClient,
  query: string,
  limit = 5,
): Promise<ShopSearchHit[]> {
  const safe = sanitizeChatString(query, 60).replace(/[%_\\]/g, "");
  if (!safe) return [];

  const { data } = await supabase
    .from("shops")
    .select("id, name, category, location")
    .eq("is_live", true)
    .or(`name.ilike.%${safe}%,category.ilike.%${safe}%,location.ilike.%${safe}%`)
    .limit(60);

  const rows = (data ?? []) as { id: string; name: string; category: string; location: string }[];
  const ranked = fuzzyFilterAndRank(
    rows,
    query,
    (r) => [r.name, r.category, r.location],
    { minScore: FUZZY_MIN_SCORE - 10, limit: 10 },
  );

  return ranked.map(({ item, score }) => ({
    id: item.id,
    name: sanitizeChatString(item.name, 80),
    category: sanitizeChatString(item.category, 50),
    location: sanitizeChatString(item.location, 80),
    shopPath: `/shop/${item.id}`,
    score,
  })).slice(0, limit);
}

// ── Shop-name + product: "Ahmed Store mein laptop dhundo" ───────────────────

/**
 * Detect if the message is asking for products from a specific named shop.
 * Returns { shopName, productQuery } or null.
 *
 * Patterns handled:
 *   "XYZ store mein laptop dikhao"
 *   "ABC ki dukan mein samsung milega"
 *   "from XYZ shop show me phones"
 *   "XYZ shop ka product?"
 *   "XYZ wale ke products"
 */
export function detectShopSpecificProductQuery(message: string): {
  shopName: string;
  productQuery: string;
} | null {
  const t = message.trim();

  // Pattern 1 (Roman Urdu): "{shopName} (ki dukan|store|shop|waly|wale) mein|me|ka|ke {product}"
  const m1 = t.match(
    /^(.{3,40}?)\s*(?:ki\s+dukan|ki\s+dukaaan|store|shop|waly|wale|wali)\s+(?:mein|me|ka|ke|par|se|main)\s+(.{2,40})$/i,
  );
  if (m1) {
    const shopName = m1[1].trim();
    const productQuery = m1[2].replace(/(dikhao|dhundo|dhund|batao|milega|milta|hai kya|chahiye|link do|available|stock)/gi, "").trim();
    if (shopName.length >= 2 && productQuery.length >= 2) return { shopName, productQuery };
  }

  // Pattern 2: "{shopName} mein {product} (dikhao|dhundo|milega|hai)"
  const m2 = t.match(
    /^(.{3,40}?)\s+(?:mein|me|main)\s+(.{2,40?})\s+(?:dikhao|dhundo|dhund|milega|milta|chahiye|hai\s*kya|available|link\s*do)[\s?!.]*$/i,
  );
  if (m2) {
    const shopName = m2[1].trim();
    const productQuery = m2[2].trim();
    // Reject if shopName looks like a product word
    if (
      shopName.length >= 2 &&
      productQuery.length >= 2 &&
      !/(mobile|phone|laptop|shoes|shirt|food|burger|pizza|samsung|iphone)/i.test(shopName)
    ) {
      return { shopName, productQuery };
    }
  }

  // Pattern 3 (English): "from {shopName} (show|find|search) {product}"
  const m3 = t.match(/^(?:from|at|in)\s+(.{3,40}?)\s+(?:show|find|search|get|give)\s+(.{2,40})$/i);
  if (m3) {
    return { shopName: m3[1].trim(), productQuery: m3[2].trim() };
  }

  return null;
}

/**
 * Find a shop by approximate name from the database.
 * Returns the best-matching shop or null.
 */
export async function resolveShopByName(
  supabase: SupabaseClient,
  shopName: string,
): Promise<{ id: string; name: string; category: string; location: string } | null> {
  const safe = sanitizeChatString(shopName, 60).replace(/[%_\\]/g, "");
  if (!safe || safe.length < 2) return null;

  const { data } = await supabase
    .from("shops")
    .select("id, name, category, location")
    .eq("is_live", true)
    .ilike("name", `%${safe}%`)
    .limit(20);

  const rows = (data ?? []) as { id: string; name: string; category: string; location: string }[];
  if (!rows.length) return null;

  const ranked = fuzzyFilterAndRank(rows, shopName, (r) => [r.name], {
    minScore: FUZZY_MIN_SCORE - 15,
    limit: 1,
  });

  return ranked[0]?.item ?? null;
}

/**
 * Full flow: find shop by name then search products within it.
 * Used when user says "Ahmed Store mein laptop dhundo".
 */
export async function searchByShopNameAndProduct(
  supabase: SupabaseClient,
  shopName: string,
  productQuery: string,
  role: "customer" | "merchant" | "shop" = "customer",
): Promise<{ reply: string; intent: string; confidence: number; suggestions: string[]; products?: unknown[] } | null> {
  const shop = await resolveShopByName(supabase, shopName);

  if (!shop) {
    return {
      intent: "shop_not_found",
      confidence: 0.88,
      suggestions: ["Products search", "Best deals?", "Qareeb ki shops batao"],
      reply:
        `🔍 *"${shopName.slice(0, 40)}"* naam ki koi live shop nahi mili.\n\n` +
        `Possible reasons:\n` +
        `• Naam thora alag ho sakta hai — exact spelling try karein\n` +
        `• Shop abhi live nahi hai\n\n` +
        `👉 [Browse all shops](/products) · [Search](/products?q=${encodeURIComponent(shopName)})`,
    };
  }

  const products = await searchProductsForAssistant(supabase, {
    query: productQuery,
    shopId: shop.id,
    limit: 5,
  });
  const strong = products.filter((p) => p.score >= MIN_PRODUCT_SCORE);

  if (!strong.length) {
    return {
      intent: "shop_product_not_found",
      confidence: 0.88,
      suggestions: ["Other products?", "Best deals?", "Order kaise karun?"],
      reply:
        `🏪 *${shop.name}* (${shop.category} · ${shop.location}) mila!\n\n` +
        `Lekin *"${productQuery.slice(0, 40)}"* abhi is shop mein list nahi hai.\n\n` +
        `👉 [Shop browse karein](/shop/${shop.id})\n` +
        `💬 Directly shop se poochein — WhatsApp available hai.`,
    };
  }

  const formatted = formatProductSearchReply(strong, productQuery, role, "relevance", shop.category, shop.name);
  return {
    ...formatted,
    products: strong,
    intent: "shop_specific_product",
    confidence: 0.95,
  };
}

export async function runUniversalSearch(
  supabase: SupabaseClient,
  query: string,
  shopId?: string,
): Promise<{ reply: string; intent: string; confidence: number; suggestions: string[] } | null> {
  const q = sanitizeChatString(query, 80);
  if (q.length < 2) return null;

  const [rawProducts, rawShops] = await Promise.all([
    searchProductsForAssistant(supabase, { query: q, shopId, limit: 4 }),
    shopId ? Promise.resolve([]) : searchShopsForAssistant(supabase, q, 3),
  ]);

  // Only keep strong matches — avoid wrong answers
  const products = rawProducts.filter((p) => p.score >= 36);
  const shops = rawShops.filter((s) => s.score >= 32);

  if (!products.length && !shops.length) return null;

  const parts: string[] = [`🔎 *Search results for "${q}"*\n`];

  if (products.length) {
    parts.push("*Products:*");
    products.forEach((p, i) => {
      parts.push(
        `${i + 1}. *${p.name}* — Rs. ${p.price.toLocaleString("en-PK")} @ ${p.shopName}\n   [Open](${p.productPath}) · [Shop](${p.shopPath})`,
      );
    });
  }

  if (shops.length) {
    parts.push("\n*Shops:*");
    shops.forEach((s, i) => {
      parts.push(
        `${i + 1}. *${s.name}* — ${s.category} · ${s.location}\n   [Visit shop](${s.shopPath})`,
      );
    });
  }

  parts.push(`\n[Browse all](/products?q=${encodeURIComponent(q)})`);

  return {
    intent: "universal_search",
    confidence: 0.91,
    suggestions: ["Best mobile ka link do", "Best deals?", "Order kaise karun?"],
    reply: parts.join("\n"),
  };
}
