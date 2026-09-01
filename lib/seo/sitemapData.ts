import { createClient } from "@supabase/supabase-js";
import { buildDealSeoSlug } from "@/lib/seo/dealSlug";
import { buildProductSeoSlug } from "@/lib/seo/productSlug";
import { getShopSeoPath } from "@/lib/seo/shopSlug";
import { slugifyShopName } from "@/lib/shopSlug";

/* -------------------------------------------------------------------------- */
/*  Dynamic sitemap data — live Supabase rows only (no static placeholders)    */
/* -------------------------------------------------------------------------- */

export interface SitemapShopEntry {
  id: string;
  name: string;
  slug: string | null;
  updated_at: string | null;
  created_at: string | null;
  /** Canonical path segment for `/shop/...` */
  seo_path: string;
}

export interface SitemapCategoryEntry {
  slug: string;
  name: string;
  count: number;
  updated_at: string | null;
}

export interface SitemapProductEntry {
  id: string;
  name: string;
  short_code: string | null;
  seo_slug: string;
  updated_at: string | null;
  created_at: string | null;
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key);
}

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function fetchSitemapShops(): Promise<SitemapShopEntry[]> {
  try {
    const supabase = createSupabase();
    if (!supabase) return [];

    const { data } = await supabase
      .from("shops")
      .select("id, name, slug, updated_at, created_at")
      .eq("is_live", true)
      .eq("verification_status", "approved")
      .order("updated_at", { ascending: false })
      .limit(5000);

    return (
      (data as {
        id: string;
        name: string;
        slug: string | null;
        updated_at: string | null;
        created_at: string | null;
      }[] | null)?.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug ?? null,
        updated_at: row.updated_at ?? null,
        created_at: row.created_at ?? null,
        seo_path: getShopSeoPath({
          id: row.id,
          name: row.name,
          slug: row.slug,
        }),
      })) ?? []
    );
  } catch {
    return [];
  }
}

/** Aggregate live shop categories; also merges platform sub-category slugs when present. */
export async function fetchSitemapCategories(): Promise<SitemapCategoryEntry[]> {
  try {
    const supabase = createSupabase();
    if (!supabase) return [];

    const categoryMap = new Map<
      string,
      { name: string; count: number; updated_at: Date | null }
    >();

    const { data: shops } = await supabase
      .from("shops")
      .select("category, updated_at")
      .eq("is_live", true)
      .eq("verification_status", "approved")
      .limit(5000);

    for (const row of (shops as { category: string; updated_at?: string }[]) ??
      []) {
      if (!row.category?.trim()) continue;
      const name = row.category.trim();
      const slug = slugifyShopName(name);
      const prev = categoryMap.get(slug);
      const rowDate = parseDate(row.updated_at);
      categoryMap.set(slug, {
        name,
        count: (prev?.count ?? 0) + 1,
        updated_at:
          prev?.updated_at && rowDate
            ? prev.updated_at > rowDate
              ? prev.updated_at
              : rowDate
            : prev?.updated_at ?? rowDate,
      });
    }

    const { data: subCats } = await supabase
      .from("sub_categories")
      .select("slug, name, updated_at")
      .limit(5000);

    for (const row of (subCats as {
      slug: string;
      name: string;
      updated_at?: string;
    }[]) ?? []) {
      if (!row.slug?.trim()) continue;
      const slug = row.slug.trim();
      const prev = categoryMap.get(slug);
      categoryMap.set(slug, {
        name: row.name?.trim() || slug.replace(/-/g, " "),
        count: prev?.count ?? 0,
        updated_at:
          parseDate(row.updated_at) ?? prev?.updated_at ?? null,
      });
    }

    return Array.from(categoryMap.entries()).map(([slug, meta]) => ({
      slug,
      name: meta.name,
      count: meta.count,
      updated_at: meta.updated_at?.toISOString() ?? null,
    }));
  } catch {
    return [];
  }
}

export async function fetchSitemapProducts(): Promise<SitemapProductEntry[]> {
  try {
    const supabase = createSupabase();
    if (!supabase) return [];

    const { data } = await supabase
      .from("products")
      .select(
        `
        id, name, short_code, updated_at, created_at,
        shops!inner ( is_live, verification_status )
      `,
      )
      .eq("is_available", true)
      .eq("shops.is_live", true)
      .eq("shops.verification_status", "approved")
      .order("updated_at", { ascending: false })
      .limit(5000);

    return (
      (data as {
        id: string;
        name: string;
        short_code: string | null;
        updated_at: string | null;
        created_at: string | null;
      }[] | null)?.map((row) => ({
        id: row.id,
        name: row.name,
        short_code: row.short_code,
        seo_slug: buildProductSeoSlug(row.name, row.short_code, row.id),
        updated_at: row.updated_at,
        created_at: row.created_at,
      })) ?? []
    );
  } catch {
    return [];
  }
}

export async function fetchActiveStoryShopIds(): Promise<string[]> {
  try {
    const supabase = createSupabase();
    if (!supabase) return [];
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("stories")
      .select("shop_id")
      .gt("expires_at", now)
      .limit(1000);
    if (!data) return [];
    return [
      ...new Set((data as { shop_id: string }[]).map((s) => s.shop_id)),
    ];
  } catch {
    return [];
  }
}

export function entryLastModified(
  updatedAt: string | null | undefined,
  createdAt: string | null | undefined,
  fallback: Date,
): Date {
  return (
    parseDate(updatedAt) ??
    parseDate(createdAt) ??
    fallback
  );
}

export interface SitemapDealEntry {
  id: string;
  title: string;
  seo_slug: string;
  updated_at: string | null;
  created_at: string | null;
}

export async function fetchSitemapDeals(): Promise<SitemapDealEntry[]> {
  try {
    const supabase = createSupabase();
    if (!supabase) return [];

    const { data } = await supabase
      .from("shop_deals")
      .select(
        `
        id, title, updated_at, created_at,
        shops!inner ( is_live, verification_status )
      `,
      )
      .eq("is_active", true)
      .eq("shops.is_live", true)
      .eq("shops.verification_status", "approved")
      .order("updated_at", { ascending: false })
      .limit(5000);

    return (
      (data as {
        id: string;
        title: string;
        updated_at: string | null;
        created_at: string | null;
      }[] | null)?.map((row) => ({
        id: row.id,
        title: row.title,
        seo_slug: buildDealSeoSlug(row.title, row.id),
        updated_at: row.updated_at,
        created_at: row.created_at,
      })) ?? []
    );
  } catch {
    return [];
  }
}
