import type { Metadata } from "next";
import type { ShopCategory, Shop, Story } from "@/types";
import { SHOP_CATEGORIES } from "@/types";
import HomeClient from "@/components/HomeClient";
import { fetchHomeInitialData } from "@/lib/homeData";
import { generateHomepageMetadata } from "@/lib/metadata";

const EMPTY_SHOPS: Shop[] = [];
const EMPTY_STORIES: Story[] = [];

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const category = params.category?.trim();
  const q = params.q?.trim();

  if (!category && !q) {
    return generateHomepageMetadata();
  }

  const base = generateHomepageMetadata();
  const title = q
    ? `Shops: "${q}"`
    : category && SHOP_CATEGORIES.includes(category as ShopCategory)
      ? `${category} shops near you`
      : base.title;

  return {
    ...base,
    title: title as string,
    description: q
      ? `Local shops matching "${q}" on TrendsMart — browse products, deals, and order via WhatsApp.`
      : category
        ? `Discover ${category.toLowerCase()} shops on TrendsMart. Order via WhatsApp from stores near you.`
        : base.description,
  };
}

/**
 * Homepage — server-rendered storefront.
 *
 * The server fetches the core public datasets (shops + stories) so the first
 * paint ships real content instead of skeletons, and the client seeds its
 * React Query cache with that data (no duplicate fetch). Deals / coupons and
 * all interactivity stay on the client as non-blocking enrichment.
 *
 * SSR is a progressive enhancement: if the initial fetch fails (misconfig,
 * Supabase hiccup) we render with empty seeds and the client fetches on its
 * own, exactly like the previous client-only behaviour.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const params = await searchParams;
  const initialCategory = (params.category as ShopCategory | undefined) ?? "All";
  const initialQuery = params.q ?? "";

  let initial = { shops: EMPTY_SHOPS, stories: EMPTY_STORIES, myShopId: null as string | null };
  try {
    initial = await fetchHomeInitialData();
  } catch {
    // Non-fatal — client queries will fetch as before.
  }

  return (
    <HomeClient
      initialShops={initial.shops}
      initialStories={initial.stories}
      initialMyShopId={initial.myShopId}
      initialCategory={
        SHOP_CATEGORIES.includes(initialCategory) ? initialCategory : "All"
      }
      initialQuery={initialQuery}
    />
  );
}
