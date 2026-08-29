import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { generateShopMetadata, absoluteUrl } from "@/lib/metadata";
import { getShopPath } from "@/lib/shopSlug";

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
      .select(
        "id, name, slug, category, location, store_bio, logo_url, banner_url, latitude, longitude, whatsapp_number, business_hours",
      )
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
      latitude?: number | null;
      longitude?: number | null;
      whatsapp_number?: string | null;
      business_hours?: string | null;
    } | null;
  } catch {
    return null;
  }
}

/** Map TrendMart categories to Schema.org business types. */
const CATEGORY_TO_SCHEMA_TYPE: Record<string, string> = {
  Food: "Restaurant",
  Grocery: "GroceryStore",
  Boutique: "ClothingStore",
  Electronics: "ElectronicsStore",
  Cosmetics: "HealthAndBeautyBusiness",
};

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

/**
 * Server-rendered JSON-LD so Google/AI assistants see LocalBusiness structured
 * data in the raw HTML (not after hydration). Includes geo coordinates and
 * service radius — the strongest "burger near Gujranwala" local-ranking signal.
 */
function LocalBusinessJsonLd({
  shop,
}: {
  shop: NonNullable<Awaited<ReturnType<typeof loadShopMeta>>>;
}) {
  const schemaType = shop.category
    ? CATEGORY_TO_SCHEMA_TYPE[shop.category] || "LocalBusiness"
    : "LocalBusiness";
  const url = absoluteUrl(
    getShopPath({
      id: shop.id,
      name: shop.name,
      slug: shop.slug ?? null,
    }),
  );
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: shop.name,
    description:
      shop.store_bio ||
      `${shop.name} — ${shop.category || "Local Business"} in ${shop.location || "Pakistan"}. Shop online and order via WhatsApp.`,
    url,
    ...(shop.logo_url ? { image: shop.logo_url } : {}),
    ...(shop.whatsapp_number
      ? { telephone: shop.whatsapp_number }
      : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: shop.location || undefined,
      addressCountry: "PK",
    },
    ...(shop.latitude != null && shop.longitude != null
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: shop.latitude,
            longitude: shop.longitude,
          },
        }
      : {}),
    ...(shop.business_hours
      ? {
          openingHoursSpecification: [
            {
              "@type": "OpeningHoursSpecification",
              description: shop.business_hours,
            },
          ],
        }
      : {}),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shop = await loadShopMeta(decodeURIComponent(id));
  return (
    <>
      {shop ? <LocalBusinessJsonLd shop={shop} /> : null}
      {children}
    </>
  );
}
