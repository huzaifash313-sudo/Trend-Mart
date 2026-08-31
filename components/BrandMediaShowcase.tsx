"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Brand promo video (homepage)                                  */
/*                                                                            */
/*  Promo reel: muted autoplay loop while in view. Image carousel removed.    */
/* -------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { BRAND_PROMO_VIDEO } from "@/lib/brandMedia";

function BrandVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      video.pause();
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!video) return;
        if (entry.isIntersecting) {
          video.play().catch(() => {
            /* autoplay blocked — still show poster frame */
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (failed) return null;

  return (
    <div ref={wrapRef} className="tm-brand-video">
      <video
        ref={videoRef}
        className="tm-brand-video-el"
        src={BRAND_PROMO_VIDEO}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="TrendsMart brand promo"
        onError={() => setFailed(true)}
      />
      <div className="tm-brand-video-glow" aria-hidden />
    </div>
  );
}

export default function BrandMediaShowcase({
  className = "",
}: {
  className?: string;
}) {
  return (
    <section
      aria-label="TrendsMart highlights"
      className={`tm-brand-showcase ${className}`.trim()}
    >
      <BrandVideo />
    </section>
  );
}