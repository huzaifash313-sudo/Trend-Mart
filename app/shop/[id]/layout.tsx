import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { generateShopMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ id: string }> };

async function loadShopMeta(idOrSlug: string) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!url || !key) return null;
    const supabase = createClient(url, key);
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );
    const q = supabase
      .from("shops")
      .select("id, name, slug, category, location, store_bio, logo_url, banner_url")
      .eq("is_live", true)
      .limit(1);
    const { data } = uuid
      ? await q.eq("id", idOrSlug).maybeSingle()
      : await q.eq("slug", idOrSlug).maybeSingle();
    return data as {
      id: string;
      name: string;
      slug?: string | null;
      category?: string;
      location?: string;
      store_bio?: string | null;
      logo_url?: string | null;
      banner_url?: string | null;
    } | null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const shop = await loadShopMeta(decodeURIComponent(id));
  if (!shop) {
    return {
      title: "Shop",
      description: "Browse this local store on TrendMart.",
    };
  }
  return generateShopMetadata({
    shopName: shop.name,
    shopId: shop.id,
    slug: shop.slug,
    category: shop.category,
    location: shop.location,
    description: shop.store_bio ?? undefined,
    logoUrl: shop.logo_url,
    bannerUrl: shop.banner_url,
  });
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
