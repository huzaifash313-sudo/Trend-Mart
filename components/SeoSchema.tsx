import React from "react";

/* -------------------------------------------------------------------------- */
/*  TrendMart — JSON-LD Structured Data for SEO (Prompt 75)                    */
/*  Implements LocalBusiness and Product schemas for rich snippets.             */
/* -------------------------------------------------------------------------- */

interface LocalBusinessSchemaProps {
  shopName: string;
  shopDescription: string;
  shopUrl: string;
  shopLogoUrl?: string;
  shopPhone?: string;
  shopCategory?: string;
  shopLocation?: string;
}

interface ProductSchemaProps {
  productName: string;
  productDescription: string;
  productImageUrl?: string;
  productPrice: number;
  productCurrency?: string;
  productUrl: string;
  availability?: "InStock" | "OutOfStock";
  shopName?: string;
}

/* -------------------------------------------------------------------------- */
/*  LocalBusiness Schema                                                       */
/* -------------------------------------------------------------------------- */

export function LocalBusinessSchema({
  shopName,
  shopDescription,
  shopUrl,
  shopLogoUrl,
  shopPhone,
  shopCategory,
  shopLocation,
}: LocalBusinessSchemaProps) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: shopName,
    description: shopDescription,
    url: shopUrl,
  };

  if (shopLogoUrl) jsonLd.image = shopLogoUrl;
  if (shopPhone) jsonLd.telephone = shopPhone;
  if (shopLocation) {
    jsonLd.address = {
      "@type": "PostalAddress",
      addressLocality: shopLocation,
    };
  }
  if (shopCategory) {
    // Map trendmart categories to Schema.org types
    const categoryMap: Record<string, string> = {
      Food: "FoodEstablishment",
      Grocery: "GroceryStore",
      Boutique: "ClothingStore",
      Electronics: "ElectronicsStore",
      Cosmetics: "HealthAndBeautyBusiness",
    };
    jsonLd.additionalType = categoryMap[shopCategory] || "LocalBusiness";
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Product Schema                                                             */
/* -------------------------------------------------------------------------- */

export function ProductSchema({
  productName,
  productDescription,
  productImageUrl,
  productPrice,
  productCurrency = "PKR",
  productUrl,
  availability = "InStock",
  shopName,
}: ProductSchemaProps) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName,
    description: productDescription,
    url: productUrl,
    offers: {
      "@type": "Offer",
      price: productPrice,
      priceCurrency: productCurrency,
      availability: `https://schema.org/${availability}`,
      url: productUrl,
    },
  };

  if (productImageUrl) jsonLd.image = productImageUrl;
  if (shopName) {
    (jsonLd.offers as Record<string, unknown>).seller = {
      "@type": "LocalBusiness",
      name: shopName,
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Search Action Schema (Sitelinks Searchbox)                                  */
/* -------------------------------------------------------------------------- */

interface SearchActionSchemaProps {
  siteUrl: string;
}

export function SearchActionSchema({ siteUrl }: SearchActionSchemaProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  BreadcrumbList Schema                                                      */
/* -------------------------------------------------------------------------- */

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbListSchemaProps {
  items: BreadcrumbItem[];
}

export function BreadcrumbListSchema({ items }: BreadcrumbListSchemaProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}