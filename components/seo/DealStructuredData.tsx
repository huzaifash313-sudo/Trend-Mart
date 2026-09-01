import {
  getDealPrimaryImageUrl,
  type DealSeoRecord,
} from "@/lib/seo/fetchDealForSeo";
import { getDealSeoPath } from "@/lib/seo/dealSlug";
import { absoluteUrl } from "@/lib/metadata";
import { buildDealJsonLd } from "@/utils/seo";

/* -------------------------------------------------------------------------- */
/*  Reusable server component — Deal Offer JSON-LD for rich snippets           */
/* -------------------------------------------------------------------------- */

export default function DealStructuredData({
  deal,
}: {
  deal: DealSeoRecord;
}) {
  const shop = deal.shop;
  const imageUrl = getDealPrimaryImageUrl(deal);
  const url = absoluteUrl(getDealSeoPath(deal.title, deal.id));

  const jsonLd = buildDealJsonLd({
    name: deal.title,
    description: deal.description ?? undefined,
    price: deal.price,
    originalPrice: deal.original_price,
    imageUrl,
    shopName: shop.name,
    shopId: shop.id,
    dealId: deal.id,
    url,
    availability: deal.is_active,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
