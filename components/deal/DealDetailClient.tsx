"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DealCard from "@/components/DealCard";
import RelatedItemsRail, { type RelatedRailItem } from "@/components/RelatedItemsRail";
import { ErrorState } from "@/components/ErrorState";
import { ProductDetailSkeleton } from "@/components/Skeletons";
import { fetchDealById, fetchRelatedDeals } from "@/services/dealService";
import { getDealSeoPath } from "@/lib/seo/dealSlug";
import { getDealImages } from "@/lib/productImages";
import type { ShopDeal } from "@/lib/dealSchedule";

export default function DealDetailClient({ dealId }: { dealId: string }) {
  const [deal, setDeal] = useState<ShopDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [related, setRelated] = useState<RelatedRailItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDeal(null);
    setRelated([]);

    void (async () => {
      const res = await fetchDealById(dealId);
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setLoading(false);
        return;
      }
      if (!res.data) {
        setError("This deal is no longer available.");
        setLoading(false);
        return;
      }
      setDeal(res.data);
      setLoading(false);

      void fetchRelatedDeals({
        shopId: res.data.shop_id,
        excludeId: res.data.id,
        limit: 6,
      }).then((rel) => {
        if (cancelled || !rel.success) return;
        setRelated(
          rel.data.map((d) => ({
            id: d.id,
            href: getDealSeoPath(d.title, d.id),
            title: d.title,
            price: Number(d.price) || 0,
            originalPrice: d.original_price ?? null,
            imageUrl: getDealImages(d)[0] ?? d.image_url ?? null,
          })),
        );
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [dealId]);

  if (loading) {
    return (
      <div className="mt-4">
        <ProductDetailSkeleton />
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="mt-4">
        <ErrorState
          title="Deal unavailable"
          message={error ?? "This deal could not be found."}
          onRetry={() => window.location.reload()}
        />
        <div className="mt-4 text-center">
          <Link href="/deals" className="text-sm font-semibold text-emerald-600 hover:text-emerald-700">
            Browse all deals →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <DealCard deal={deal} priority />
      <RelatedItemsRail title="More deals from this shop" items={related} />
      <div className="mt-4 text-center">
        <Link
          href="/deals"
          className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
        >
          Browse all deals →
        </Link>
      </div>
    </div>
  );
}
