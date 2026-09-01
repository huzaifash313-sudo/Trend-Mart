import {
  getProductPrimaryImageUrl,
  type ProductSeoRecord,
} from "@/lib/seo/fetchProductForSeo";
import { getProductSeoPath } from "@/lib/seo/productSlug";
import { absoluteUrl } from "@/lib/metadata";
import { buildProductJsonLd } from "@/utils/seo";

/* -------------------------------------------------------------------------- */
/*  Reusable server component — Product + Offer JSON-LD for rich snippets      */
/* -------------------------------------------------------------------------- */

export interface ProductStructuredDataProps {
  product: ProductSeoRecord;
}

export default function ProductStructuredData({
  product,
}: ProductStructuredDataProps) {
  const shop = product.shop;
  const imageUrl = getProductPrimaryImageUrl(product);
  const canonicalPath = getProductSeoPath(
    product.name,
    product.short_code,
    product.id,
  );

  const jsonLd = buildProductJsonLd({
    name: product.name,
    description: product.description ?? undefined,
    price: product.price,
    currency: product.currency ?? "PKR",
    imageUrl,
    shopName: shop.name,
    shopId: shop.id,
    productId: product.id,
    shortCode: product.short_code ?? undefined,
    isAvailable: product.is_available,
    category: shop.category ?? undefined,
    sku: product.short_code ?? product.id,
    brandName: shop.name,
    url: absoluteUrl(canonicalPath),
    ratingValue:
      typeof shop.avg_rating === "number" && shop.avg_rating > 0
        ? shop.avg_rating
        : undefined,
    reviewCount:
      typeof shop.review_count === "number" ? shop.review_count : undefined,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
