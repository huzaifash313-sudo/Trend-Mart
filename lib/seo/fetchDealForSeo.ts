import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createBrowserClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { parseDealIdFromSlug } from "@/lib/seo/dealSlug";

/* -------------------------------------------------------------------------- */
/*  Server-side deal fetch for SEO (metadata, JSON-LD, sitemap)                */
/* -------------------------------------------------------------------------- */

export interface DealSeoShop {
  id: string;
  name: string;
  slug?: string | null;
  location?: string | null;
  logo_url?: string | null;
}

export interface DealSeoRecord {
  id: string;
  shop_id: string;
  title: string;
  description?: string | null;
  price?: number | null;
  original_price?: number | null;
  image_url?: string | null;
  images?: string[] | null;
  badge_text?: string | null;
  is_active: boolean;
  is_featured?: boolean;
  product_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  shop: DealSeoShop;
}

const DEAL_SEO_SELECT = `
  id, shop_id, title, description, price, original_price,
  image_url, images, badge_text, is_active, is_featured, product_id,
  updated_at, created_at,
  shops!inner ( id, name, slug, location, logo_url, is_live, verification_status )
`;

type RawDealRow = {
  id: string;
  shop_id: string;
  title: string | null;
  description?: string | null;
  price?: number | null;
  original_price?: number | null;
  image_url?: string | null;
  images?: string[] | null;
  badge_text?: string | null;
  is_active?: boolean | null;
  is_featured?: boolean | null;
  product_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  shops?:
    | DealSeoShop
    | (DealSeoShop & { is_live?: boolean; verification_status?: string })[]
    | null;
};

function normalizeShopJoin(
  shops: RawDealRow["shops"],
): DealSeoShop | null {
  if (!shops) return null;
  if (Array.isArray(shops)) return shops[0] ?? null;
  return shops;
}

function mapDealRow(row: RawDealRow): DealSeoRecord | null {
  if (!row.id || !row.title?.trim()) return null;
  const shop = normalizeShopJoin(row.shops);
  if (!shop?.id) return null;

  const gallery = Array.isArray(row.images)
    ? row.images.filter((u): u is string => typeof u === "string" && !!u.trim())
    : [];

  return {
    id: row.id,
    shop_id: row.shop_id,
    title: row.title.trim(),
    description: row.description ?? null,
    price: typeof row.price === "number" ? row.price : null,
    original_price:
      typeof row.original_price === "number" ? row.original_price : null,
    image_url: row.image_url?.trim() || gallery[0] || null,
    images: gallery.length ? gallery : null,
    badge_text: row.badge_text ?? null,
    is_active: row.is_active !== false,
    is_featured: row.is_featured === true,
    product_id: row.product_id ?? null,
    updated_at: row.updated_at ?? null,
    created_at: row.created_at ?? null,
    shop: {
      id: shop.id,
      name: shop.name?.trim() || "Local store",
      slug: shop.slug ?? null,
      location: shop.location ?? null,
      logo_url: shop.logo_url ?? null,
    },
  };
}

function createAnonSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

async function queryDealById(
  dealId: string,
  supabase: SupabaseClient,
): Promise<DealSeoRecord | null> {
  if (!dealId) return null;

  const { data } = await supabase
    .from("shop_deals")
    .select(DEAL_SEO_SELECT)
    .eq("id", dealId)
    .eq("is_active", true)
    .eq("shops.is_live", true)
    .eq("shops.verification_status", "approved")
    .maybeSingle();

  return data ? mapDealRow(data as RawDealRow) : null;
}

export function getDealPrimaryImageUrl(
  deal: Pick<DealSeoRecord, "image_url" | "images">,
): string | null {
  const first = Array.isArray(deal.images)
    ? deal.images.find((u) => typeof u === "string" && u.trim())
    : null;
  return deal.image_url?.trim() || first?.trim() || null;
}

export function getDealLastModified(deal: DealSeoRecord): Date {
  const raw = deal.updated_at || deal.created_at;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export async function fetchDealForSeoById(
  dealId: string,
): Promise<DealSeoRecord | null> {
  try {
    const supabase = await createServerClient();
    return queryDealById(dealId, supabase);
  } catch {
    const supabase = createAnonSupabase();
    if (!supabase) return null;
    try {
      return queryDealById(dealId, supabase);
    } catch {
      return null;
    }
  }
}

export async function fetchDealForSeoBySlug(
  slug: string,
): Promise<DealSeoRecord | null> {
  const dealId = parseDealIdFromSlug(slug);
  if (!dealId) return null;
  return fetchDealForSeoById(dealId);
}
