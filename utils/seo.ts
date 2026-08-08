/* -------------------------------------------------------------------------- */
/*  TrendMart — Dynamic SEO & Open Graph Social Sharing Architecture           */
/*                                                                             */
/*  Complementary to lib/metadata.ts — this module focuses on:                 */
/*   - Individual product view SEO metadata                                   */
/*   - Category page metadata                                                 */
/*   - Social media preview card generation (WhatsApp, Facebook, Instagram)   */
/*   - Dynamic OG image URL construction                                      */
/*   - Twitter/X card meta generation                                          */
/*   - Meta keyword extraction from product data                              */
/*   - Canonical URL generation for all page types                            */
/* -------------------------------------------------------------------------- */

import type { Metadata } from "next";
import type { Product, Shop } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const SITE_NAME = "TrendMart";
const SITE_DESCRIPTION =
  "Discover local shops across Pakistan. Browse products, place orders via WhatsApp, and support small businesses.";
const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://trendmart.vercel.app";
const OG_IMAGE_DEFAULT = `${BASE_URL}/og-default.png`;
const TWITTER_HANDLE = "@trendmartpk";

/* -------------------------------------------------------------------------- */
/*  OG Image URL Builders                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Build a dynamic Open Graph image URL for a product.
 * Uses an external OG image generation service or falls back to the product image.
 *
 * Priority:
 * 1. Product image (resized to 1200x630 via dynamic image proxy)
 * 2. Shop banner
 * 3. Default OG image
 */
export function buildProductOgImageUrl(
  product: Pick<Product, "image_url">,
  shop?: Pick<Shop, "banner_url"> | null,
): string {
  if (product.image_url) {
    // If using an image proxy/CDN, transform to 1200x630
    // For Supabase storage URLs, we can use the imgproxy/transform params
    if (product.image_url.includes("supabase.co/storage")) {
      return `${product.image_url}?width=1200&height=630&resize=cover`;
    }
    return product.image_url;
  }

  if (shop?.banner_url) {
    if (shop.banner_url.includes("supabase.co/storage")) {
      return `${shop.banner_url}?width=1200&height=630&resize=cover`;
    }
    return shop.banner_url;
  }

  return OG_IMAGE_DEFAULT;
}

/**
 * Build a dynamic Open Graph image URL for a shop.
 */
export function buildShopOgImageUrl(shop: Pick<Shop, "banner_url" | "logo_url">): string {
  const imageUrl = shop.banner_url || shop.logo_url;
  if (!imageUrl) return OG_IMAGE_DEFAULT;

  if (imageUrl.includes("supabase.co/storage")) {
    return `${imageUrl}?width=1200&height=630&resize=cover`;
  }
  return imageUrl;
}

/* -------------------------------------------------------------------------- */
/*  Product Page Metadata                                                     */
/* -------------------------------------------------------------------------- */

interface ProductMetaParams {
  product: Pick<Product, "id" | "name" | "description" | "price" | "currency" | "image_url" | "is_available">;
  shop: Pick<Shop, "id" | "name" | "category" | "location" | "logo_url" | "banner_url">;
}

/**
 * Generate fully-typed Next.js Metadata for an individual product page.
 *
 * Features:
 * - Product name + shop name in title
 * - Price and availability in description
 * - Rich OG image from product or shop
 * - Twitter Card summary_large_image
 * - Category-based keywords
 * - Canonical URL
 */
