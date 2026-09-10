/* -------------------------------------------------------------------------- */
/*  TrendsMart — /products server seed (public, cookie-free, cacheable)        */
/* -------------------------------------------------------------------------- */

import { unstable_cache } from "next/cache";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import type { MarketplaceProduct, Product } from "@/types";
import { diversifyMarketplaceFeed } from "@/lib/marketplaceDiversity";

const PRODUCTS_PAGE_SIZE = 48;

const MARKETPLACE_SELECT = `
  id, shop_id, name, title, price, original_price, compare_at_price,
  deal_expires_at, currency, image_url, images, is_available, stock_status,
  accepts_delivery, accepts_pickup,
  category_id, sub_category_id, created_at, short_code, variants, price_tiers,
  orders_count, click_count, avg_rating, review_count,
  shops!inner (
    id, name, logo_url, whatsapp_number, category,
    is_live, verification_status, latitude, longitude, location,
    service_radius_km, delivery_zones,
    avg_rating, review_count,
    free_delivery_threshold, announcement, announcement_expires_at,
    free_delivery_radius_km,
    delivery_fee_flat, delivery_fee_per_km
  )
`;

const MARKETPLACE_SELECT_LEGACY = `
  id, shop_id, name, title, price, original_price, compare_at_price,
  deal_expires_at, currency, image_url, images, is_available, stock_status,
  category_id, sub_category_id, created_at, variants,
  shops!inner (
    id, name, logo_url, whatsapp_number, category,
    is_live, verification_status, latitude, longitude, location
  )
`;

type ShopJoin = {
  id?: string;
  name?: string;
  logo_url?: string | null;
  whatsapp_number?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location?: string | null;
  service_radius_km?: number | null;
  delivery_zones?: string[] | null;
  avg_rating?: number | null;
  review_count?: number | null;
  free_delivery_threshold?: number | null;
  free_delivery_radius_km?: number | null;
  delivery_fee_flat?: number | null;
  delivery_fee_per_km?: number | null;
  announcement?: string | null;
  announcement_expires_at?: string | null;
};

function mapMarketplaceRow(row: Record<string, unknown>): MarketplaceProduct | null {
  const shopRaw = row.shops as ShopJoin | ShopJoin[] | null | undefined;
  const shop = Array.isArray(shopRaw) ? shopRaw[0] : shopRaw;
  if (!shop?.name) return null;

  const images = Array.isArray(row.images) ? (row.images as string[]) : null;

  return {
    id: String(row.id),
    shop_id: String(row.shop_id ?? shop.id ?? ""),
    name: String(row.name ?? ""),
    title: (row.title as string | null) ?? null,
    description: String(row.description ?? ""),
    price: Number(row.price) || 0,
    original_price: (row.original_price as number | null) ?? null,
    compare_at_price: (row.compare_at_price as number | null) ?? null,
    deal_expires_at: (row.deal_expires_at as string | null) ?? null,
    currency: String(row.currency ?? "PKR"),
    image_url: (row.image_url as string | null) ?? null,
    images,
    is_available: row.is_available !== false,
    accepts_delivery: row.accepts_delivery !== false,
    accepts_pickup: row.accepts_pickup !== false,
    stock_status: (row.stock_status as string | undefined) ?? undefined,
    variants: (row.variants as Product["variants"]) ?? null,
    price_tiers: (row.price_tiers as Product["price_tiers"]) ?? null,
    orders_count: Number(row.orders_count) || 0,
    click_count: Number(row.click_count) || 0,
    category_id: (row.category_id as string | null) ?? null,
    sub_category_id: (row.sub_category_id as string | null) ?? null,
    created_at: (row.created_at as string | undefined) ?? undefined,
    short_code: (row.short_code as string | null) ?? null,
    shop_name: String(shop.name),
    shop_logo_url: shop.logo_url ?? null,
    shop_whatsapp: shop.whatsapp_number ?? null,
    shop_category: shop.category ?? null,
    shop_latitude: typeof shop.latitude === "number" ? shop.latitude : null,
    shop_longitude: typeof shop.longitude === "number" ? shop.longitude : null,
    shop_location: shop.location ?? null,
    shop_service_radius_km:
      typeof shop.service_radius_km === "number" ? shop.service_radius_km : null,
    shop_delivery_zones: Array.isArray(shop.delivery_zones)
      ? shop.delivery_zones
      : null,
    shop_avg_rating:
      typeof shop.avg_rating === "number" ? shop.avg_rating : Number(shop.avg_rating) || null,
    shop_review_count:
      typeof shop.review_count === "number"
        ? shop.review_count
        : Number(shop.review_count) || null,
    avg_rating:
      typeof row.avg_rating === "number" ? row.avg_rating : Number(row.avg_rating) || null,
    review_count:
      typeof row.review_count === "number"
        ? row.review_count
        : Number(row.review_count) || null,
    shop_free_delivery_threshold:
      typeof shop.free_delivery_threshold === "number"
        ? shop.free_delivery_threshold
        : Number(shop.free_delivery_threshold) || null,
    shop_free_delivery_radius_km:
      typeof shop.free_delivery_radius_km === "number"
        ? shop.free_delivery_radius_km
        : Number(shop.free_delivery_radius_km) || null,
    shop_delivery_fee_flat:
      typeof shop.delivery_fee_flat === "number"
        ? shop.delivery_fee_flat
        : Number(shop.delivery_fee_flat) || null,
    shop_delivery_fee_per_km:
      typeof shop.delivery_fee_per_km === "number"
        ? shop.delivery_fee_per_km
        : Number(shop.delivery_fee_per_km) || null,
    shop_announcement: shop.announcement ?? null,
    shop_announcement_expires_at: shop.announcement_expires_at ?? null,
  };
}

async function fetchDefaultProductsPage(): Promise<MarketplaceProduct[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return [];

  const supabase = createAnonClient(url, key, { auth: { persistSession: false } });
  const end = PRODUCTS_PAGE_SIZE - 1;

  let rows: Record<string, unknown>[] = [];

  {
    const primary = await supabase
      .from("products")
      .select(MARKETPLACE_SELECT)
      .eq("shops.is_live", true)
      .eq("shops.verification_status", "approved")
      .eq("is_available", true)
      .order("created_at", { ascending: false })
      .range(0, end);

    if (!primary.error && primary.data) {
      rows = primary.data as unknown as Record<string, unknown>[];
    } else {
      const legacy = await supabase
        .from("products")
        .select(MARKETPLACE_SELECT_LEGACY)
        .eq("shops.is_live", true)
        .eq("shops.verification_status", "approved")
        .eq("is_available", true)
        .order("created_at", { ascending: false })
        .range(0, end);
      if (!legacy.error && legacy.data) {
        rows = legacy.data as unknown as Record<string, unknown>[];
      }
    }
  }

  const items = rows
    .map(mapMarketplaceRow)
    .filter((p): p is MarketplaceProduct => !!p);
  return diversifyMarketplaceFeed(items, "for_you");
}

const getCachedProductsPage = unstable_cache(
  async () => fetchDefaultProductsPage(),
  ["products-listing-page-0"],
  { revalidate: 60 },
);

/** Default first page for /products SSR (no query/category filters). */
export async function getProductsPageInitialData(): Promise<MarketplaceProduct[]> {
  try {
    return await getCachedProductsPage();
  } catch {
    return [];
  }
}

export { PRODUCTS_PAGE_SIZE };
