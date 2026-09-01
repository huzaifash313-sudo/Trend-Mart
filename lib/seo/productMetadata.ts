import type { Metadata } from "next";
import {
  fetchProductForSeoByCode,
  fetchProductForSeoBySlug,
  getProductPrimaryImageUrl,
  type ProductSeoRecord,
} from "@/lib/seo/fetchProductForSeo";
import { buildProductImageAlt } from "@/lib/seo/imageAlt";
import { getProductSeoPath } from "@/lib/seo/productSlug";
import { absoluteUrl } from "@/lib/metadata";
import {
  buildProductKeywords,
  buildProductOgImageUrl,
  getIndexableRobotsMeta,
} from "@/utils/seo";

const SITE_NAME = "TrendsMart";
const TWITTER_HANDLE = "@trendsmartpk";

function formatPriceLine(product: ProductSeoRecord): string {
  const currency = product.currency?.trim() || "PKR";
  const amount = product.price.toLocaleString("en-PK");
  return currency === "PKR" ? `Rs. ${amount}` : `${amount} ${currency}`;
}

export function buildProductPageMetadata(product: ProductSeoRecord): Metadata {
  const shop = product.shop;
  const shopName = shop.name;
  const shopLocation = shop.location?.trim();
  const title = `${product.name} — ${shopName} on ${SITE_NAME}`;
  const priceLine = formatPriceLine(product);
  const description =
    product.description?.trim() ||
    [
      `${product.name} — ${priceLine}`,
      `Available at ${shopName}${shopLocation ? ` in ${shopLocation}` : ""}.`,
      product.is_available ? "In stock." : "Currently out of stock.",
      "Order via WhatsApp on TrendsMart.",
    ]
      .filter(Boolean)
      .join(" ");

  const canonicalPath = getProductSeoPath(
    product.name,
    product.short_code,
    product.id,
  );
  const canonicalUrl = absoluteUrl(canonicalPath);
  const ogImage = buildProductOgImageUrl(
    { image_url: getProductPrimaryImageUrl(product) },
    shop.logo_url ? { banner_url: shop.logo_url } : null,
  );
  const imageAlt = buildProductImageAlt(product.name, {
    location: shopLocation,
  });

  return {
    title: product.name,
    description,
    keywords: buildProductKeywords(
      { name: product.name, description: product.description ?? "" },
      {
        name: shop.name,
        category: shop.category ?? "",
        location: shop.location ?? "",
      },
    ),
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
    other: {
      "product:price:amount": String(product.price),
      "product:price:currency": product.currency || "PKR",
      "product:availability": product.is_available ? "in stock" : "out of stock",
      "og:image:width": "1200",
      "og:image:height": "630",
    },
  };
}

export function buildMissingProductMetadata(): Metadata {
  return {
    title: "Product not found",
    description: "This product is unavailable or no longer listed on TrendsMart.",
    robots: { index: false, follow: false },
  };
}

export async function generateProductSlugMetadata(
  slug: string,
): Promise<Metadata> {
  const product = await fetchProductForSeoBySlug(slug);
  if (!product) return buildMissingProductMetadata();
  return buildProductPageMetadata(product);
}

export async function generateProductCodeMetadata(
  code: string,
): Promise<Metadata> {
  const product = await fetchProductForSeoByCode(code);
  if (!product) return buildMissingProductMetadata();
  return buildProductPageMetadata(product);
}
