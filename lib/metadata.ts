/* -------------------------------------------------------------------------- */
/*  TrendMart — Dynamic SEO Metadata & OpenGraph Pipeline                      */
/*                                                                             */
/*  Centralized utilities for generating:                                      */
/*   - Page-level OpenGraph (OG) meta tags                                     */
/*   - Twitter Card meta tags                                                  */
/*   - Structured data (JSON-LD) for rich search results                      */
/*   - Canonical URLs                                                         */
/*                                                                             */
/*  Import these helpers in layout.tsx, shop pages, and product cards.        */
/* -------------------------------------------------------------------------- */

import type { Metadata } from "next";

// ─── Constants ───────────────────────────────────────────────────────────────

const SITE_NAME = "TrendMart";
const SITE_DESCRIPTION =
  "Discover local shops across Pakistan. Browse products, place orders via WhatsApp, and support small businesses.";
const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://trendmart.vercel.app";
const OG_IMAGE_DEFAULT = `${BASE_URL}/og-default.png`;
const TWITTER_HANDLE = "@trendmartpk";

// ─── Shop-level Metadata ────────────────────────────────────────────────────

interface ShopMetaParams {
  shopName: string;
  shopId: string;
  description?: string;
  category?: string;
  location?: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
}

/**
 * Generate fully-typed Next.js Metadata for a shop storefront page.
 * Includes OG tags, Twitter Cards, and canonical URL.
 */
export function generateShopMetadata({
  shopName,
  shopId,
  description,
  category,
  location,
  logoUrl,
  bannerUrl,
}: ShopMetaParams): Metadata {
  const title = `${shopName} — ${SITE_NAME}`;
  const desc =
    description ||
    (category && location
      ? `${shopName} — ${category} in ${location}. Browse our products and order via WhatsApp on ${SITE_NAME}.`
      : `${shopName} on ${SITE_NAME}. Browse products and place orders via WhatsApp.`);
  const imageUrl = bannerUrl || logoUrl || OG_IMAGE_DEFAULT;
  const url = `${BASE_URL}/shop/${shopId}`;

  return {
    title,
    description: desc,
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
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${shopName} storefront on ${SITE_NAME}`,
        },
      ],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [imageUrl],
      site: TWITTER_HANDLE,
    },
    other: {
      "og:image:width": "1200",
      "og:image:height": "630",
    },
  };
}

// ─── Homepage Metadata ──────────────────────────────────────────────────────

export function generateHomepageMetadata(): Metadata {
  return {
    title: `${SITE_NAME} — Discover Local Shops in Pakistan`,
    description: SITE_DESCRIPTION,
    alternates: {
      canonical: BASE_URL,
    },
    openGraph: {
      title: `${SITE_NAME} — Discover Local Shops in Pakistan`,
      description: SITE_DESCRIPTION,
      url: BASE_URL,
      siteName: SITE_NAME,
      images: [
        {
          url: OG_IMAGE_DEFAULT,
          width: 1200,
          height: 630,
          alt: SITE_NAME,
        },
      ],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      images: [OG_IMAGE_DEFAULT],
      site: TWITTER_HANDLE,
    },
  };
}

// ─── Search Page Metadata ───────────────────────────────────────────────────

export function generateSearchMetadata(query?: string): Metadata {
  const title = query
    ? `Search: "${query}" — ${SITE_NAME}`
    : `Search Products & Shops — ${SITE_NAME}`;
  const desc = query
    ? `Search results for "${query}" on ${SITE_NAME}. Find local shops and products across Pakistan.`
    : `Search for shops and products across Pakistan on ${SITE_NAME}.`;

  return {
    title,
    description: desc,
    alternates: {
      canonical: `${BASE_URL}/search${query ? `?q=${encodeURIComponent(query)}` : ""}`,
    },
    openGraph: {
      title,
      description: desc,
      url: `${BASE_URL}/search`,
      siteName: SITE_NAME,
      images: [{ url: OG_IMAGE_DEFAULT, width: 1200, height: 630 }],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description: desc,
      images: [OG_IMAGE_DEFAULT],
    },
  };
}

// ─── Dashboard Metadata ─────────────────────────────────────────────────────

export function generateDashboardMetadata(): Metadata {
  return {
    title: `Dashboard — ${SITE_NAME}`,
    description: "Manage your shop, products, orders, and analytics.",
    robots: {
      index: false,
      follow: false,
    },
  };
}

// ─── Auth Page Metadata ─────────────────────────────────────────────────────

export function generateAuthMetadata(): Metadata {
  return {
    title: `Sign In — ${SITE_NAME}`,
    description: "Sign in to your TrendMart merchant account to manage your shop.",
    robots: {
      index: false,
      follow: false,
    },
  };
}

// ─── Product Structured Data (JSON-LD) ─────────────────────────────────────

interface ProductStructuredData {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  imageUrl?: string | null;
  shopName: string;
  shopId: string;
  productId: string;
  isAvailable: boolean;
}

/**
 * Generate JSON-LD structured data for a product.
 * Renders inside a <script type="application/ld+json"> tag.
 */
export function generateProductStructuredData({
  name,
  description,
  price,
  currency = "PKR",
  imageUrl,
  shopName,
  shopId,
  productId,
  isAvailable,
}: ProductStructuredData): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: description || `${name} — Available at ${shopName} on ${SITE_NAME}.`,
    image: imageUrl || OG_IMAGE_DEFAULT,
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
    url: `${BASE_URL}/shop/${shopId}#product-${productId}`,
  };
}

// ─── Shop Structured Data (JSON-LD) ─────────────────────────────────────────

interface ShopStructuredData {
  shopName: string;
  shopId: string;
  category?: string;
  location?: string;
  logoUrl?: string | null;
  description?: string;
}

/**
 * Generate JSON-LD structured data for a shop (LocalBusiness).
 */
export function generateShopStructuredData({
  shopName,
  shopId,
  category,
  location,
  logoUrl,
  description,
}: ShopStructuredData): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: shopName,
    description:
      description ||
      `${shopName} — ${category || "Local Business"} in ${location || "Pakistan"}. Shop online and order via WhatsApp.`,
    image: logoUrl || OG_IMAGE_DEFAULT,
    url: `${BASE_URL}/shop/${shopId}`,
    ...(location
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: location,
            addressCountry: "PK",
          },
        }
      : {}),
  };
}

// ─── Breadcrumb Structured Data (JSON-LD) ───────────────────────────────────

interface BreadcrumbItem {
  name: string;
  url: string;
}

export function generateBreadcrumbStructuredData(
  items: BreadcrumbItem[],
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