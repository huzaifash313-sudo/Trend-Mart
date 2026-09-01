import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { getPublicAppUrl } from "@/lib/appUrl";
import { getShopPath } from "@/lib/shopSlug";

/* ────────────────────────────────────────────────────────────────────────── */
/*  TrendsMart — Dynamic Sitemap Generator (Enhanced SEO)                       */
/*                                                                             */
/*  Automatically indexes:                                                     */
/*   - All live shop storefront pages with high priority                       */
/*   - Category-level routes with shop counts for SEO relevance               */
/*   - Product detail pages within shop storefronts                           */
/*   - Static utility pages (search, wishlist, orders, addresses)             */
/*   - Promotional story landing pages                                        */
/*                                                                             */
/*  Revalidates every hour to keep search engines updated.                    */
/*  Respects robots.txt directives for private routes (dashboard, auth,       */
/*  admin).                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

export const revalidate = 3600; // 1 hour — Next.js ISR revalidation

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_URL = getPublicAppUrl();

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

async function getLiveShops(): Promise<
  { id: string; name: string; slug: string | null }[]
> {
  try {
    const supabase = createSupabase();
    const { data } = await supabase
      .from("shops")
      .select("id, name, slug")
      .eq("is_live", true)
      .order("created_at", { ascending: false })
      .limit(5000);
    return (data as { id: string; name: string; slug: string | null }[]) ?? [];
  } catch {
    return [];
  }
}

async function getActiveCategories(): Promise<
  { slug: string; name: string; count: number }[]
> {
  try {
    const supabase = createSupabase();
    const { data } = await supabase
      .from("shops")
      .select("category")
      .eq("is_live", true)
      .limit(5000);
    if (!data) return [];

    // Aggregate category counts for priority weighting
    const categoryMap = new Map<string, number>();
    for (const row of data as { category: string }[]) {
      const slug = row.category.toLowerCase().replace(/\s+/g, "-");
      categoryMap.set(slug, (categoryMap.get(slug) ?? 0) + 1);
    }

    return Array.from(categoryMap.entries()).map(([slug, count]) => ({
      slug,
      name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      count,
    }));
  } catch {
    return [];
  }
}

async function getProductSlugs(): Promise<
  { id: string; shop_id: string; name: string; short_code: string | null }[]
> {
  try {
    const supabase = createSupabase();
    const { data } = await supabase
      .from("products")
      .select("id, shop_id, name, short_code")
      .eq("is_available", true)
      .order("created_at", { ascending: false })
      .limit(5000);
    return (data as {
      id: string;
      shop_id: string;
      name: string;
      short_code: string | null;
    }[]) ?? [];
  } catch {
    return [];
  }
}

async function getActiveStoryShopIds(): Promise<string[]> {
  try {
    const supabase = createSupabase();
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("stories")
      .select("shop_id")
      .gt("expires_at", now)
      .limit(1000);
    if (!data) return [];
    const unique = new Set(
      (data as { shop_id: string }[]).map((s) => s.shop_id),
    );
    return Array.from(unique);
  } catch {
    return [];
  }
}

// ─── Priority calculator ────────────────────────────────────────────────────

/** Higher priority for shops with more products / recent activity. */
function getShopPriority(
  index: number,
  total: number,
  hasStories: boolean,
): number {
  // First 10 shops get 0.9, next 50 get 0.8, rest 0.7
  // Shops with active stories get a 0.05 boost
  const base = index < 10 ? 0.9 : index < 60 ? 0.8 : 0.7;
  return Math.min(1, base + (hasStories ? 0.05 : 0));
}

/**
 * Category priority based on number of shops in that category.
 * More shops = higher search relevance.
 */
function getCategoryPriority(count: number, maxCount: number): number {
  if (maxCount === 0) return 0.6;
  const ratio = count / maxCount;
  return 0.6 + ratio * 0.3; // Range: 0.6 to 0.9
}

// ─── Sitemap Generator ──────────────────────────────────────────────────────

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Fetch all data in parallel for performance
  const [shops, categories, products, storyShopIds] = await Promise.all([
    getLiveShops(),
    getActiveCategories(),
    getProductSlugs(),
    getActiveStoryShopIds(),
  ]);

  const storyShopSet = new Set(storyShopIds);
  const shopIds = shops.map((s) => s.id);
  const maxCategoryCount = Math.max(
    ...categories.map((c) => c.count),
    1,
  );
  const totalShops = shopIds.length;

  // ── Static Routes ───────────────────────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/products`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/deals`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/search`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/faq`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/support`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/legal/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/legal/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/legal/refund-policy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/legal/merchant-guidelines`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // ── Category Routes ────────────────────────────────────────────────────
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${BASE_URL}/products?category=${encodeURIComponent(cat.name)}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: getCategoryPriority(cat.count, maxCategoryCount),
  }));

  // ── Shop Storefront Routes ──────────────────────────────────────────────
  const shopRoutes: MetadataRoute.Sitemap = shops.map((shop, index) => ({
    url: `${BASE_URL}${getShopPath(shop)}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: getShopPriority(index, totalShops, storyShopSet.has(shop.id)),
  }));

  // ── Product Deep-Link Routes ────────────────────────────────────────────
  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${BASE_URL}/p/${p.short_code || p.id}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // ── Combine All Routes ──────────────────────────────────────────────────
  return [
    ...staticRoutes,
    ...categoryRoutes,
    ...shopRoutes,
    ...productRoutes,
  ];
}