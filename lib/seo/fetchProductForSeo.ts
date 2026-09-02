import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createBrowserClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  resolveProductCodeReference,
  resolveProductSlugReference,
} from "@/lib/seo/productSlug";

/* -------------------------------------------------------------------------- */
/*  Server-side product fetch for SEO (metadata, JSON-LD, sitemap helpers)     */
/* -------------------------------------------------------------------------- */

export interface ProductSeoShop {
  id: string;
  name: string;
  slug?: string | null;
  category?: string | null;
  location?: string | null;
  logo_url?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
}

export interface ProductSeoRecord {
  id: string;
  name: string;
  title?: string | null;
  description?: string | null;
  price: number;
  original_price?: number | null;
  compare_at_price?: number | null;
  currency?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  is_available: boolean;
  short_code?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  /** Product-scoped rating (preferred for JSON-LD). */
  avg_rating?: number | null;
  review_count?: number | null;
  shop: ProductSeoShop;
}

const PRODUCT_SEO_SELECT = `
  id, name, title, description, price, original_price, compare_at_price,
  currency, image_url, images, is_available, short_code, updated_at, created_at,
  avg_rating, review_count,
  shops!inner (
    id, name, slug, category, location, logo_url, avg_rating, review_count,
    is_live, verification_status
  )
`;

const PRODUCT_SEO_SELECT_LEGACY = `
  id, name, title, description, price, original_price, compare_at_price,
  currency, image_url, images, is_available, short_code, updated_at, created_at,
  shops!inner (
    id, name, slug, category, location, logo_url, avg_rating, review_count,
    is_live, verification_status
  )
`;

type RawProductSeoRow = {
  id: string;
  name: string | null;
  title?: string | null;
  description?: string | null;
  price: number | null;
  original_price?: number | null;
  compare_at_price?: number | null;
  currency?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  is_available?: boolean | null;
  short_code?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  shops?:
    | (ProductSeoShop & { is_live?: boolean; verification_status?: string })
    | (ProductSeoShop & { is_live?: boolean; verification_status?: string })[]
    | null;
};

function normalizeShopJoin(
  shops: RawProductSeoRow["shops"],
): (ProductSeoShop & { is_live?: boolean; verification_status?: string }) | null {
  if (!shops) return null;
  if (Array.isArray(shops)) return shops[0] ?? null;
  return shops;
}

function mapProductSeoRow(row: RawProductSeoRow): ProductSeoRecord | null {
  if (!row.id || !row.name?.trim()) return null;
  const shopRow = normalizeShopJoin(row.shops);
  if (!shopRow?.id) return null;

  return {
    id: row.id,
    name: row.name.trim(),
    title: row.title ?? null,
    description: row.description ?? null,
    price: typeof row.price === "number" ? row.price : 0,
    original_price: row.original_price ?? null,
    compare_at_price: row.compare_at_price ?? null,
    currency: row.currency ?? "PKR",
    image_url: row.image_url ?? null,
    images: row.images ?? null,
    is_available: row.is_available !== false,
    short_code: row.short_code ?? null,
    updated_at: row.updated_at ?? null,
    created_at: row.created_at ?? null,
    avg_rating:
      typeof row.avg_rating === "number" ? row.avg_rating : Number(row.avg_rating) || null,
    review_count:
      typeof row.review_count === "number"
        ? row.review_count
        : Number(row.review_count) || null,
    shop: {
      id: shopRow.id,
      name: shopRow.name?.trim() || "Local store",
      slug: shopRow.slug ?? null,
      category: shopRow.category ?? null,
      location: shopRow.location ?? null,
      logo_url: shopRow.logo_url ?? null,
      avg_rating: shopRow.avg_rating ?? null,
      review_count: shopRow.review_count ?? null,
    },
  };
}

function createAnonSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

async function queryProductByReference(
  ref: { kind: "uuid" | "short_code"; value: string },
  supabase: SupabaseClient,
): Promise<ProductSeoRecord | null> {
  if (!ref.value) return null;

  const run = async (select: string) => {
    let query = supabase
      .from("products")
      .select(select)
      .eq("shops.is_live", true)
      .eq("shops.verification_status", "approved")
      .limit(1);

    query =
      ref.kind === "uuid"
        ? query.eq("id", ref.value)
        : query.eq("short_code", ref.value);

    return query.maybeSingle();
  };

  const primary = await run(PRODUCT_SEO_SELECT);
  if (
    primary.error &&
    /avg_rating|review_count|column .* does not exist/i.test(primary.error.message || "")
  ) {
    const legacy = await run(PRODUCT_SEO_SELECT_LEGACY);
    return legacy.data ? mapProductSeoRow(legacy.data as RawProductSeoRow) : null;
  }
  return primary.data ? mapProductSeoRow(primary.data as RawProductSeoRow) : null;
}

/** Primary image URL for OG / JSON-LD. */
export function getProductPrimaryImageUrl(
  product: Pick<ProductSeoRecord, "image_url" | "images">,
): string | null {
  const galleryFirst = Array.isArray(product.images)
    ? product.images.find((u) => typeof u === "string" && u.trim())
    : null;
  return product.image_url?.trim() || galleryFirst?.trim() || null;
}

export function getProductLastModified(product: ProductSeoRecord): Date {
  const raw = product.updated_at || product.created_at;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/** Fetch a live product by SEO slug (`/products/[slug]`). */
export async function fetchProductForSeoBySlug(
  slug: string,
): Promise<ProductSeoRecord | null> {
  try {
    const supabase = await createServerClient();
    const ref = resolveProductSlugReference(slug);
    return queryProductByReference(ref, supabase);
  } catch {
    const supabase = createAnonSupabase();
    if (!supabase) return null;
    try {
      const ref = resolveProductSlugReference(slug);
      return queryProductByReference(ref, supabase);
    } catch {
      return null;
    }
  }
}

/** Fetch a live product by short link code (`/p/[code]`). */
export async function fetchProductForSeoByCode(
  code: string,
): Promise<ProductSeoRecord | null> {
  try {
    const supabase = await createServerClient();
    const ref = resolveProductCodeReference(code);
    return queryProductByReference(ref, supabase);
  } catch {
    const supabase = createAnonSupabase();
    if (!supabase) return null;
    try {
      const ref = resolveProductCodeReference(code);
      return queryProductByReference(ref, supabase);
    } catch {
      return null;
    }
  }
}
