import type { Metadata } from "next";
import DealsPageClient, { type DealsUrlState } from "./DealsPageClient";
import { buildDealsListingMetadata } from "@/lib/seo/listingMetadata";
import { getDealsPageInitialData } from "@/lib/dealsData";
import { getSafeImageUrl } from "@/services/storageService";
import type { ShopDeal } from "@/lib/dealSchedule";
import { isDealActiveOnDate, toPkDateKey } from "@/lib/dealSchedule";
import { SHOP_CATEGORIES, type ShopCategory } from "@/types";

/** ISR: public listing; first page is also `unstable_cache`d in dealsData. */
export const revalidate = 60;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return undefined;
}

function parseUrlState(
  params: Record<string, string | string[] | undefined>,
): DealsUrlState {
  const q = pickParam(params.q) ?? "";
  const filterRaw = pickParam(params.filter);
  const filter =
    filterRaw && ["today", "featured", "upcoming", "all"].includes(filterRaw)
      ? (filterRaw as DealsUrlState["filter"])
      : "all";
  const dayRaw = pickParam(params.day) ?? null;
  const day = dayRaw && /^\d{4}-\d{2}-\d{2}$/.test(dayRaw) ? dayRaw : null;
  const categoryRaw = pickParam(params.category) as ShopCategory | undefined;
  const category =
    categoryRaw && SHOP_CATEGORIES.includes(categoryRaw) ? categoryRaw : "All";
  const subRaw = pickParam(params.sub) ?? null;
  const sub = subRaw && subRaw.length <= 64 ? subRaw : null;
  return { q, filter, day, category, sub };
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  return buildDealsListingMetadata({
    q: pickParam(params.q),
    category: pickParam(params.category),
    filter: pickParam(params.filter),
    day: pickParam(params.day),
  });
}

function lcpPreloadUrls(deals: ShopDeal[], filter: DealsUrlState["filter"]): string[] {
  const today = toPkDateKey();
  const pool =
    filter === "today"
      ? deals.filter((d) => isDealActiveOnDate(d, today))
      : filter === "featured"
        ? deals.filter((d) => d.is_featured)
        : deals;
  const urls: string[] = [];
  for (const deal of pool) {
    const raw = deal.image_url?.trim();
    if (!raw) continue;
    const src = getSafeImageUrl(raw, "product", "card");
    if (!src || src.startsWith("data:")) continue;
    if (!urls.includes(src)) urls.push(src);
    if (urls.length >= 2) break;
  }
  return urls;
}

export default async function DealsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const urlState = parseUrlState(params);
  const initialDeals = await getDealsPageInitialData();
  const preloads = lcpPreloadUrls(initialDeals, urlState.filter);

  return (
    <>
      {preloads.map((href) => (
        <link key={href} rel="preload" as="image" href={href} fetchPriority="high" />
      ))}
      <DealsPageClient initialDeals={initialDeals} urlState={urlState} />
    </>
  );
}
