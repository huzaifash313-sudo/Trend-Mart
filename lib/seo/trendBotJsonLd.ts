import { absoluteUrl, SITE_NAME } from "@/lib/metadata";
import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";

/** Schema.org for TrendBot — helps AI crawlers & search discover the assistant. */
export function generateTrendBotJsonLd(): Record<string, unknown> {
  const assistantUrl = absoluteUrl("/assistant");

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: TREND_BOT_NAME,
    applicationCategory: "ShoppingApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "PKR",
    },
    description:
      `${TREND_BOT_NAME} is the free AI shopping assistant for ${SITE_NAME}. ` +
      "Search products with instant links, get app help, deals, shop recommendations, and business ideas from live marketplace data. Supports Urdu and English.",
    url: assistantUrl,
    provider: {
      "@type": "Organization",
      name: SITE_NAME,
      url: absoluteUrl("/"),
    },
    featureList: [
      "Product search with clickable links",
      "Shop finder and deals",
      "Order and delivery help",
      "Merchant business coach",
      "Urdu and English support",
    ],
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: absoluteUrl("/"),
    },
  };
}

/** WebPage schema for /assistant route. */
export function generateTrendBotPageJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${TREND_BOT_NAME} — AI Shopping Assistant`,
    description: `Talk to ${TREND_BOT_NAME} for product links, deals, and TrendsMart app help.`,
    url: absoluteUrl("/assistant"),
    isPartOf: { "@type": "WebSite", url: absoluteUrl("/") },
    mainEntity: generateTrendBotJsonLd(),
  };
}
