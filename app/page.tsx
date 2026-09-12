import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ShopCategory, Shop, Story } from "@/types";
import { SHOP_CATEGORIES } from "@/types";
import HomeClient from "@/components/HomeClient";
import { fetchHomeInitialData } from "@/lib/homeData";
import { generateHomepageMetadata } from "@/lib/metadata";
import { logError } from "@/services/errorService";

const EMPTY_SHOPS: Shop[] = [];
const EMPTY_STORIES: Story[] = [];

export const revalidate = 120;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const category = params.category?.trim();
  const q = params.q?.trim();

  // Search queries redirect to /search — don't index thin /?q= URLs.
  if (q) {
    return {
      ...generateHomepageMetadata(),
      robots: { index: false, follow: true },
    };
  }

  if (!category) {
    return generateHomepageMetadata();
  }

  const base = generateHomepageMetadata();
  const title = SHOP_CATEGORIES.includes(category as ShopCategory)
    ? `${category} shops near you`
    : base.title;

  return {
    ...base,
    title: title as string,
    description: `Discover ${category.toLowerCase()} shops on TrendsMart. Order via WhatsApp from stores near you.`,
    robots: { index: true, follow: true },
  };
}

/**
 * Homepage — server-rendered storefront.
 *
 * Search queries (`?q=`) redirect to unified `/search` so products + shops +
 * deals share one path. Category filters stay on `/`.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim();
  if (q) {
    redirect(`/search?q=${encodeURIComponent(q)}`);
  }

  const initialCategory = (params.category as ShopCategory | undefined) ?? "All";

  let initial = {
    shops: EMPTY_SHOPS,
    stories: EMPTY_STORIES,
    deals: [] as import("@/lib/dealSchedule").ShopDeal[],
    myShopId: null as string | null,
  };
  try {
    initial = await fetchHomeInitialData();
  } catch (err) {
    // Non-fatal — client queries refill the page; log so SSR empty isn't silent.
    logError(err, { module: "Home.ssr" });
  }

  return (
    <HomeClient
      initialShops={initial.shops}
      initialStories={initial.stories}
      initialDeals={initial.deals}
      initialMyShopId={initial.myShopId}
      initialCategory={
        SHOP_CATEGORIES.includes(initialCategory) ? initialCategory : "All"
      }
      initialQuery=""
    />
  );
}
