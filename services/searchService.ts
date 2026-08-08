/* -------------------------------------------------------------------------- */
/*  TrendMart — Global Smart Search & Fuzzy Matching Engine                     */
/*                                                                             */
/*  Searches across both shops and products using Supabase ILIKE with          */
/*  trigram-based fuzzy matching to handle spelling mistakes, partial words,   */
/*  and return ranked best matches across multiple vendors.                    */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import type { Shop, Product } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchResultItem {
  type: "shop" | "product";
  id: string;
  name: string;
  /** For products: the shop name this product belongs to */
  shopName?: string;
  shopId: string;
  /** For shops: the category */
  category?: string;
  /** For products: the price */
  price?: number;
  currency?: string;
  /** For shops: location */
  location?: string;
  /** Image URL (logo_url for shops, image_url for products) */
  imageUrl?: string | null;
  /** For products: availability */
  isAvailable?: boolean;
  /** Relevance score from 0-100 (higher = better match) */
  relevanceScore: number;
  /** The match highlight — which field matched */
  matchedField: string;
  /** A snippet of the matching text (truncated) */
  snippet?: string;
}

export interface SearchResults {
  results: SearchResultItem[];
  totalShops: number;
  totalProducts: number;
  query: string;
  /** Did we use fuzzy matching? */
  fuzzyExpanded: boolean;
  /** Alternative spelling suggestions if no results */
  suggestions?: string[];
}

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/** Calculate a simple relevance score based on match type. */
function calculateRelevanceScore(
  query: string,
  fieldText: string,
  matchType: "exact" | "startsWith" | "contains" | "fuzzy",
): number {
  const q = query.toLowerCase().trim();
  const text = fieldText.toLowerCase().trim();
  let score = 0;

  if (matchType === "exact") {
    score = 100;
  } else if (matchType === "startsWith") {
    score = 85;
  } else if (matchType === "contains") {
    score = 70;
  } else {
    score = 50;
  }

  // Boost shorter names (closer match)
  if (text.length > 0 && q.length > 0) {
    const ratio = q.length / text.length;
    if (ratio > 0.8) score += 10; // Query covers most of the text
    else if (ratio > 0.5) score += 5;
  }

  return Math.min(score, 100);
}

/** Generate spelling suggestions by varying common letters. */
function generateSuggestions(query: string): string[] {
  const suggestions: string[] = [];
  const q = query.toLowerCase().trim();
  if (q.length < 3) return suggestions;

  // Common Pakistani spelling variations
  const variations: Record<string, string[]> = {
    "zinger": ["zinger", "zinger burger", "chicken burger"],
    "burger": ["burger", "zinger burger", "chicken burger", "beef burger"],
    "aata": ["aata", "atta", "flour", "wheat flour"],
    "chawal": ["chawal", "rice", "biryani rice", "basmati"],
    "chicken": ["chicken", "murgh", "poultry"],
    "gosht": ["gosht", "meat", "beef", "mutton"],
    "doodh": ["doodh", "milk", "fresh milk"],
    "anda": ["anda", "eggs", "fresh eggs"],
    "roti": ["roti", "bread", "chapati", "naan"],
    "pizza": ["pizza", "fast food", "italian"],
    "shalwar": ["shalwar", "shalwar kameez", "suit", "lawn suit"],
    "kameez": ["kameez", "shalwar kameez", "suit"],
    "kurti": ["kurti", "kurti design", "ladies kurti"],
    "mobile": ["mobile", "phone", "smartphone", "iphone", "samsung"],
    "laptop": ["laptop", "notebook", "computer", "dell", "hp"],
    "earphone": ["earphone", "earbuds", "headphone", "airpods"],
    "charger": ["charger", "cable", "adapter", "power bank"],
    "makeup": ["makeup", "cosmetics", "lipstick", "foundation"],
    "cream": ["cream", "lotion", "moisturizer", "serum"],
    "perfume": ["perfume", "fragrance", "ittar", "deodorant"],
  };

  // Check for known variations
  for (const [key, variants] of Object.entries(variations)) {
    if (q.includes(key) || key.includes(q)) {
      suggestions.push(...variants.filter((v) => v !== q));
    }
  }

  // Simple character swap suggestions
  if (suggestions.length === 0 && q.length >= 4) {
    // Swap adjacent characters (common typing error)
    for (let i = 0; i < q.length - 1; i++) {
      const swapped = q.slice(0, i) + q[i + 1] + q[i] + q.slice(i + 2);
      if (swapped !== q) suggestions.push(swapped);
    }
  }

  return [...new Set(suggestions)].slice(0, 5);
}

