import type { Metadata } from "next";
import {
  fetchDealForSeoBySlug,
  getDealPrimaryImageUrl,
  type DealSeoRecord,
} from "@/lib/seo/fetchDealForSeo";
import { getDealSeoPath } from "@/lib/seo/dealSlug";
import { buildProductImageAlt } from "@/lib/seo/imageAlt";
import { absoluteUrl } from "@/lib/metadata";
import { buildProductOgImageUrl, getIndexableRobotsMeta } from "@/utils/seo";

const SITE_NAME = "TrendsMart";
const TWITTER_HANDLE = "@trendsmartpk";

function formatDealPrice(deal: DealSeoRecord): string {
  if (typeof deal.price !== "number" || deal.price <= 0) return "";
  return `Rs. ${deal.price.toLocaleString("en-PK")}`;
}

export function buildDealPageMetadata(deal: DealSeoRecord): Metadata {
  const shop = deal.shop;
  const shopName = shop.name;
  const shopLocation = shop.location?.trim();
  const priceLine = formatDealPrice(deal);
  const title = `${deal.title} — ${shopName} on ${SITE_NAME}`;
  const description =
    deal.description?.trim() ||
    [
      deal.title,
      priceLine,
      `Deal at ${shopName}${shopLocation ? ` in ${shopLocation}` : ""}.`,
      deal.badge_text?.trim(),
      "Order via WhatsApp on TrendsMart.",
    ]
      .filter(Boolean)
      .join(" ");

  const canonicalPath = getDealSeoPath(deal.title, deal.id);
  const canonicalUrl = absoluteUrl(canonicalPath);
  const imageUrl = getDealPrimaryImageUrl(deal);
  const ogImage = buildProductOgImageUrl(
    { image_url: imageUrl },
    shop.logo_url ? { banner_url: shop.logo_url } : null,
  );
  const imageAlt = buildProductImageAlt(deal.title, {
    location: shopLocation,
  });

  return {
    title: deal.title,
    description,
    keywords: [
      deal.title,
      shopName,
      shopLocation ?? "",
      "deals",
      "local deals Pakistan",
      deal.badge_text ?? "",
      `${shopName} deals`,
    ].filter(Boolean),
    alternates: { canonical: canonicalUrl },
    robots: getIndexableRobotsMeta(),
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: "en_PK",
      type: "website",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
      site: TWITTER_HANDLE,
    },
  };
}

export function buildMissingDealMetadata(): Metadata {
  return {
    title: "Deal not found",
    description: "This deal is unavailable or no longer active on TrendsMart.",
    robots: { index: false, follow: false },
  };
}

export async function generateDealSlugMetadata(slug: string): Promise<Metadata> {
  const deal = await fetchDealForSeoBySlug(slug);
  if (!deal) return buildMissingDealMetadata();
  return buildDealPageMetadata(deal);
}
