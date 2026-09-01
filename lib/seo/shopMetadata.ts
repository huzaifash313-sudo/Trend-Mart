import type { Metadata } from "next";
import {
  fetchShopForSeoByReference,
  type ShopSeoRecord,
} from "@/lib/seo/fetchShopForSeo";
import { getShopSeoPath } from "@/lib/seo/shopSlug";
import { buildShopBannerAlt, buildShopLogoAlt } from "@/lib/seo/imageAlt";
import { absoluteUrl } from "@/lib/metadata";
import {
  buildShopKeywords,
  buildShopOgImageUrl,
  getIndexableRobotsMeta,
} from "@/utils/seo";

const SITE_NAME = "TrendsMart";
const TWITTER_HANDLE = "@trendsmartpk";

export function buildShopPageMetadata(shop: ShopSeoRecord): Metadata {
  const shopName = shop.name;
  const location = shop.location?.trim();
  const category = shop.category?.trim();
  const ratingSuffix =
    shop.avg_rating && shop.review_count && shop.review_count > 0
      ? ` ⭐ ${Math.min(5, Math.round(shop.avg_rating * 10) / 10)}/5`
      : "";

  const title = `${shopName}${ratingSuffix}`;
  const parts = [
    category && location
      ? `${shopName} — ${category} in ${location}.`
      : `${shopName} on ${SITE_NAME}.`,
  ];

  if (shop.store_bio?.trim()) {
    parts.push(shop.store_bio.trim().slice(0, 160));
  }
  if (typeof shop.product_count === "number" && shop.product_count > 0) {
    parts.push(`${shop.product_count}+ products available.`);
  }
  parts.push("Order via WhatsApp on TrendsMart.");
  const description = parts.join(" ");

  const canonicalPath = getShopSeoPath(shop);
  const canonicalUrl = absoluteUrl(canonicalPath);
  const ogImage = buildShopOgImageUrl({
    banner_url: shop.banner_url,
    logo_url: shop.logo_url,
  });
  const ogAlt = shop.banner_url
    ? buildShopBannerAlt(shopName, location)
    : buildShopLogoAlt(shopName, location);

  return {
    title,
    description,
    keywords: buildShopKeywords({
      name: shopName,
      category: category ?? "",
      location: location ?? "",
    }),
    alternates: { canonical: canonicalUrl },
    robots: getIndexableRobotsMeta(),
    openGraph: {
      title: `${shopName} — ${SITE_NAME}`,
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
          alt: ogAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${shopName} — ${SITE_NAME}`,
      description,
      images: [ogImage],
      site: TWITTER_HANDLE,
    },
  };
}

export function buildMissingShopMetadata(): Metadata {
  return {
    title: "Shop not found",
    description: "This store is unavailable or not listed on TrendsMart.",
    robots: { index: false, follow: false },
  };
}

export async function generateShopReferenceMetadata(
  idOrSlug: string,
): Promise<Metadata> {
  const shop = await fetchShopForSeoByReference(decodeURIComponent(idOrSlug));
  if (!shop) return buildMissingShopMetadata();
  return buildShopPageMetadata(shop);
}
