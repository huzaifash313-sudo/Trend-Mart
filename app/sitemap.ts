import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/appUrl";
import { SHOP_CATEGORIES } from "@/types";
import {
  entryLastModified,
  fetchActiveStoryShopIds,
  fetchSitemapCategories,
  fetchSitemapDeals,
  fetchSitemapProducts,
  fetchSitemapShops,
} from "@/lib/seo/sitemapData";

/* ────────────────────────────────────────────────────────────────────────── */
/*  TrendsMart — Dynamic Sitemap (live Supabase data, ISR hourly)             */
/* ────────────────────────────────────────────────────────────────────────── */

export const revalidate = 3600;

const BASE_URL = getPublicAppUrl();

function getShopPriority(
  index: number,
  hasStories: boolean,
): number {
  const base = index < 10 ? 0.9 : index < 60 ? 0.8 : 0.7;
  return Math.min(1, base + (hasStories ? 0.05 : 0));
}

function getCategoryPriority(count: number, maxCount: number): number {
  if (maxCount === 0) return 0.6;
  return 0.6 + (count / maxCount) * 0.3;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const [shops, categories, products, deals, storyShopIds] = await Promise.all([
    fetchSitemapShops(),
    fetchSitemapCategories(),
    fetchSitemapProducts(),
    fetchSitemapDeals(),
    fetchActiveStoryShopIds(),
  ]);

  const storyShopSet = new Set(storyShopIds);
  const maxCategoryCount = Math.max(...categories.map((c) => c.count), 1);

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
    {
      url: `${BASE_URL}/wishlist`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.4,
    },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${BASE_URL}/products?category=${encodeURIComponent(cat.name)}`,
    lastModified: entryLastModified(cat.updated_at, null, now),
    changeFrequency: "daily",
    priority: getCategoryPriority(cat.count, maxCategoryCount),
  }));

  const dealCategoryRoutes: MetadataRoute.Sitemap = categories
    .filter((cat) => cat.name && cat.name !== "All")
    .map((cat) => ({
      url: `${BASE_URL}/deals?category=${encodeURIComponent(cat.name)}`,
      lastModified: entryLastModified(cat.updated_at, null, now),
      changeFrequency: "daily",
      priority: getCategoryPriority(cat.count, maxCategoryCount) * 0.95,
    }));

  const homeCategoryRoutes: MetadataRoute.Sitemap = SHOP_CATEGORIES.filter(
    (c) => c !== "All",
  ).map((category) => ({
    url: `${BASE_URL}/?category=${encodeURIComponent(category)}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.85,
  }));

  const shopRoutes: MetadataRoute.Sitemap = shops.map((shop, index) => ({
    url: `${BASE_URL}${shop.seo_path}`,
    lastModified: entryLastModified(shop.updated_at, shop.created_at, now),
    changeFrequency: "daily",
    priority: getShopPriority(index, storyShopSet.has(shop.id)),
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${BASE_URL}/products/${encodeURIComponent(product.seo_slug)}`,
    lastModified: entryLastModified(
      product.updated_at,
      product.created_at,
      now,
    ),
    changeFrequency: "weekly",
    priority: 0.75,
  }));

  const dealRoutes: MetadataRoute.Sitemap = deals.map((deal) => ({
    url: `${BASE_URL}/deals/${encodeURIComponent(deal.seo_slug)}`,
    lastModified: entryLastModified(deal.updated_at, deal.created_at, now),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [
    ...staticRoutes,
    ...categoryRoutes,
    ...dealCategoryRoutes,
    ...homeCategoryRoutes,
    ...shopRoutes,
    ...productRoutes,
    ...dealRoutes,
  ];
}
