import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { absoluteUrl } from "@/lib/metadata";

type Props = { params: Promise<{ code: string }> };

const SITE_NAME = "TrendMart";

interface ProductMetaRow {
  id: string;
  name: string | null;
  title: string | null;
  description: string | null;
  price: number | null;
  original_price: number | null;
  compare_at_price: number | null;
  image_url: string | null;
  images: string[] | null;
  is_available: boolean | null;
  short_code: string | null;
  shops?: {
    id: string;
    name: string | null;
    slug?: string | null;
    category?: string | null;
    location?: string | null;
    logo_url?: string | null;
    avg_rating?: number | null;
    review_count?: number | null;
  } | null;
}

const PRODUCT_META_SELECT = `
  id, name, title, description, price, original_price, compare_at_price,
  image_url, images, is_available, short_code,
  shops!inner ( id, name, slug, category, location, logo_url, avg_rating, review_count )
`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadProductMeta(code: string): Promise<ProductMetaRow | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!url || !key) return null;
    const supabase = createClient(url, key);

    let query = supabase
      .from("products")
      .select(PRODUCT_META_SELECT)
      .eq("shops.is_live", true)
      .eq("shops.verification_status", "approved")
      .limit(1);

    if (UUID_RE.test(code)) query = query.eq("id", code);
    else query = query.eq("short_code", code);

    const { data } = await query.maybeSingle();
    return (data as ProductMetaRow | null) ?? null;
  } catch {
    return null;
  }
}

function productImageUrl(p: ProductMetaRow): string | null {
  const first = Array.isArray(p.images) ? p.images[0] : null;
  return p.image_url || first || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const product = await loadProductMeta(decodeURIComponent(code));
  const shopName = product?.shops?.name?.trim() || "Local store";
  const shopLocation = product?.shops?.location?.trim();

  if (!product?.name) {
    return {
      title: "Product",
      description: "Browse this product on TrendMart.",
      robots: { index: false, follow: false },
    };
  }

  const title = product.name;
  const desc =
    product.description?.trim() ||
    `${product.name} — available at ${shopName}${shopLocation ? ` in ${shopLocation}` : ""}. Order via WhatsApp on TrendMart.`;
  const image = productImageUrl(product);
  const url = absoluteUrl(
    `/p/${product.short_code?.trim() || product.id}`,
  );

  return {
    title,
    description: desc,
    keywords: [
      product.name,
      shopName,
      shopLocation,
      `${product.name} ${shopLocation}`,
      `${product.name} WhatsApp`,
      `${product.name} deals`,
      "local shopping Pakistan",
    ].filter(Boolean) as string[],
    alternates: { canonical: url },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description: desc,
      url,
      siteName: SITE_NAME,
      images: image ? [{ url: image, alt: product.name }] : [],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${SITE_NAME}`,
      description: desc,
      images: image ? [image] : [],
      site: "@trendmartpk",
    },
  };
}

/** Product structured data — lets Google show price + rating rich snippets. */
function ProductJsonLd({ product }: { product: ProductMetaRow }) {
  const shop = product.shops ?? null;
  const shopName = shop?.name?.trim() || "Local store";
  const url = absoluteUrl(`/p/${product.short_code?.trim() || product.id}`);
  const image = productImageUrl(product);
  const price = typeof product.price === "number" ? product.price : 0;
  const availability = product.is_available === false
    ? "https://schema.org/OutOfStock"
    : "https://schema.org/InStock";

  const offer: Record<string, unknown> = {
    "@type": "Offer",
    price,
    priceCurrency: "PKR",
    availability,
    url,
    seller: {
      "@type": "Organization",
      name: shopName,
      ...(shop?.id ? { url: absoluteUrl(`/shop/${shop.id}`) } : {}),
    },
  };

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description:
      product.description?.trim() ||
      `${product.name} — available at ${shopName} on ${SITE_NAME}.`,
    ...(image ? { image } : {}),
    offers: offer,
    url,
  };

  if (shop && typeof shop.avg_rating === "number" && shop.avg_rating > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Math.min(5, Math.round(shop.avg_rating * 10) / 10),
      reviewCount: typeof shop.review_count === "number" ? shop.review_count : 0,
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const product = await loadProductMeta(decodeURIComponent(code));
  return (
    <>
      {product?.name ? <ProductJsonLd product={product} /> : null}
      {children}
    </>
  );
}
