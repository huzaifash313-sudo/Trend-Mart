/* -------------------------------------------------------------------------- */
/*  TrendMart — Dynamic SEO Metadata & OpenGraph Pipeline                      */
/* -------------------------------------------------------------------------- */

import type { Metadata } from "next";

const SITE_NAME = "TrendMart";
const SITE_DESCRIPTION =
  "Discover local shops across Pakistan. Browse products & deals, place orders via WhatsApp, and support small businesses near you.";
export const SITE_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://trend-marts.vercel.app";
const OG_IMAGE_DEFAULT = `${SITE_BASE_URL}/og-default.png`;
const TWITTER_HANDLE = "@trendmartpk";

const DEFAULT_KEYWORDS = [
  "TrendMart",
  "local shopping Pakistan",
  "WhatsApp ordering",
  "hyperlocal marketplace",
  "nearby shops",
  "deals near me",
  "online local store",
  "Pakistan e-commerce",
  "food delivery WhatsApp",
  "grocery near me",
];

export function absoluteUrl(path = "/"): string {
  const base = SITE_BASE_URL.replace(/\/$/, "");
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function generateRootMetadata(): Metadata {
  return {
    metadataBase: new URL(SITE_BASE_URL),
    title: {
      default: `${SITE_NAME} — Local Shopping, Instant WhatsApp Orders`,
      template: `%s · ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: DEFAULT_KEYWORDS,
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "shopping",
    alternates: { canonical: absoluteUrl("/") },
    openGraph: {
      title: `${SITE_NAME} — Local Shopping, Instant WhatsApp Orders`,
      description: SITE_DESCRIPTION,
      url: absoluteUrl("/"),
      siteName: SITE_NAME,
      locale: "en_PK",
      type: "website",
      images: [
        {
          url: OG_IMAGE_DEFAULT,
          width: 1200,
          height: 630,
          alt: SITE_NAME,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${SITE_NAME} — Local Shopping, Instant WhatsApp Orders`,
      description: SITE_DESCRIPTION,
      images: [OG_IMAGE_DEFAULT],
      site: TWITTER_HANDLE,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: SITE_NAME,
    },
    icons: {
      icon: [
        { url: "/favicon.png?v=10", type: "image/png" },
        { url: "/favicon-32.png?v=10", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16.png?v=10", sizes: "16x16", type: "image/png" },
        { url: "/icon-192.png?v=10", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png?v=10", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png?v=10", sizes: "180x180", type: "image/png" }],
    },
  };
}

interface ShopMetaParams {
  shopName: string;
  shopId: string;
  description?: string;
  category?: string;
  location?: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  slug?: string | null;
}

export function generateShopMetadata({
  shopName,
  shopId,
  description,
  category,
  location,
  logoUrl,
  bannerUrl,
  slug,
}: ShopMetaParams): Metadata {
  const title = `${shopName}`;
  const desc =
    description ||
    (category && location
      ? `${shopName} — ${category} in ${location}. Browse products & deals and order via WhatsApp on ${SITE_NAME}.`
      : `${shopName} on ${SITE_NAME}. Browse products, deals, and place orders via WhatsApp.`);
  const imageUrl = bannerUrl || logoUrl || OG_IMAGE_DEFAULT;
  const path = `/shop/${encodeURIComponent(slug?.trim() || shopId)}`;
  const url = absoluteUrl(path);

  return {
    title,
    description: desc,
    keywords: [
      shopName,
      category,
      location,
      `${shopName} WhatsApp`,
      `${shopName} deals`,
      ...DEFAULT_KEYWORDS,
    ].filter(Boolean) as string[],
    alternates: { canonical: url },
    openGraph: {
      title: `${shopName} — ${SITE_NAME}`,
      description: desc,
      url,
      siteName: SITE_NAME,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${shopName} on ${SITE_NAME}`,
        },
      ],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${shopName} — ${SITE_NAME}`,
      description: desc,
      images: [imageUrl],
      site: TWITTER_HANDLE,
    },
  };
}

export function generateHomepageMetadata(): Metadata {
  return {
    title: `Discover Local Shops & Deals in Pakistan`,
    description: SITE_DESCRIPTION,
    alternates: { canonical: absoluteUrl("/") },
    openGraph: {
      title: `${SITE_NAME} — Discover Local Shops in Pakistan`,
      description: SITE_DESCRIPTION,
      url: absoluteUrl("/"),
      siteName: SITE_NAME,
      images: [{ url: OG_IMAGE_DEFAULT, width: 1200, height: 630, alt: SITE_NAME }],
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

export function generateProductsMetadata(query?: string): Metadata {
  const title = query ? `Search: "${query}"` : "Products for you";
  const desc = query
    ? `Products matching "${query}" on ${SITE_NAME} — local shops, deals, and WhatsApp ordering across Pakistan.`
    : `Browse products from live local shops on ${SITE_NAME}. For You feed, best deals, and WhatsApp checkout.`;
  const path = query ? `/products?q=${encodeURIComponent(query)}` : "/products";
  return {
    title,
    description: desc,
    keywords: ["products", "For You", "local products Pakistan", ...DEFAULT_KEYWORDS],
    alternates: { canonical: absoluteUrl("/products") },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description: desc,
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      images: [{ url: OG_IMAGE_DEFAULT, width: 1200, height: 630 }],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${SITE_NAME}`,
      description: desc,
      images: [OG_IMAGE_DEFAULT],
    },
  };
}

export function generateDealsMetadata(query?: string, day?: string): Metadata {
  const title = query
    ? `Deals: "${query}"`
    : day
      ? `Deals on ${day}`
      : "Deals for you";
  const desc = query
    ? `Store deals matching "${query}" on ${SITE_NAME} — Monday deals, date offers, coupons, and free delivery.`
    : `Browse live store deals on ${SITE_NAME}. Filter by weekday or date — Monday deal, 14 August deal, and more.`;
  return {
    title,
    description: desc,
    keywords: [
      "deals",
      "Monday deal",
      "store offers",
      "local deals Pakistan",
      "coupons",
      ...DEFAULT_KEYWORDS,
    ],
    alternates: { canonical: absoluteUrl("/deals") },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description: desc,
      url: absoluteUrl("/deals"),
      siteName: SITE_NAME,
      images: [{ url: OG_IMAGE_DEFAULT, width: 1200, height: 630 }],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${SITE_NAME}`,
      description: desc,
      images: [OG_IMAGE_DEFAULT],
    },
  };
}

export function generateSearchMetadata(query?: string): Metadata {
  return generateProductsMetadata(query);
}

export function generateDashboardMetadata(): Metadata {
  return {
    title: `Dashboard`,
    description: "Manage your shop, products, orders, and analytics.",
    robots: { index: false, follow: false },
  };
}

export function generateAuthMetadata(): Metadata {
  return {
    title: `Sign In`,
    description: "Sign in to your TrendMart account.",
    robots: { index: false, follow: false },
  };
}

interface ProductStructuredData {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  imageUrl?: string | null;
  shopName: string;
  shopId: string;
  productId: string;
  /** Compact `/p/{code}` code — falls back to `productId` when unset. */
  shortCode?: string | null;
  isAvailable: boolean;
}

export function generateProductStructuredData({
  name,
  description,
  price,
  currency = "PKR",
  imageUrl,
  shopName,
  shopId,
  productId,
  shortCode,
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
        url: absoluteUrl(`/shop/${shopId}`),
      },
    },
    url: absoluteUrl(`/p/${shortCode || productId}`),
  };
}

interface ShopStructuredData {
  shopName: string;
  shopId: string;
  category?: string;
  location?: string;
  logoUrl?: string | null;
  description?: string;
}

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
    url: absoluteUrl(`/shop/${shopId}`),
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

/** Organization + WebSite + SearchAction for the whole app. */
export function generateSiteJsonLd(): Record<string, unknown>[] {
  const base = absoluteUrl("/");
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: base,
      logo: absoluteUrl("/icon-512.png"),
      sameAs: [],
      description: SITE_DESCRIPTION,
      areaServed: { "@type": "Country", name: "Pakistan" },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: base,
      description: SITE_DESCRIPTION,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${absoluteUrl("/products")}?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}
