"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Brand promo video (homepage)                                  */
/*                                                                            */
/*  No poster flash (OG image / teal empty stage). The reel mounts immediately */
/*  under the splash so by the time the intro ends the first frame is ready.   */
/*  Slot keeps a dark letterbox (matches the video) — never a branded teal box. */
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
  const [skip, setSkip] = useState(false);
  const [failed, setFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  // Mount + download as soon as the hero is on the page (often still under the
  // splash). That way the empty slot is gone by the time the intro finishes.
  useEffect(() => {
    if (shouldSkipHeavyMedia()) {
      setSkip(true);
    }
  }, []);

  useEffect(() => {
    if (skip || failed) return;
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
    };
  }, [skip, failed, videoReady]);

  if (skip || failed) return null;

  return (
    <div
      ref={wrapRef}
      className={`tm-brand-video${videoReady ? " is-ready" : " is-loading"}`}
      aria-busy={!videoReady}
    >
      <video
        ref={videoRef}
        className={`tm-brand-video-el${videoReady ? " is-ready" : ""}`}
        src={BRAND_PROMO_VIDEO}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        aria-label="TrendsMart brand promo"
        onLoadedData={() => setVideoReady(true)}
        onCanPlay={() => setVideoReady(true)}
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
