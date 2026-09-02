/* Universal search — shops, deals + products in one response */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fuzzyFilterAndRank, FUZZY_MIN_SCORE } from "@/lib/fuzzySearch";
import { sanitizeChatString } from "@/lib/ai/sanitize";
import { searchProductsForAssistant } from "@/lib/ai/productSearch";

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
