import {
  type ShopSeoRecord,
} from "@/lib/seo/fetchShopForSeo";
import { getShopSeoPath } from "@/lib/seo/shopSlug";
import { absoluteUrl } from "@/lib/metadata";
import { buildBreadcrumbJsonLd } from "@/utils/seo";

const SITE_NAME = "TrendsMart";

const CATEGORY_TO_SCHEMA_TYPE: Record<string, string> = {
  Food: "Restaurant",
  Grocery: "GroceryStore",
  Boutique: "ClothingStore",
  Electronics: "ElectronicsStore",
  Cosmetics: "HealthAndBeautyBusiness",
};

function buildLocalBusinessJsonLd(shop: ShopSeoRecord): Record<string, unknown> {
  const schemaType = shop.category
    ? CATEGORY_TO_SCHEMA_TYPE[shop.category] || "LocalBusiness"
    : "LocalBusiness";
  const url = absoluteUrl(getShopSeoPath(shop));

  const json: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: shop.name,
    description:
      shop.store_bio?.trim() ||
      `${shop.name} — ${shop.category || "Local Business"} in ${shop.location || "Pakistan"}. Shop online and order via WhatsApp on ${SITE_NAME}.`,
    url,
    image: shop.banner_url || shop.logo_url || undefined,
    ...(shop.whatsapp_number ? { telephone: shop.whatsapp_number } : {}),
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
    potentialAction: {
      "@type": "OrderAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: url,
        actionPlatform: [
          "http://schema.org/MobileWebPlatform",
          "http://schema.org/DesktopWebPlatform",
        ],
      },
      deliveryMethod: "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet",
    },
  };

  if (
    typeof shop.avg_rating === "number" &&
    shop.avg_rating > 0 &&
    typeof shop.review_count === "number" &&
    shop.review_count > 0
  ) {
    json.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Math.min(5, Math.round(shop.avg_rating * 10) / 10),
      reviewCount: shop.review_count,
    };
  }

  return json;
}

export default function ShopStructuredData({
  shop,
}: {
  shop: ShopSeoRecord;
}) {
  const shopUrl = absoluteUrl(getShopSeoPath(shop));
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: SITE_NAME, url: absoluteUrl("/") },
    ...(shop.category
      ? [
          {
            name: shop.category,
            url: absoluteUrl(
              `/products?category=${encodeURIComponent(shop.category)}`,
            ),
          },
        ]
      : []),
    { name: shop.name, url: shopUrl },
  ]);

  const localBusiness = buildLocalBusinessJsonLd(shop);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  );
}
