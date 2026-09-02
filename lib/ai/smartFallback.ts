/* Strong API-free fallback — catalog → category picks → FAQ → helpful guide */

import type { SupabaseClient } from "@supabase/supabase-js";
import { matchAppKnowledgeSoft } from "@/lib/ai/appKnowledge";
import {
  buildCategoryBrowseReply,
  matchCategoryFromMessage,
} from "@/lib/ai/categoryIntel";
import {
  buildHelpfulGuideReply,
  isOutOfScope,
  MIN_ANSWER_CONFIDENCE,
  MIN_KNOWLEDGE_CONFIDENCE,
  MIN_PRODUCT_SCORE,
  MIN_SHOP_SCORE,
} from "@/lib/ai/honestReply";
import { fetchPlatformSnapshot } from "@/lib/ai/platformIntel";
import { matchBrandKnowledge } from "@/lib/ai/brandKnowledge";
import { normalizeUserLanguage } from "@/lib/ai/languageNormalize";
import { extractProductQuery } from "@/lib/ai/queryExtract";
import {
  formatProductSearchReply,
  searchProductsByCategory,
  searchProductsForAssistant,
  searchProductsLoose,
  type ProductSearchHit,
} from "@/lib/ai/productSearch";
import { applySpellFixes, detectSortMode } from "@/lib/ai/queryExpand";
import { searchShopsForAssistant } from "@/lib/ai/universalSearch";

type AssistantRole = "customer" | "merchant" | "shop";

interface AssistantResponse {
  reply: string;
  intent: string;
  confidence: number;
  suggestions?: string[];
  products?: ProductSearchHit[];
  handoff?: { type: "shop" | "support" | "inquiries"; href: string; label: string };
}

function filterStrongProducts(hits: ProductSearchHit[]): ProductSearchHit[] {
  return hits.filter((h) => h.score >= MIN_PRODUCT_SCORE);
}

async function tryStrongCatalog(
  supabase: SupabaseClient,
  message: string,
  role: AssistantRole,
  shopId?: string,
  shopCategory?: string,
  shopName?: string,
  location?: { lat: number; lng: number },
  preferredQuery?: string,
): Promise<AssistantResponse | null> {
  const norm = normalizeUserLanguage(message);
  const rawQ =
    preferredQuery?.trim() ||
    extractProductQuery(norm.normalized) ||
    extractProductQuery(message) ||
    norm.normalized.slice(0, 60);
  const query = applySpellFixes(rawQ);
  if (!query || query.length < 2) return null;

  const sortMode = detectSortMode(message);
  let hits = filterStrongProducts(
    await searchProductsForAssistant(supabase, {
      query,
      shopId: role === "customer" ? undefined : shopId,
      limit: 5,
      sortMode,
      originalMessage: message,
      userLat: location?.lat,
      userLng: location?.lng,
    }),
  );

  if (!hits.length) {
    hits = filterStrongProducts(
      await searchProductsLoose(supabase, {
        message: applySpellFixes(norm.normalized || message),
        shopId: role === "customer" ? undefined : shopId,
        limit: 5,
        userLat: location?.lat,
        userLng: location?.lng,
      }),
    );
  }

  // Category browse products when category known and keyword search weak
  if (!hits.length && shopCategory) {
    hits = await searchProductsByCategory(supabase, {
      category: shopCategory,
      shopId: role === "customer" ? undefined : shopId,
      limit: 5,
      userLat: location?.lat,
      userLng: location?.lng,
    });
  }

  if (hits.length > 0 && hits[0].score >= MIN_PRODUCT_SCORE) {
    const formatted = formatProductSearchReply(
      hits,
      query,
      role,
      sortMode,
      shopCategory,
      shopName,
    );
    return { ...formatted, products: hits, confidence: Math.min(0.97, 0.7 + hits[0].score / 200) };
  }

  if (role !== "merchant") {
    const shops = (await searchShopsForAssistant(supabase, query, 4)).filter(
      (s) => s.score >= MIN_SHOP_SCORE,
    );
    if (shops.length > 0) {
      const list = shops
        .map(
          (s, i) =>
            `${i + 1}. *${s.name}* — ${s.category} · ${s.location}\n   🔗 [Visit shop](${s.shopPath})`,
        )
        .join("\n");
      return {
        intent: "shop_search",
        confidence: Math.min(0.92, 0.65 + shops[0].score / 200),
        suggestions: ["Best mobile ka link do", "Best deals?", "Order kaise karun?"],
        reply: `🏪 *Shops for "${query}":*\n\n${list}\n\n🔎 [Browse products](/products?q=${encodeURIComponent(query)})`,
      };
    }
  }

  return null;
}

