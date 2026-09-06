/* -------------------------------------------------------------------------- */
/*  Trends Mart — Dynamic SEO Metadata & OpenGraph Pipeline                     */
/* -------------------------------------------------------------------------- */

import type { Metadata } from "next";
import { getPublicAppUrl, getPublicAppHostname } from "@/lib/appUrl";

export const SITE_NAME = "Trends Mart";
export const SITE_DOMAIN = "trendsmart.pk";

/** Alternate spellings indexed naturally for search discovery. */
export const BRAND_ALT_NAMES = [
  "Trend Mart",
  "TrendsMart",
  "trendsmart",
  "Trend Smart",
] as const;

const SITE_DESCRIPTION =
  "Trends Mart (trendsmart.pk) — discover local shops across Pakistan. Browse products & deals in Gujranwala, Lahore & beyond. Order via WhatsApp and support small businesses near you.";

export const SITE_BASE_URL = getPublicAppUrl();
const OG_IMAGE_DEFAULT = `${SITE_BASE_URL}/og-default.png`;
export const TWITTER_HANDLE = "@trendsmartpk";

const DEFAULT_KEYWORDS = [
  SITE_NAME,
  ...BRAND_ALT_NAMES,
  SITE_DOMAIN,
  "trendsmart.pk",
  "local shopping Pakistan",
  "local shopping Gujranwala",
  "WhatsApp ordering",
  "hyperlocal marketplace",
  "nearby shops",
  "deals near me",
  "online local store",
  "Pakistan e-commerce",
  "food delivery WhatsApp",
  "grocery near me",
  "Gujranwala marketplace",
];

/** Platform HQ — Gujranwala, Pakistan (primary service region). */
const PLATFORM_LOCALITY = {
  city: "Gujranwala",
  region: "Punjab",
  country: "PK",
  latitude: 32.1877,
  longitude: 74.1945,
} as const;

function platformSocialLinks(): string[] {
  const links: string[] = [];
  const push = (url: string | undefined) => {
    const t = url?.trim();
    if (t) links.push(t);
  };
  push(process.env.NEXT_PUBLIC_FACEBOOK_URL);
  push(process.env.NEXT_PUBLIC_INSTAGRAM_URL);
  push(process.env.NEXT_PUBLIC_TWITTER_URL);
  if (links.length === 0) {
    links.push(
      "https://www.facebook.com/trendsmartpk",
      "https://www.instagram.com/trendsmartpk",
      "https://twitter.com/trendsmartpk",
    );
  }
  return links;
}

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
        { url: "/favicon.png?v=16", type: "image/png" },
        { url: "/favicon-32.png?v=16", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16.png?v=16", sizes: "16x16", type: "image/png" },
        { url: "/icon-192.png?v=16", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png?v=16", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png?v=16", sizes: "180x180", type: "image/png" }],
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
    keywords: DEFAULT_KEYWORDS,
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
      title: `${SITE_NAME} — Local Shopping via WhatsApp`,
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
    description: `Sign in to your ${SITE_NAME} account on ${SITE_DOMAIN}.`,
    robots: { index: false, follow: false },
  };
}

export function generateAdminMetadata(): Metadata {
  return {
    title: `Admin`,
    description: `${SITE_NAME} super-admin console.`,
    robots: { index: false, follow: false },
  };
}

export function generateNoIndexMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    robots: { index: false, follow: false },
  };
}

