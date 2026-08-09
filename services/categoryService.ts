/* -------------------------------------------------------------------------- */
/*  TrendMart — Category Management Service                                    */
/*  Dynamic category metadata, icons, and item counts from Supabase.            */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import type { ShopCategory } from "@/types";
import {
  SHOP_CATEGORIES,
  CATEGORY_ICONS,
} from "@/types";
import { sanitizeLight, validateEnum } from "@/lib/sanitization";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategoryMeta {
  key: ShopCategory;
  label: string;
  icon: string;           // Emoji icon for UI display
  description: string;
}

export interface CategoryWithCount extends CategoryMeta {
  count: number;          // Number of live shops in this category
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Allowed category list (mirrors types/index.ts) ─────────────────────────

const ALL_CATEGORIES: readonly ShopCategory[] = SHOP_CATEGORIES;

// ─── Category Metadata ───────────────────────────────────────────────────────

/** Static metadata for each category — icons and descriptions. */
const CATEGORY_META: Record<Exclude<ShopCategory, "All">, CategoryMeta> = {
  "Grocery & Kiryana": {
    key: "Grocery & Kiryana",
    label: "Grocery & Kiryana",
    icon: CATEGORY_ICONS["Grocery & Kiryana"] ?? "🛒",
    description: "Daily essentials, dry goods, and neighborhood kiryana stores",
  },
  "Fruits & Vegetables": {
    key: "Fruits & Vegetables",
    label: "Fruits & Vegetables",
    icon: CATEGORY_ICONS["Fruits & Vegetables"] ?? "🥬",
    description: "Fresh sabzi, fruit stalls, and produce markets",
  },
  "Bakery & Sweets": {
    key: "Bakery & Sweets",
    label: "Bakery & Sweets",
    icon: CATEGORY_ICONS["Bakery & Sweets"] ?? "🧁",
    description: "Bakeries, mithai shops, cakes, and dessert counters",
  },
  "Fast Food & Restaurants": {
    key: "Fast Food & Restaurants",
    label: "Fast Food & Restaurants",
    icon: CATEGORY_ICONS["Fast Food & Restaurants"] ?? "🍔",
    description: "Restaurants, dhabas, cafés, and quick bites",
  },
  "Pharmacy & Medical": {
    key: "Pharmacy & Medical",
    label: "Pharmacy & Medical",
    icon: CATEGORY_ICONS["Pharmacy & Medical"] ?? "💊",
    description: "Pharmacies, medical stores, and health essentials",
  },
  "Fashion & Apparel": {
    key: "Fashion & Apparel",
    label: "Fashion & Apparel",
    icon: CATEGORY_ICONS["Fashion & Apparel"] ?? "👗",
    description: "Clothing, accessories, and fashion boutiques",
  },
  "Electronics & Gadgets": {
    key: "Electronics & Gadgets",
    label: "Electronics & Gadgets",
    icon: CATEGORY_ICONS["Electronics & Gadgets"] ?? "📱",
    description: "Gadgets, mobile accessories, and tech stores",
  },
  "Home & Living": {
    key: "Home & Living",
    label: "Home & Living",
    icon: CATEGORY_ICONS["Home & Living"] ?? "🏠",
    description: "Furniture, home decor, and lifestyle products",
  },
  "Health & Beauty": {
    key: "Health & Beauty",
    label: "Health & Beauty",
    icon: CATEGORY_ICONS["Health & Beauty"] ?? "💄",
    description: "Beauty products, skincare, and personal care",
  },
  "Books & Stationery": {
    key: "Books & Stationery",
    label: "Books & Stationery",
    icon: CATEGORY_ICONS["Books & Stationery"] ?? "📚",
    description: "Books, notebooks, and office supplies",
  },
  "Sports & Fitness": {
    key: "Sports & Fitness",
    label: "Sports & Fitness",
    icon: CATEGORY_ICONS["Sports & Fitness"] ?? "🏋️",
    description: "Sports equipment, gym gear, and activewear",
  },
  "Toys & Baby Care": {
    key: "Toys & Baby Care",
    label: "Toys & Baby Care",
    icon: CATEGORY_ICONS["Toys & Baby Care"] ?? "🧸",
    description: "Toys, baby products, and childcare items",
  },
  "Automotive Accessories": {
    key: "Automotive Accessories",
    label: "Automotive Accessories",
    icon: CATEGORY_ICONS["Automotive Accessories"] ?? "🚗",
    description: "Car accessories, tools, and automotive parts",
  },
  "Handmade & Crafts": {
    key: "Handmade & Crafts",
    label: "Handmade & Crafts",
    icon: CATEGORY_ICONS["Handmade & Crafts"] ?? "🎨",
    description: "Handcrafted goods, art supplies, and DIY products",
  },
  "Home Maintenance & Repair": {
    key: "Home Maintenance & Repair",
    label: "Home Maintenance & Repair",
    icon: CATEGORY_ICONS["Home Maintenance & Repair"] ?? "🔧",
    description: "Plumbing, electrical, painting, and home repair services",
  },
  "Security & Surveillance": {
    key: "Security & Surveillance",
    label: "Security & Surveillance",
    icon: CATEGORY_ICONS["Security & Surveillance"] ?? "📹",
    description: "CCTV, alarm systems, and security solutions",
  },
  "Tech & IT Services": {
    key: "Tech & IT Services",
    label: "Tech & IT Services",
    icon: CATEGORY_ICONS["Tech & IT Services"] ?? "💻",
    description: "Computer repair, web development, and IT support",
  },
  "Personal & Professional Services": {
    key: "Personal & Professional Services",
    label: "Personal & Professional Services",
    icon: CATEGORY_ICONS["Personal & Professional Services"] ?? "💼",
    description: "Tutoring, consulting, beauty services, and freelancers",
  },
  "Others / Universal": {
    key: "Others / Universal",
    label: "Others / Universal",
    icon: CATEGORY_ICONS["Others / Universal"] ?? "📦",
    description: "General merchandise and multi-category stores",
  },
};

/** Metadata for the "All" pseudo-category (used on homepage). */
export const ALL_CATEGORY_META: CategoryMeta = {
  key: "All",
  label: "All",
  icon: "🏪",
  description: "Browse all shop categories",
};

/**
 * Validate that a category string is a known, allowed category.
 * Returns the valid category key or "All" as a safe fallback.
 * Prevents broken queries from malformed category parameters.
 */
export function validateCategory(value: string | null | undefined): ShopCategory {
  return validateEnum(value, ALL_CATEGORIES, "All");
}

/**
 * Get the full metadata object for a given category key.
 * Sanitizes the input and validates against the known list.
 */
export function getCategoryMeta(key: string | ShopCategory): CategoryMeta {
  const safeKey = sanitizeLight(key);
  const validated = validateCategory(safeKey);
  if (validated === "All") return ALL_CATEGORY_META;
  return CATEGORY_META[validated as Exclude<ShopCategory, "All">] ?? ALL_CATEGORY_META;
}

/**
 * Check if a category value is a legitimate key (for foreign-key validation).
 */
export function isValidCategory(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  return (ALL_CATEGORIES as readonly string[]).includes(value);
}

// ─── Dynamic Counts from Supabase ────────────────────────────────────────────

/**
 * Fetch the count of live shops for each category from Supabase.
 *
 * Uses a single rpc call or aggregates via group-by query.
 * Returns an object mapping each category to its count, plus a `total` field.
 */
export async function fetchCategoryCounts(): Promise<
  ServiceResult<{ categories: CategoryWithCount[]; total: number }>
> {
  const supabase = createClient();

  try {
    // Fetch all live shops and aggregate counts client-side.
    // This is efficient for small-to-medium datasets and avoids complex
    // Supabase RPC calls that may not be available in all plans.
    const { data, error } = await supabase
      .from("shops")
      .select("category")
      .eq("is_live", true);

    if (error) throw error;

    const shops = (data as { category: string }[]) ?? [];

    // Count per category
    const countMap = new Map<string, number>();
    for (const shop of shops) {
      const cat = shop.category;
      countMap.set(cat, (countMap.get(cat) ?? 0) + 1);
    }

    const total = shops.length;

    // Build result array with metadata
    const categories: CategoryWithCount[] = [];

    // "All" comes first
    categories.push({
      ...ALL_CATEGORY_META,
      count: total,
    });

    // Then each real category (preserve SHOP_CATEGORIES order)
    for (const key of ALL_CATEGORIES) {
      if (key === "All") continue;
      const cat = CATEGORY_META[key as Exclude<ShopCategory, "All">];
      if (!cat) continue;
      categories.push({
        ...cat,
        count: countMap.get(key) ?? 0,
      });
    }

    return { success: true, data: { categories, total } };
  } catch (err) {
    logError(err, { module: "categoryService.fetchCategoryCounts" });
    return { success: false, error: "Failed to fetch category counts." };
  }
}

/**
 * Lightweight version: fetch only live shop counts without metadata.
 * Useful for badge / pill overlays.
 */
export async function fetchLiveShopCount(): Promise<ServiceResult<number>> {
  const supabase = createClient();

  try {
    const { count, error } = await supabase
      .from("shops")
      .select("*", { count: "exact", head: true })
      .eq("is_live", true);

    if (error) throw error;
    return { success: true, data: count ?? 0 };
  } catch (err) {
    logError(err, { module: "categoryService.fetchLiveShopCount" });
    return { success: false, error: "Failed to fetch shop count." };
  }
}
