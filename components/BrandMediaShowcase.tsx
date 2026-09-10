"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Brand promo video (homepage)                                  */
/*                                                                            */
/*  Fixed-aspect stage always reserved (no CLS). A static poster is the LCP   */
/*  paint; the MP4 fades in later inside the same box (no layout jump).        */
/* -------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BRAND_PROMO_VIDEO } from "@/lib/brandMedia";

/** Static LCP poster — same mark used in splash; fills the reserved stage. */
const BRAND_PROMO_POSTER = "/og-default.png";

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
  /** Must start false so <video> mounts on first paint; otherwise the mount
   *  effect never finds the ref and play/IO never attach. Skip only after
   *  reduced-motion / Save-Data / 2G check. */
  const [skip, setSkip] = useState(false);
  const [failed, setFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

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
        if (entry.isIntersecting) {
          video.play().catch(() => {
            /* autoplay blocked — poster stays visible */
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

  return (
    <div ref={wrapRef} className="tm-brand-video">
      {/* LCP: eager poster in a size-reserved box */}
      <Image
        src={BRAND_PROMO_POSTER}
        alt="TrendsMart"
        fill
        priority
        sizes="(max-width: 640px) 100vw, 1152px"
        className={`tm-brand-video-poster${videoReady && !skip && !failed ? " is-hidden" : ""}`}
        unoptimized
      />
      {!skip && !failed ? (
        <video
          ref={videoRef}
          className={`tm-brand-video-el${videoReady ? " is-ready" : ""}`}
          src={BRAND_PROMO_VIDEO}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="TrendsMart brand promo"
          onLoadedData={() => setVideoReady(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
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
