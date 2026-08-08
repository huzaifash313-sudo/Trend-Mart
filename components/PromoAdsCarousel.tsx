"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Sponsored / Promotional Ads Carousel (Homepage)               */
/*                                                                             */
/*  Thin wrapper around <HeroSlider> that:                                    */
/*   - Fetches only publicly-approved, active, in-date ads                    */
/*   - Fires a best-effort impression ping once per ad per page view          */
/*   - Fires a click ping before navigating away via the ad's link            */
/*   - Renders nothing when there are no live ads (never shows an empty box)  */
/* -------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import HeroSlider, { type SlideData } from "@/components/HeroSlider";
import { fetchActiveAds, pingAdImpression, pingAdClick } from "@/services/adsService";
import type { PromotionalAd, PromoAdPlacement } from "@/types";

interface PromoAdsCarouselProps {
  placement?: PromoAdPlacement;
  heightClass?: string;
  className?: string;
}

export default function PromoAdsCarousel({
  placement = "homepage_top",
  heightClass = "h-40 sm:h-52 lg:h-64",
  className = "",
}: PromoAdsCarouselProps) {
  const [ads, setAds] = useState<PromotionalAd[]>([]);
  const [loading, setLoading] = useState(true);
  const pingedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await fetchActiveAds(placement);
      if (!cancelled && result.success) setAds(result.data);
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [placement]);

  // Fire one impression ping per ad, the first time it's loaded on this page view.
  useEffect(() => {
    for (const ad of ads) {
      if (!pingedRef.current.has(ad.id)) {
        pingedRef.current.add(ad.id);
        pingAdImpression(ad.id);
      }
    }
  }, [ads]);

  if (!loading && ads.length === 0) return null;

  const slides: SlideData[] = ads.map((ad) => ({
    id: ad.id,
    imageUrl: ad.image_url,
    altText: ad.title,
    heading: ad.title,
    subheading: ad.subtitle ?? undefined,
    linkUrl: ad.link_url,
    openInNewTab: ad.link_url.startsWith("http"),
    badge: ad.badge_label ?? "Sponsored",
  }));

  return (
    <section aria-label="Sponsored promotions" className={className}>
      <h2 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Sponsored
      </h2>
      <HeroSlider
        slides={slides}
        loading={loading}
        heightClass={heightClass}
        autoPlayInterval={6000}
        onSlideClick={(slide) => pingAdClick(slide.id)}
      />
    </section>
  );
}
