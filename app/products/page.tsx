import type { Metadata } from "next";
import ProductsPageClient, { type ProductsUrlState } from "./ProductsPageClient";
import { buildProductsListingMetadata } from "@/lib/seo/listingMetadata";
import { getProductsPageInitialData } from "@/lib/productsData";
import { getSafeImageUrl } from "@/services/storageService";
import type { MarketplaceProduct } from "@/types";
import { SHOP_CATEGORIES, type ShopCategory } from "@/types";
import type { MarketplaceSort } from "@/services/productService";

export const revalidate = 60;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SORT_VALUES: MarketplaceSort[] = [
  "for_you",
  "nearest",
  "popular",
  "newest",
  "discount",
  "price_asc",
  "price_desc",
];

function pickParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return undefined;
}

function parseUrlState(
  params: Record<string, string | string[] | undefined>,
): ProductsUrlState {
  const q = pickParam(params.q) ?? "";
  const categoryRaw = pickParam(params.category) as ShopCategory | undefined;
  const category =
    categoryRaw && SHOP_CATEGORIES.includes(categoryRaw) ? categoryRaw : "All";
  const subRaw = pickParam(params.sub) ?? null;
  const sub = subRaw && subRaw.length <= 64 ? subRaw : null;
  const sortRaw = pickParam(params.sort) as MarketplaceSort | undefined;
  const sort =
    sortRaw && SORT_VALUES.includes(sortRaw) ? sortRaw : "for_you";
  const product = pickParam(params.product) ?? null;
  return { q, category, sub, sort, product };
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  return buildProductsListingMetadata({
    q: pickParam(params.q),
    category: pickParam(params.category),
  });
}

function lcpPreloadUrls(products: MarketplaceProduct[]): string[] {
  const urls: string[] = [];
  for (const p of products) {
    const raw = p.image_url?.trim();
    if (!raw) continue;
    const src = getSafeImageUrl(raw, "product", "card");
    if (!src || src.startsWith("data:")) continue;
    if (!urls.includes(src)) urls.push(src);
    if (urls.length >= 2) break;
  }
  return urls;
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const urlState = parseUrlState(params);
  const useSeed =
    !urlState.q.trim() &&
    urlState.category === "All" &&
    !urlState.sub &&
    urlState.sort === "for_you";
  const initialProducts = useSeed ? await getProductsPageInitialData() : [];
  const preloads = lcpPreloadUrls(initialProducts);

  return (
    <>
      {preloads.map((href) => (
        <link key={href} rel="preload" as="image" href={href} fetchPriority="high" />
      ))}
      <ProductsPageClient urlState={urlState} initialProducts={initialProducts} />
    </>
  );
}
