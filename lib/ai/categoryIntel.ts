/* Live category / sub-category intelligence for TrendBot */

import type { SupabaseClient } from "@supabase/supabase-js";
import { SHOP_CATEGORIES } from "@/types";
import { detectLikelyCategory } from "@/lib/ai/languageNormalize";
import { sanitizeChatString } from "@/lib/ai/sanitize";
import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";

export interface CategoryMatch {
  category: string;
  subCategory?: string;
  score: number;
}

function scoreText(hay: string, needle: string): number {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  if (!n || n.length < 2) return 0;
  if (h === n) return 100;
  if (h.startsWith(n) || n.startsWith(h)) return 80;
  if (h.includes(n) || n.includes(h)) return 60;
  const ht = new Set(h.split(/\s+/));
  const nt = n.split(/\s+/).filter((t) => t.length > 2);
  const overlap = nt.filter((t) => ht.has(t) || [...ht].some((x) => x.includes(t) || t.includes(x)));
  return overlap.length ? 35 + overlap.length * 10 : 0;
}

export async function matchCategoryFromMessage(
  supabase: SupabaseClient,
  message: string,
): Promise<CategoryMatch | null> {
  const lower = message.toLowerCase();
  const aliasCat = detectLikelyCategory(message);

  let best: CategoryMatch | null = aliasCat
    ? { category: aliasCat, score: 75 }
    : null;

  for (const cat of SHOP_CATEGORIES) {
    if (cat === "All") continue;
    const s = scoreText(cat, lower) || scoreText(lower, cat);
    // also score individual words
    const wordScore = cat
      .toLowerCase()
      .split(/[\s&/]+/)
      .filter((w) => w.length > 3 && lower.includes(w))
      .length * 28;
    const score = Math.max(s, wordScore);
    if (score >= 40 && (!best || score > best.score)) {
      best = { category: cat, score };
    }
  }

  // Live sub-categories from DB
  try {
    const { data } = await supabase
      .from("sub_categories")
      .select("name, category")
      .eq("is_active", true)
      .limit(200);
    for (const row of (data ?? []) as { name: string; category: string }[]) {
      const name = sanitizeChatString(row.name, 60);
      const category = sanitizeChatString(row.category, 60);
      if (!name || !category) continue;
      const s = scoreText(name, lower) || (lower.includes(name.toLowerCase()) ? 70 : 0);
      if (s >= 50 && (!best || s > best.score)) {
        best = { category, subCategory: name, score: s };
      }
    }
  } catch {
    /* ignore */
  }

  return best && best.score >= 40 ? best : null;
}

export async function buildCategoryBrowseReply(
  supabase: SupabaseClient,
  match: CategoryMatch,
): Promise<{
  reply: string;
  intent: string;
  confidence: number;
  suggestions: string[];
} | null> {
  const cat = match.category;
  const [{ count: shopCount }, { count: productCount }] = await Promise.all([
    supabase
      .from("shops")
      .select("*", { count: "exact", head: true })
      .eq("is_live", true)
      .eq("category", cat),
    supabase
      .from("products")
      .select("*, shops!inner(category, is_live)", { count: "exact", head: true })
      .eq("is_available", true)
      .eq("shops.is_live", true)
      .eq("shops.category", cat),
  ]);

  const shops = shopCount ?? 0;
  const products = productCount ?? 0;

  if (shops === 0 && products === 0) {
    return {
      intent: "category_empty",
      confidence: 0.85,
      suggestions: ["Best deals?", "Achhi shops batao", "Best mobile ka link do"],
      reply:
        `📂 *${cat}*${match.subCategory ? ` → ${match.subCategory}` : ""}\n\n` +
        `Abhi is category mein live shop/product confirm nahi mila.\n` +
        `Main guess nahi karta — baad mein dubara try karein.\n\n` +
        `🔎 [Browse all](/products)\n\n_${TREND_BOT_NAME}_`,
    };
  }

  const q = encodeURIComponent(match.subCategory || cat);
  return {
    intent: "category_browse",
    confidence: Math.min(0.95, 0.7 + match.score / 200),
    suggestions: [
      `${cat} products dikhao`,
      "Best deals?",
      "Sasta option?",
      "Order kaise karun?",
    ],
    reply:
      `📂 *${cat}*${match.subCategory ? `\n🏷️ Sub: *${match.subCategory}*` : ""}\n\n` +
      `Live data: *${shops}* shops · *${products}* products\n\n` +
      `👉 [Open category products](/products?q=${q})\n` +
      `👉 [Browse marketplace](/products)\n\n` +
      `Specific item chahiye? Naam likhein — main link dunga.\n\n_${TREND_BOT_NAME}_`,
  };
}