/**
 * Safe + strong fallback without any external API.
 */
export async function buildHonestFallbackReply(
  supabase: SupabaseClient,
  options: {
    message: string;
    role: AssistantRole;
    shopId?: string;
    shopCategory?: string;
    shopName?: string;
    location?: { lat: number; lng: number };
    preferredQuery?: string;
    llmConfidence?: number;
  },
): Promise<AssistantResponse> {
  const { message, role, shopId, shopCategory, shopName, location, preferredQuery } = options;

  if (isOutOfScope(message)) {
    return buildHelpfulGuideReply({ reason: "out_of_scope", query: message.slice(0, 40), role });
  }

  const brand = matchBrandKnowledge(message, role);
  if (brand && brand.confidence >= 0.65) return brand;

  const catalog = await tryStrongCatalog(
    supabase,
    message,
    role,
    shopId,
    shopCategory,
    shopName,
    location,
    preferredQuery,
  );
  if (catalog && (catalog.confidence ?? 0) >= MIN_ANSWER_CONFIDENCE) {
    return catalog;
  }

  const catMatch = await matchCategoryFromMessage(supabase, message);
  if (catMatch && catMatch.score >= 35) {
    // Prefer showing real products in that category
    const catProducts = await searchProductsByCategory(supabase, {
      category: catMatch.category,
      shopId: role === "shop" ? shopId : undefined,
      limit: 5,
      userLat: location?.lat,
      userLng: location?.lng,
    });
    if (catProducts.length) {
      return {
        ...formatProductSearchReply(
          catProducts,
          catMatch.subCategory || catMatch.category,
          role,
          "best_pick",
          catMatch.category,
          shopName,
        ),
        products: catProducts,
        confidence: 0.88,
      };
    }
    const catReply = await buildCategoryBrowseReply(supabase, catMatch);
    if (catReply) return catReply;
  }

  const soft = matchAppKnowledgeSoft(message, role);
  if (soft && soft.confidence >= MIN_KNOWLEDGE_CONFIDENCE) {
    return soft;
  }

  let topCategories: string[] | undefined;
  try {
    const snap = await fetchPlatformSnapshot(supabase);
    topCategories = snap.topCategories;
    // Last useful try: top trending category products
    if (topCategories?.[0] && role !== "merchant") {
      const trendHits = await searchProductsByCategory(supabase, {
        category: topCategories[0],
        limit: 4,
        userLat: location?.lat,
        userLng: location?.lng,
      });
      if (trendHits.length) {
        return {
          ...formatProductSearchReply(
            trendHits,
            topCategories[0],
            role,
            "best_pick",
            topCategories[0],
            shopName,
          ),
          products: trendHits,
          confidence: 0.78,
          reply:
            `🔥 *Abhi TrendsMart par chal raha (live):*\n\n` +
            formatProductSearchReply(trendHits, topCategories[0], role, "best_pick", topCategories[0], shopName)
              .reply.replace(/^✨[^\n]*\n\n/, "") +
            `\n\n_Specific item chahiye? Naam likhein — main exact link dunga._`,
        };
      }
    }
  } catch {
    topCategories = undefined;
  }

  return buildHelpfulGuideReply({
    reason: preferredQuery || !catalog ? "no_match" : "unclear",
    query: (preferredQuery || message).slice(0, 40),
    role,
    topCategories,
  });
}

/** @deprecated alias */
export async function buildNeverEmptyReply(
  supabase: SupabaseClient,
  options: {
    message: string;
    role: AssistantRole;
    shopId?: string;
    shopCategory?: string;
    shopName?: string;
    location?: { lat: number; lng: number };
  },
): Promise<AssistantResponse> {
  return buildHonestFallbackReply(supabase, options);
}
