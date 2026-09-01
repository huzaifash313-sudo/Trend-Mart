import type { Metadata } from "next";
import { absoluteUrl, generateDealsMetadata, generateProductsMetadata } from "@/lib/metadata";

const SITE_NAME = "TrendsMart";

/** Dynamic metadata for `/products` listing (query + category filters). */
export function buildProductsListingMetadata(params: {
  q?: string;
  category?: string;
}): Metadata {
  const q = params.q?.trim();
  const category = params.category?.trim();
  const base = generateProductsMetadata(q);

  const pathParams = new URLSearchParams();
  if (q) pathParams.set("q", q);
  if (category && category !== "All") pathParams.set("category", category);
  const path = pathParams.toString()
    ? `/products?${pathParams.toString()}`
    : "/products";

  if (!category || category === "All") {
    return {
      ...base,
      alternates: { canonical: absoluteUrl(path) },
      openGraph: {
        ...base.openGraph,
        url: absoluteUrl(path),
      },
    };
  }

  const title = q
    ? `${category} — "${q}"`
    : `${category} products`;
  const desc = q
    ? `${category} products matching "${q}" on ${SITE_NAME} — order via WhatsApp from local shops.`
    : `Browse ${category.toLowerCase()} products from verified local shops on ${SITE_NAME}.`;

  return {
    ...base,
    title,
    description: desc,
    keywords: [
      category,
      `${category.toLowerCase()} products`,
      `${category.toLowerCase()} shops`,
      ...(Array.isArray(base.keywords) ? base.keywords : []),
    ],
    alternates: { canonical: absoluteUrl(path) },
    openGraph: {
      ...base.openGraph,
      title: `${title} · ${SITE_NAME}`,
      description: desc,
      url: absoluteUrl(path),
    },
    twitter: {
      ...base.twitter,
      title: `${title} · ${SITE_NAME}`,
      description: desc,
    },
  };
}

/** Dynamic metadata for `/deals` listing. */
export function buildDealsListingMetadata(params: {
  q?: string;
  category?: string;
  filter?: string;
  day?: string;
}): Metadata {
  const q = params.q?.trim();
  const category = params.category?.trim();
  const day = params.day?.trim();
  const base = generateDealsMetadata(q, day);

  const pathParams = new URLSearchParams();
  if (q) pathParams.set("q", q);
  if (category && category !== "All") pathParams.set("category", category);
  if (params.filter && params.filter !== "today") {
    pathParams.set("filter", params.filter);
  }
  if (day) pathParams.set("day", day);
  const path = pathParams.toString()
    ? `/deals?${pathParams.toString()}`
    : "/deals";

  let title = "Deals for you";
  if (category && category !== "All") {
    title = q ? `${category} deals — "${q}"` : `${category} deals`;
  } else if (q) {
    title = `Deals: "${q}"`;
  } else if (day) {
    title = `Deals on ${day}`;
  }

  const desc =
    category && category !== "All"
      ? `Live ${category.toLowerCase()} deals from local shops on ${SITE_NAME} — WhatsApp ordering, coupons, and free delivery offers.`
      : (base.description as string);

  return {
    ...base,
    title,
    description: desc,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: {
      ...base.openGraph,
      title: `${title} · ${SITE_NAME}`,
      description: desc,
      url: absoluteUrl(path),
    },
    twitter: {
      ...base.twitter,
      title: `${title} · ${SITE_NAME}`,
      description: desc,
    },
  };
}