export function generateFaqMetadata(): Metadata {
  const title = "FAQ & New Merchant Guide";
  const desc = `Frequently asked questions about ${SITE_NAME} — browsing shops, WhatsApp ordering, delivery, refunds, and how to register your store on trendsmart.pk.`;
  return {
    title,
    description: desc,
    keywords: ["FAQ", "help", "merchant guide", ...DEFAULT_KEYWORDS],
    alternates: { canonical: absoluteUrl("/faq") },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description: desc,
      url: absoluteUrl("/faq"),
      siteName: SITE_NAME,
      images: [{ url: OG_IMAGE_DEFAULT, width: 1200, height: 630, alt: SITE_NAME }],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${SITE_NAME}`,
      description: desc,
      images: [OG_IMAGE_DEFAULT],
      site: TWITTER_HANDLE,
    },
  };
}

export function generateSupportMetadata(): Metadata {
  const title = "Contact Support";
  const desc = `Get help from the ${SITE_NAME} team — order issues, merchant support, account questions, and platform inquiries at trendsmart.pk.`;
  return {
    title,
    description: desc,
    keywords: ["support", "contact", "help desk", ...DEFAULT_KEYWORDS],
    alternates: { canonical: absoluteUrl("/support") },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description: desc,
      url: absoluteUrl("/support"),
      siteName: SITE_NAME,
      images: [{ url: OG_IMAGE_DEFAULT, width: 1200, height: 630, alt: SITE_NAME }],
      locale: "en_PK",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${SITE_NAME}`,
      description: desc,
      images: [OG_IMAGE_DEFAULT],
      site: TWITTER_HANDLE,
    },
  };
}

export function generateLegalMetadata(
  pageTitle: string,
  description: string,
  path: string,
): Metadata {
  return {
    title: pageTitle,
    description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: {
      title: `${pageTitle} — ${SITE_NAME}`,
      description,
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      locale: "en_PK",
      type: "website",
    },
    robots: { index: true, follow: true },
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

/** Organization + LocalBusiness + WebSite JSON-LD for the whole app. */
export function generateSiteJsonLd(): Record<string, unknown>[] {
  const base = absoluteUrl("/");
  const sameAs = platformSocialLinks();
  const supportEmail = `support@${getPublicAppHostname().replace(/^www\./, "")}`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${base}#organization`,
      name: SITE_NAME,
      alternateName: [...BRAND_ALT_NAMES],
      url: base,
      logo: absoluteUrl("/icon-512.png"),
      image: OG_IMAGE_DEFAULT,
      sameAs,
      description: SITE_DESCRIPTION,
      email: supportEmail,
      areaServed: [
        { "@type": "Country", name: "Pakistan" },
        { "@type": "City", name: PLATFORM_LOCALITY.city },
      ],
      address: {
        "@type": "PostalAddress",
        addressLocality: PLATFORM_LOCALITY.city,
        addressRegion: PLATFORM_LOCALITY.region,
        addressCountry: PLATFORM_LOCALITY.country,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "@id": `${base}#localbusiness`,
      name: SITE_NAME,
      alternateName: [...BRAND_ALT_NAMES],
      url: base,
      logo: absoluteUrl("/icon-512.png"),
      image: OG_IMAGE_DEFAULT,
      description: SITE_DESCRIPTION,
      email: supportEmail,
      priceRange: "$$",
      currenciesAccepted: "PKR",
      paymentAccepted: "Cash, Bank Transfer",
      address: {
        "@type": "PostalAddress",
        addressLocality: PLATFORM_LOCALITY.city,
        addressRegion: PLATFORM_LOCALITY.region,
        addressCountry: PLATFORM_LOCALITY.country,
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: PLATFORM_LOCALITY.latitude,
        longitude: PLATFORM_LOCALITY.longitude,
      },
      areaServed: [
        { "@type": "City", name: "Gujranwala" },
        { "@type": "City", name: "Lahore" },
        { "@type": "City", name: "Islamabad" },
        { "@type": "City", name: "Karachi" },
        { "@type": "Country", name: "Pakistan" },
      ],
      sameAs,
      parentOrganization: { "@id": `${base}#organization` },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${base}#website`,
      name: SITE_NAME,
      alternateName: [...BRAND_ALT_NAMES],
      url: base,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${base}#organization` },
      inLanguage: "en-PK",
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

/** FAQPage structured data for the /faq route. */
export function generateFaqJsonLd(
  items: { question: string; answer: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
