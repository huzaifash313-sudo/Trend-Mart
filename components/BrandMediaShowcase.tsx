"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Brand promo video (homepage)                                  */
/*                                                                            */
/*  Promo reel: muted autoplay loop while in view. Skips heavy media on        */
/*  Save-Data / 2G so mid-range Android & iPhone stay responsive.              */
/* -------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { BRAND_PROMO_VIDEO } from "@/lib/brandMedia";

function shouldSkipHeavyMedia(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    const c = nav.connection;
    if (
      c?.saveData ||
      c?.effectiveType === "slow-2g" ||
      c?.effectiveType === "2g"
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function BrandVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    if (shouldSkipHeavyMedia()) {
      setSkip(true);
      return;
    }

    const el = wrapRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

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

  if (failed || skip) return null;

  return (
    <div ref={wrapRef} className="tm-brand-video">
      <video
        ref={videoRef}
        className="tm-brand-video-el"
        src={BRAND_PROMO_VIDEO}
        muted
        loop
        playsInline
        preload="none"
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