export function generateProductMetadata({
  product,
  shop,
}: ProductMetaParams): Metadata {
  const title = `${product.name} — ${shop.name} on ${SITE_NAME}`;
  const priceDisplay = product.currency
    ? `${product.price} ${product.currency}`
    : `Rs. ${product.price.toLocaleString()}`;
  const desc = [
    `${product.name} — ${priceDisplay}`,
    product.description?.slice(0, 200),
    `Available at ${shop.name} in ${shop.location || "Pakistan"}.`,
    product.is_available ? "In stock." : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ogImage = buildProductOgImageUrl(product, shop);
  const canonicalUrl = `${BASE_URL}/shop/${shop.id}/product/${product.id}`;

  return {
    title,
    description: desc,
    keywords: buildProductKeywords(product, shop),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description: desc,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: product.name,
        },
      ],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [ogImage],
      site: TWITTER_HANDLE,
    },
    other: {
      "product:price:amount": String(product.price),
      "product:price:currency": product.currency || "PKR",
      "product:availability": product.is_available ? "in stock" : "out of stock",
      "og:image:width": "1200",
      "og:image:height": "630",
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Category Page Metadata                                                    */
/* -------------------------------------------------------------------------- */

interface CategoryMetaParams {
  category: string;
  categorySlug: string;
  productCount?: number;
  description?: string;
}

/**
 * Generate metadata for category listing pages.
 */
export function generateCategoryMetadata({
  category,
  categorySlug,
  productCount,
  description,
}: CategoryMetaParams): Metadata {
  const title = `${category} Products & Shops — ${SITE_NAME}`;
  const desc =
    description ||
    `Browse ${category.toLowerCase()} products from local shops across Pakistan. ${
      productCount ? `${productCount}+ products available. ` : ""
    }Order directly via WhatsApp.`;

  const url = `${BASE_URL}/category/${categorySlug}`;

  return {
    title,
    description: desc,
    keywords: [
      category,
      `${category.toLowerCase()} products`,
      `${category.toLowerCase()} shops`,
      "online shopping Pakistan",
      "local stores",
      "WhatsApp order",
    ],
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description: desc,
      url,
      siteName: SITE_NAME,
      images: [{ url: OG_IMAGE_DEFAULT, width: 1200, height: 630 }],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [OG_IMAGE_DEFAULT],
      site: TWITTER_HANDLE,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Shop Storefront Metadata (Extended)                                        */
/* -------------------------------------------------------------------------- */

interface ShopMetaExtendedParams {
  shop: Pick<
    Shop,
    "id" | "name" | "category" | "location" | "logo_url" | "banner_url" | "store_bio"
  >;
  productCount?: number;
  averageRating?: number;
  reviewCount?: number;
}

/**
 * Generate enhanced metadata for a shop storefront including
 * social proof signals (ratings, product count).
 */
export function generateShopMetadataExtended({
  shop,
  productCount,
  averageRating,
  reviewCount,
}: ShopMetaExtendedParams): Metadata {
  const ratingSuffix =
    averageRating && reviewCount
      ? ` ⭐ ${averageRating}/5 (${reviewCount} reviews)`
      : "";

  const title = `${shop.name}${ratingSuffix} — ${SITE_NAME}`;

  const parts = [
    `${shop.name} — ${shop.category || "Local Shop"} in ${shop.location || "Pakistan"}.`,
  ];

  if (shop.store_bio) {
    parts.push(shop.store_bio.slice(0, 160));
  }

  if (productCount !== undefined) {
    parts.push(`${productCount} products available.`);
  }

  parts.push("Order via WhatsApp on TrendMart.");
  const desc = parts.join(" ");

  const ogImage = buildShopOgImageUrl(shop);
  const url = `${BASE_URL}/shop/${shop.id}`;

  return {
    title,
    description: desc,
    keywords: buildShopKeywords(shop),
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description: desc,
      url,
      siteName: SITE_NAME,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${shop.name} storefront on ${SITE_NAME}`,
        },
      ],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [ogImage],
      site: TWITTER_HANDLE,
    },
    other: {
      "og:image:width": "1200",
      "og:image:height": "630",
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  WhatsApp Sharing Card                                                     */
/* -------------------------------------------------------------------------- */

interface WhatsAppShareMeta {
  title: string;
  description: string;
  imageUrl?: string | null;
  url: string;
}

/**
 * Build the OG meta tags object specifically optimized for WhatsApp sharing.
 * WhatsApp uses the Open Graph protocol for link previews.
 *
 * WhatsApp-specific requirements:
 * - Image must be at least 300x200 (ideally 1200x630)
 * - Max title length: ~65 characters (before truncation)
 * - Max description length: ~300 characters
 * - HTTPS URLs only
 */
export function buildWhatsAppShareMeta({
  title,
  description,
  imageUrl,
  url,
}: WhatsAppShareMeta): Record<string, string> {
  return {
    "og:title": title.slice(0, 65),
    "og:description": description.slice(0, 300),
    "og:image": imageUrl || OG_IMAGE_DEFAULT,
    "og:url": url,
    "og:type": "website",
    "og:site_name": SITE_NAME,
    "og:image:width": "1200",
    "og:image:height": "630",
    // WhatsApp also respects twitter:card as fallback
    "twitter:card": "summary_large_image",
  };
}

/**
 * Build WhatsApp share meta for a product.
 */
export function buildProductWhatsAppMeta(
  product: Pick<Product, "id" | "name" | "description" | "price" | "currency" | "image_url">,
  shop: Pick<Shop, "id" | "name">,
): Record<string, string> {
  const priceDisplay = product.currency
    ? `${product.price} ${product.currency}`
    : `Rs. ${product.price.toLocaleString()}`;

  return buildWhatsAppShareMeta({
    title: `${product.name} — ${shop.name}`,
    description: `${priceDisplay} | ${product.description?.slice(0, 200) || "Order via WhatsApp"}`,
    imageUrl: product.image_url,
    url: `${BASE_URL}/shop/${shop.id}/product/${product.id}`,
  });
}

/**
 * Build WhatsApp share meta for a shop.
 */
export function buildShopWhatsAppMeta(
  shop: Pick<Shop, "id" | "name" | "category" | "location" | "logo_url" | "banner_url">,
): Record<string, string> {
  return buildWhatsAppShareMeta({
    title: shop.name,
    description: `${shop.category || "Local Shop"} in ${shop.location || "Pakistan"} | Browse products & order via WhatsApp`,
    imageUrl: shop.banner_url || shop.logo_url,
    url: `${BASE_URL}/shop/${shop.id}`,
  });
}

/* -------------------------------------------------------------------------- */
/*  Facebook / Instagram Sharing (OG Tags)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generate Facebook-specific OG meta tag overrides.
 * Facebook supports Open Graph protocol natively.
 * Key difference from WhatsApp: Facebook reads og:description
 * more aggressively for longer text.
 */
export function buildFacebookShareMeta(params: {
  title: string;
  description: string;
  imageUrl?: string | null;
  url: string;
  type?: "website" | "product" | "article";
}): Record<string, string> {
  return {
    "og:title": params.title,
    "og:description": params.description.slice(0, 300),
    "og:image": params.imageUrl || OG_IMAGE_DEFAULT,
    "og:url": params.url,
    "og:type": params.type || "website",
    "og:site_name": SITE_NAME,
    "og:locale": "en_PK",
    "fb:app_id": process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "",
  };
}

/* -------------------------------------------------------------------------- */
/*  Instagram Sharing Notes                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Instagram pulls the same OG tags as Facebook since both are Meta platforms.
 * However, Instagram does NOT show link previews in feed posts — only in
 * Stories (via link stickers) and bio links. For those, the same OG tags apply.
 *
 * This function returns the recommended OG meta object for Instagram link stickers.
 */
export function buildInstagramLinkStickerMeta(params: {
  title: string;
  description: string;
  imageUrl?: string | null;
  url: string;
}): Record<string, string> {
  // Instagram link stickers use the same OG protocol
  return buildFacebookShareMeta({ ...params, type: "website" });
}

/* -------------------------------------------------------------------------- */
/*  Keyword Extraction Helpers                                                */
/* -------------------------------------------------------------------------- */

/**
 * Build a comma-separated keyword string for a product page.
 */
export function buildProductKeywords(
  product: Pick<Product, "name" | "description">,
  shop?: Pick<Shop, "name" | "category" | "location"> | null,
): string[] {
  const keywords: string[] = [];

  // Product name tokens
  keywords.push(...product.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2));

  // Shop context
  if (shop?.name) {
    keywords.push(shop.name.toLowerCase());
  }
  if (shop?.category) {
    keywords.push(shop.category.toLowerCase());
    keywords.push(...shop.category.toLowerCase().split(/[&/\s]+/));
  }
  if (shop?.location) {
    keywords.push(shop.location.toLowerCase());
    keywords.push("shopping in " + shop.location.toLowerCase());
  }

  // Platform keywords
  keywords.push("TrendMart", "online shopping", "WhatsApp order", "local shops Pakistan");

  // Deduplicate
  return [...new Set(keywords)];
}

/**
 * Build keyword array for a shop page.
 */
export function buildShopKeywords(
  shop: Pick<Shop, "name" | "category" | "location">,
): string[] {
  const keywords: string[] = [
    shop.name.toLowerCase(),
    "TrendMart",
    "online shopping Pakistan",
    "WhatsApp order",
    "local store",
  ];

  if (shop.category) {
    keywords.push(shop.category.toLowerCase());
    keywords.push(...shop.category.toLowerCase().split(/[&/\s]+/));
  }
  if (shop.location) {
    keywords.push(shop.location.toLowerCase());
  }

  return [...new Set(keywords)];
}

/* -------------------------------------------------------------------------- */
/*  Canonical URL Helpers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generate the canonical URL for any page type.
 */
export function buildCanonicalUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_URL}${cleanPath}`;
}

/**
 * Generate canonical URL for a product.
 */
export function buildProductCanonicalUrl(shopId: string, productId: string): string {
  return buildCanonicalUrl(`/shop/${shopId}/product/${productId}`);
}

/**
 * Generate canonical URL for a shop.
 */
export function buildShopCanonicalUrl(shopId: string): string {
  return buildCanonicalUrl(`/shop/${shopId}`);
}

/**
 * Generate canonical URL for a category.
 */
export function buildCategoryCanonicalUrl(categorySlug: string): string {
  return buildCanonicalUrl(`/category/${categorySlug}`);
}

/* -------------------------------------------------------------------------- */
/*  Robots & Indexing Controls                                                */
/* -------------------------------------------------------------------------- */

/**
 * Get robots meta for a page that should be indexed.
 */
export function getIndexableRobotsMeta(): Metadata["robots"] {
  return {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  };
}

/**
 * Get robots meta for a page that should NOT be indexed (dashboards, auth, etc.).
 */
export function getNoIndexRobotsMeta(): Metadata["robots"] {
  return {
    index: false,
    follow: false,
  };
}

/* -------------------------------------------------------------------------- */
/*  JSON-LD Structured Data Builders                                          */
/* -------------------------------------------------------------------------- */

interface StructuredProductParams {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  imageUrl?: string | null;
  shopName: string;
  shopId: string;
  productId: string;
  isAvailable: boolean;
  category?: string;
}

export function buildProductJsonLd({
  name,
  description,
  price,
  currency = "PKR",
  imageUrl,
  shopName,
  shopId,
  productId,
  isAvailable,
  category,
}: StructuredProductParams): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: description || `${name} — Available at ${shopName} on ${SITE_NAME}.`,
    image: imageUrl || OG_IMAGE_DEFAULT,
    ...(category ? { category } : {}),
    offers: {
      "@type": "Offer",
      price,
      priceCurrency: currency,
      availability: isAvailable
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: shopName,
        url: `${BASE_URL}/shop/${shopId}`,
      },
    },
    url: buildProductCanonicalUrl(shopId, productId),
  };
}

/**
 * Build JSON-LD breadcrumb list for page navigation.
 */
export function buildBreadcrumbJsonLd(
  items: Array<{ name: string; url: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Build JSON-LD for a LocalBusiness (shop).
 */
export function buildLocalBusinessJsonLd(params: {
  shopName: string;
  shopId: string;
  category?: string;
  location?: string;
  logoUrl?: string | null;
  description?: string;
  ratingValue?: number;
  reviewCount?: number;
}): Record<string, unknown> {
  const json: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: params.shopName,
    description:
      params.description ||
      `${params.shopName} — ${params.category || "Local Business"} in ${params.location || "Pakistan"}. Shop online and order via WhatsApp on ${SITE_NAME}.`,
    image: params.logoUrl || OG_IMAGE_DEFAULT,
    url: buildShopCanonicalUrl(params.shopId),
  };

  if (params.location) {
    json.address = {
      "@type": "PostalAddress",
      addressLocality: params.location,
      addressCountry: "PK",
    };
  }

  if (params.ratingValue && params.reviewCount) {
    json.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: params.ratingValue,
      reviewCount: params.reviewCount,
    };
  }

  return json;
}