import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createBrowserClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { resolveShopReference } from "@/lib/seo/shopSlug";

/* -------------------------------------------------------------------------- */
/*  Server-side shop fetch for SEO (metadata, JSON-LD, sitemap)                */
/* -------------------------------------------------------------------------- */

export interface ShopSeoRecord {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  location: string | null;
  store_bio: string | null;
  logo_url: string | null;
  banner_url: string | null;
  latitude: number | null;
  longitude: number | null;
  whatsapp_number: string | null;
  business_hours: string | null;
  avg_rating: number | null;
  review_count: number | null;
  product_count: number | null;
  updated_at: string | null;
  created_at: string | null;
}

const SHOP_SEO_SELECT = `
  id, name, slug, category, location, store_bio, logo_url, banner_url,
  latitude, longitude, whatsapp_number, business_hours,
  avg_rating, review_count, updated_at, created_at
`;

function createAnonSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

async function countShopProducts(
  supabase: SupabaseClient,
  shopId: string,
): Promise<number | null> {
  try {
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("is_available", true);
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

function mapShopRow(
  row: Record<string, unknown>,
  productCount: number | null,
): ShopSeoRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? "").trim() || "Local store",
    slug: (row.slug as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    store_bio: (row.store_bio as string | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    banner_url: (row.banner_url as string | null) ?? null,
    latitude:
      typeof row.latitude === "number" ? row.latitude : null,
    longitude:
      typeof row.longitude === "number" ? row.longitude : null,
    whatsapp_number: (row.whatsapp_number as string | null) ?? null,
    business_hours: (row.business_hours as string | null) ?? null,
    avg_rating:
      typeof row.avg_rating === "number" ? row.avg_rating : null,
    review_count:
      typeof row.review_count === "number" ? row.review_count : null,
    product_count: productCount,
    updated_at: (row.updated_at as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  };
}

async function queryShopByReference(
  ref: { kind: "uuid" | "slug"; value: string },
  supabase: SupabaseClient,
): Promise<ShopSeoRecord | null> {
  if (!ref.value) return null;

  let query = supabase
    .from("shops")
    .select(SHOP_SEO_SELECT)
    .eq("is_live", true)
    .eq("verification_status", "approved")
    .limit(1);

  query =
    ref.kind === "uuid"
      ? query.eq("id", ref.value)
      : query.eq("slug", ref.value);

  const { data } = await query.maybeSingle();
  if (!data) return null;

  const productCount = await countShopProducts(
    supabase,
    String((data as { id: string }).id),
  );
  return mapShopRow(data as Record<string, unknown>, productCount);
}

export function getShopLastModified(shop: ShopSeoRecord): Date {
  const raw = shop.updated_at || shop.created_at;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export async function fetchShopForSeoByReference(
  idOrSlug: string,
): Promise<ShopSeoRecord | null> {
  const ref = resolveShopReference(idOrSlug);
  try {
    const supabase = await createServerClient();
    return queryShopByReference(ref, supabase);
  } catch {
    const supabase = createAnonSupabase();
    if (!supabase) return null;
    try {
      return queryShopByReference(ref, supabase);
    } catch {
      return null;
    }
  }
}

export async function fetchShopForSeoById(
  shopId: string,
): Promise<ShopSeoRecord | null> {
  return fetchShopForSeoByReference(shopId);
}
