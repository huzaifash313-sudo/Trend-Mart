/* -------------------------------------------------------------------------- */
/*  TrendsMart — /deals server seed (public, cookie-free, cacheable)           */
/*  First paint ships real deals so LCP images are discoverable in HTML.       */
/* -------------------------------------------------------------------------- */

import { unstable_cache } from "next/cache";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { normalizeDealGallery } from "@/lib/productImages";
import type { DealScheduleType, ShopDeal } from "@/lib/dealSchedule";

/** Keep in sync with `DEALS_PAGE_SIZE` in `lib/queries.ts`. */
const DEALS_PAGE_SIZE = 24;

const DEAL_BASE =
  "id, shop_id, title, description, schedule_type, weekdays, starts_on, ends_on, day_of_month, is_active, created_at, updated_at";
const DEAL_VISUAL = "image_url, images, badge_text, is_featured";
const DEAL_COMMERCE = "product_id, price, original_price";
const PRODUCT_JOIN =
  "products:product_id ( id, name, image_url, images, price, original_price, sub_category_id )";
const SHOP_JOIN = "shops:shop_id ( name, logo_url, slug, whatsapp_number )";

const LIST_SELECT_ATTEMPTS = [
  `${DEAL_BASE}, ${DEAL_VISUAL}, ${DEAL_COMMERCE}, ${SHOP_JOIN}, ${PRODUCT_JOIN}`,
  `${DEAL_BASE}, ${DEAL_VISUAL}, ${DEAL_COMMERCE}, ${SHOP_JOIN}`,
  `${DEAL_BASE}, ${DEAL_VISUAL}, ${SHOP_JOIN}`,
  `${DEAL_BASE}, image_url, badge_text, is_featured, ${SHOP_JOIN}`,
  `${DEAL_BASE}, ${SHOP_JOIN}`,
  `*, ${SHOP_JOIN}`,
  "*",
] as const;

function parseImages(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const urls = raw.filter((u): u is string => typeof u === "string" && !!u.trim());
  return urls.length ? urls : [];
}

function parseMoney(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseDeal(row: Record<string, unknown>): ShopDeal {
  const shops = row.shops as Record<string, unknown> | null | undefined;
  const product = row.products as Record<string, unknown> | null | undefined;
  const dealImages = parseImages(row.images);
  const productImages = product ? parseImages(product.images) : null;
  const cover =
    (row.image_url as string | null)?.trim() ||
    dealImages?.[0] ||
    (product?.image_url as string | null)?.trim() ||
    productImages?.[0] ||
    null;
  const galleryUrls =
    (dealImages && dealImages.length > 0 ? dealImages : null) ??
    (productImages && productImages.length > 0 ? productImages : null) ??
    (cover ? [cover] : []);
  const gallery = normalizeDealGallery(galleryUrls);

  return {
    id: String(row.id),
    shop_id: String(row.shop_id),
    title: String(row.title ?? ""),
    description: (row.description as string | null) ?? null,
    schedule_type: (row.schedule_type as DealScheduleType) ?? "weekly",
    weekdays: Array.isArray(row.weekdays)
      ? (row.weekdays as number[]).map((n) => Number(n))
      : null,
    starts_on: (row.starts_on as string | null) ?? null,
    ends_on: (row.ends_on as string | null) ?? null,
    day_of_month: row.day_of_month == null ? null : Number(row.day_of_month),
    is_active: row.is_active !== false,
    image_url: gallery.image_url || cover,
    images: gallery.images.length ? gallery.images : cover ? [cover] : null,
    badge_text: (row.badge_text as string | null) ?? null,
    is_featured: row.is_featured === true,
    product_id: row.product_id ? String(row.product_id) : null,
    price: parseMoney(row.price) ?? (product ? parseMoney(product.price) : null),
    original_price:
      parseMoney(row.original_price) ??
      (product ? parseMoney(product.original_price) : null),
    accepts_delivery: row.accepts_delivery !== false,
    accepts_pickup: row.accepts_pickup !== false,
    sub_category_id:
      product && product.sub_category_id ? String(product.sub_category_id) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    shop_name: shops ? String(shops.name ?? "") || null : null,
    shop_logo_url: shops ? ((shops.logo_url as string | null) ?? null) : null,
    shop_slug: shops ? ((shops.slug as string | null) ?? null) : null,
    shop_whatsapp: shops
      ? ((shops.whatsapp_number as string | null) ?? null)
      : null,
  };
}

async function fetchDealsPage(limit: number, offset: number): Promise<ShopDeal[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return [];

  const supabase = createAnonClient(url, key, {
    auth: { persistSession: false },
  });
  const cap = Math.min(Math.max(limit, 12), 160);
  const start = Math.max(0, Math.floor(offset));

  for (const select of LIST_SELECT_ATTEMPTS) {
    try {
      let res = await supabase
        .from("shop_deals")
        .select(select)
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
        .range(start, start + cap - 1);

      if (res.error && /is_featured/i.test(String(res.error.message))) {
        res = await supabase
          .from("shop_deals")
          .select(select)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .range(start, start + cap - 1);
      }
      if (res.error) continue;
      const rows = (res.data as unknown as Record<string, unknown>[] | null) ?? [];
      return rows.map(parseDeal);
    } catch {
      /* try next select shape */
    }
  }
  return [];
}

const getCachedDealsPage = unstable_cache(
  async () => fetchDealsPage(DEALS_PAGE_SIZE, 0),
  ["deals-listing-page-0"],
  { revalidate: 60 },
);

/** First page of active deals for /deals SSR + React Query seed. */
export async function getDealsPageInitialData(): Promise<ShopDeal[]> {
  try {
    return await getCachedDealsPage();
  } catch {
    return [];
  }
}
