"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Brand promo video (homepage)                                  */
/*                                                                            */
/*  Low-end / Save-Data / reduced-motion: skip the reel entirely (Daraz-smooth */
/*  on 2 GB phones). Stronger devices: metadata preload + play only in view.  */
/* -------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { BRAND_PROMO_VIDEO } from "@/lib/brandMedia";
import { shouldSkipHeavyMedia } from "@/lib/mobilePerf";

function BrandVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [skip, setSkip] = useState(false);
  const [failed, setFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (shouldSkipHeavyMedia()) {
      setSkip(true);
      return;
    }
    // Defer source attach until the hero is near the viewport — avoids competing
    // with splash + first shop paint on mid-range phones.
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setArmed(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setArmed(true);
          io.disconnect();
        }
      },
      { rootMargin: "80px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (skip || failed || !armed) return;
    const el = wrapRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

    const tryPlay = () => {
      if (document.hidden) return;
      video.play().catch(() => {
        /* autoplay blocked — first frame still visible once ready */
      });
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) tryPlay();
        else video.pause();
      },
      { threshold: 0.15 },
    );
    io.observe(el);

    const onVis = () => {
      if (!document.hidden) tryPlay();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      video.pause();
    };
  }, [skip, failed, armed, videoReady]);

  if (skip || failed) return null;

  return (
    <div
      ref={wrapRef}
      className={`tm-brand-video${videoReady ? " is-ready" : " is-loading"}`}
      aria-busy={!videoReady && armed}
    >
      {armed ? (
        <video
          ref={videoRef}
          className={`tm-brand-video-el${videoReady ? " is-ready" : ""}`}
          src={BRAND_PROMO_VIDEO}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          aria-label="TrendsMart brand promo"
          onLoadedData={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
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
