"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Ad Creative Live Preview                                       */
/*                                                                             */
/*  Renders an exact mirror of the homepage "Sponsored" card (the same         */
/*  tm-sponsored-* classes used by PromoAdsCarousel) so admins/merchants see   */
/*  precisely what customers will see while they fill in the ad form. Updates  */
/*  in real time as the title / subtitle / badge / image fields change.       */
/* -------------------------------------------------------------------------- */

import { useState } from "react";
import { isFallbackUrl } from "@/services/storageService";
import type { PromotionalAdFormData } from "@/types";

interface AdCreativePreviewProps {
  form: PromotionalAdFormData;
  className?: string;
}

export default function AdCreativePreview({
  form,
  className = "",
}: AdCreativePreviewProps) {
  const [imgError, setImgError] = useState(false);

  const title = form.title?.trim() || "Your ad title";
  const badge = form.badge_label?.trim() || "Sponsored";
  const hasImage =
    !!form.image_url?.trim() && !isFallbackUrl(form.image_url) && !imgError;

  return (
    <div className={className}>
      <article className="tm-sponsored-card group relative flex h-full w-full flex-col overflow-hidden">
        <div className="tm-sponsored-media relative w-full shrink-0 overflow-hidden">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.image_url}
              alt={title}
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="tm-sponsored-media-fallback flex h-full w-full items-center justify-center">
              <span className="select-none text-3xl font-semibold tracking-tight text-white/35">
                {title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <span className="tm-sponsored-badge absolute left-2.5 top-2.5">
            {badge}
          </span>
        </div>

        <div className="tm-sponsored-body flex min-w-0 flex-1 flex-col p-2.5 sm:p-3">
          <h3 className="tm-sponsored-title line-clamp-2" title={title}>
            {title}
          </h3>
          {form.subtitle?.trim() ? (
            <p className="tm-sponsored-subtitle line-clamp-2">{form.subtitle}</p>
          ) : null}
          <span className="tm-sponsored-cta mt-auto inline-flex items-center gap-1 pt-2">
            Explore
            <span aria-hidden>→</span>
          </span>
        </div>
      </article>
    </div>
  );
}