/** Build a LIKE pattern that matches partial words and common misspellings. */
function buildFuzzyPatterns(query: string): string[] {
  const q = query.toLowerCase().trim();
  const patterns: string[] = [q]; // Original

  // Remove duplicate consecutive letters (common misspelling: "zinger" → "zingger")
  const deduped = q.replace(/(.)\1+/g, "$1");
  if (deduped !== q) patterns.push(deduped);

  // Handle common Pakistani phonetic variations
  const phoneticMap: Record<string, string[]> = {
    "s": ["s", "c"], // "s" and soft "c" (rice/rise)
    "c": ["c", "k", "s"], // "c" can be "k" or "s"
    "ph": ["ph", "f"], // "phone" vs "fone"
    "gh": ["gh", "g"], // "ghost" vs "gost"
    "kh": ["kh", "k"], // Urdu خ
    "sh": ["sh", "s"], // Urdu ش
    "aa": ["aa", "a"], // Long vowel
    "ee": ["ee", "i", "e"], // Long "e"
    "oo": ["oo", "u", "o"], // Long "u"
  };

  // Generate common phonetic alternatives
  let alt1 = q;
  for (const [pattern, replacements] of Object.entries(phoneticMap)) {
    if (alt1.includes(pattern)) {
      alt1 = alt1.replace(new RegExp(pattern, "g"), replacements[1] || replacements[0]);
    }
  }
  if (alt1 !== q) patterns.push(alt1);

  // Words that are commonly misspelled together
  if (q.includes("ie")) patterns.push(q.replace("ie", "ei"));
  if (q.includes("ei")) patterns.push(q.replace("ei", "ie"));

  // Handle dropped 'h' (common in Pakistani English: "school" → "scool")
  if (q.includes("ch")) patterns.push(q.replace("ch", "c"));
  if (q.includes("sh")) patterns.push(q.replace("sh", "s"));
  if (q.includes("th")) patterns.push(q.replace("th", "t"));

  return [...new Set(patterns)];
}

// ─── Core Search Function ─────────────────────────────────────────────────────

/**
 * Perform a global smart search across shops and products.
 *
 * - Searches shop names, categories, locations, store bios
 * - Searches product names and descriptions
 * - Uses ILIKE with fuzzy patterns for typo tolerance
 * - Returns ranked results with relevance scores
 */
export async function globalSearch(
  query: string,
  options?: {
    /** Limit results per category (shops/products). Default: 10 each. */
    limit?: number;
    /** Only search within a specific shop. */
    shopId?: string;
    /** Only search shops (skip products). */
    shopsOnly?: boolean;
    /** Only search products (skip shops). */
    productsOnly?: boolean;
  },
): Promise<ServiceResult<SearchResults>> {
  const supabase = createClient();
  const q = query.trim();
  const limit = options?.limit ?? 10;

  if (!q) {
    return {
      success: true,
      data: {
        results: [],
        totalShops: 0,
        totalProducts: 0,
        query: q,
        fuzzyExpanded: false,
      },
    };
  }

  try {
    const patterns = buildFuzzyPatterns(q);
    const allResults: SearchResultItem[] = [];
    const usedFuzzy = patterns.length > 1;

    // ── Search Shops ──────────────────────────────────────────────────────
    if (!options?.productsOnly) {
      // Build OR conditions for each fuzzy pattern
      const shopConditions = patterns.flatMap((pattern) => [
        `name.ilike.%${pattern}%`,
        `category.ilike.%${pattern}%`,
        `location.ilike.%${pattern}%`,
        `store_bio.ilike.%${pattern}%`,
      ]);

      // Primary search: ILIKE on name, category, location, store_bio
      // We need to use multiple queries since Supabase JS client doesn't support complex OR across columns easily
      const shopQueries = patterns.map(async (pattern) => {
        const { data } = await supabase
          .from("shops")
          .select("id, name, category, location, logo_url, is_live, store_bio, whatsapp_number")
          .eq("is_live", true)
          .eq("verification_status", "approved")
          .or(
            `name.ilike.%${pattern}%,category.ilike.%${pattern}%,location.ilike.%${pattern}%,store_bio.ilike.%${pattern}%`,
          )
          .limit(limit);

        return (data as Shop[]) ?? [];
      });

      const shopResultsArrays = await Promise.all(shopQueries);
      const seenShopIds = new Set<string>();

      for (let pi = 0; pi < patterns.length; pi++) {
        const shops = shopResultsArrays[pi];
        for (const shop of shops) {
          if (seenShopIds.has(shop.id)) continue;
          seenShopIds.add(shop.id);

          // Determine which field matched and calculate score
          let matchedField = "name";
          let maxScore = 0;
          const shopName = (shop.name || "").toLowerCase();
          const category = (shop.category || "").toLowerCase();
          const location = (shop.location || "").toLowerCase();
          const bio = (shop.store_bio || "").toLowerCase();
          const pattern = patterns[pi].toLowerCase();

          if (shopName === pattern) {
            matchedField = "name";
            maxScore = calculateRelevanceScore(q, shop.name, "exact");
          } else if (shopName.startsWith(pattern)) {
            matchedField = "name";
            maxScore = calculateRelevanceScore(q, shop.name, "startsWith");
          } else if (shopName.includes(pattern)) {
            matchedField = "name";
            maxScore = calculateRelevanceScore(q, shop.name, "contains");
          } else if (category.includes(pattern)) {
            matchedField = "category";
            maxScore = calculateRelevanceScore(q, shop.category, pi > 0 ? "fuzzy" : "contains");
          } else if (location.includes(pattern)) {
            matchedField = "location";
            maxScore = calculateRelevanceScore(q, shop.location, pi > 0 ? "fuzzy" : "contains");
          } else if (bio.includes(pattern)) {
            matchedField = "store_bio";
            maxScore = calculateRelevanceScore(q, shop.store_bio || "", pi > 0 ? "fuzzy" : "contains");
          }

          allResults.push({
            type: "shop",
            id: shop.id,
            name: shop.name,
            shopId: shop.id,
            category: shop.category,
            location: shop.location,
            imageUrl: shop.logo_url,
            relevanceScore: maxScore,
            matchedField,
            snippet: shop.store_bio?.slice(0, 80) || shop.location,
          });
        }
      }
    }

    // ── Search Products ───────────────────────────────────────────────────
    if (!options?.shopsOnly) {
      const productQueries = patterns.map(async (pattern) => {
        let queryBuilder = supabase
          .from("products")
          .select(
            "id, shop_id, name, description, price, currency, image_url, is_available, shops(name)",
          )
          .eq("is_available", true)
          .or(`name.ilike.%${pattern}%,description.ilike.%${pattern}%`)
          .limit(limit);

        if (options?.shopId) {
          queryBuilder = queryBuilder.eq("shop_id", options.shopId);
        }

        const { data } = await queryBuilder;
        // Supabase returns shops as an array from joins; extract the first element
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawData = data as any[];
        return rawData?.map((row) => ({
          ...row,
          shops: Array.isArray(row.shops) ? row.shops[0] : row.shops,
        })) as unknown as (Product & { shops?: { name: string } | null })[];
      });

      const productResultsArrays = await Promise.all(productQueries);
      const seenProductIds = new Set<string>();

      for (let pi = 0; pi < patterns.length; pi++) {
        const products = productResultsArrays[pi];
        for (const product of products) {
          if (seenProductIds.has(product.id)) continue;
          seenProductIds.add(product.id);

          const shopName = product.shops?.name || "Unknown Shop";
          let matchedField = "name";
          let maxScore = 0;
          const productName = (product.name || "").toLowerCase();
          const description = (product.description || "").toLowerCase();
          const pattern = patterns[pi].toLowerCase();

          if (productName === pattern) {
            matchedField = "name";
            maxScore = calculateRelevanceScore(q, product.name, "exact");
          } else if (productName.startsWith(pattern)) {
            matchedField = "name";
            maxScore = calculateRelevanceScore(q, product.name, "startsWith");
          } else if (productName.includes(pattern)) {
            matchedField = "name";
            maxScore = calculateRelevanceScore(q, product.name, "contains");
          } else if (description.includes(pattern)) {
            matchedField = "description";
            maxScore = calculateRelevanceScore(q, product.description, pi > 0 ? "fuzzy" : "contains");
          }

          allResults.push({
            type: "product",
            id: product.id,
            name: product.name,
            shopName,
            shopId: product.shop_id,
            price: product.price,
            currency: product.currency,
            imageUrl: product.image_url,
            isAvailable: product.is_available,
            relevanceScore: maxScore,
            matchedField,
            snippet: product.description?.slice(0, 80) || product.name,
          });
        }
      }
    }

    // ── Rank & Sort Results ──────────────────────────────────────────────
    allResults.sort((a, b) => {
      // Exact name matches first
      if (a.relevanceScore !== b.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      // Then by name length (shorter = more precise match)
      return a.name.length - b.name.length;
    });

    // ── Deduplicate (same name from different shops is OK for products) ──
    const uniqueResults = allResults.filter(
      (item, index, self) =>
        index ===
        self.findIndex(
          (t) => t.type === item.type && t.id === item.id,
        ),
    );

    const totalShops = uniqueResults.filter((r) => r.type === "shop").length;
    const totalProducts = uniqueResults.filter((r) => r.type === "product").length;

    // Generate suggestions if no results
    let suggestions: string[] | undefined;
    if (uniqueResults.length === 0 && q.length >= 2) {
      suggestions = generateSuggestions(q);
    }

    return {
      success: true,
      data: {
        results: uniqueResults.slice(0, limit * 2),
        totalShops,
        totalProducts,
        query: q,
        fuzzyExpanded: usedFuzzy,
        suggestions,
      },
    };
  } catch (err) {
    logError(err, { module: "searchService.globalSearch", meta: { query } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Quick search for autocomplete suggestions (returns top 5 matches).
 * Lightweight version of globalSearch for real-time typeahead.
 */
export async function quickSearch(
  query: string,
): Promise<ServiceResult<SearchResultItem[]>> {
  if (!query || query.trim().length < 2) {
    return { success: true, data: [] };
  }

  const result = await globalSearch(query, { limit: 5 });
  if (result.success) {
    return { success: true, data: result.data.results.slice(0, 5) };
  }
  return result;
}

/**
 * Search only within a specific shop's products.
 * Useful for the storefront product search bar.
 */
export async function searchShopProducts(
  shopId: string,
  query: string,
): Promise<ServiceResult<SearchResultItem[]>> {
  if (!query || !query.trim()) {
    const supabase = createClient();
    try {
      const { data } = await supabase
        .from("products")
        .select(
          "id, shop_id, name, description, price, currency, image_url, is_available",
        )
        .eq("shop_id", shopId)
        .eq("is_available", true)
        .order("created_at", { ascending: false })
        .limit(50);

      const products = (data as Product[]) ?? [];
      return {
        success: true,
        data: products.map((p) => ({
          type: "product" as const,
          id: p.id,
          name: p.name,
          shopId: p.shop_id,
          price: p.price,
          currency: p.currency,
          imageUrl: p.image_url,
          isAvailable: p.is_available,
          relevanceScore: 100,
          matchedField: "name",
          snippet: p.description?.slice(0, 80) || p.name,
        })),
      };
    } catch (err) {
      return { success: false, error: toError(err) };
    }
  }

  const result = await globalSearch(query, { shopId, productsOnly: true, limit: 30 });
  if (result.success) {
    return { success: true, data: result.data.results };
  }
  return result;
}