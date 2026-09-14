"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Brand promo (homepage)                                        */
/*                                                                            */
/*  Video mounts and plays immediately (muted + playsInline). No static       */
/*  poster overlay stuck on screen — only a dark slot while the first bytes   */
/*  buffer. Save-Data / 2G / reduced-motion still skip to nothing.            */
/* -------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { BRAND_PROMO_VIDEO } from "@/lib/brandMedia";
import { shouldSkipHeavyMedia } from "@/lib/mobilePerf";

function BrandVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [skipVideo, setSkipVideo] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setSkipVideo(shouldSkipHeavyMedia());
  }, []);

  useEffect(() => {
    if (skipVideo || failed) return;
    const el = wrapRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

    const tryPlay = () => {
      if (document.hidden) return;
      void video.play().then(() => setPlaying(true)).catch(() => {
        /* autoplay blocked — keep trying on next gesture / visibility */
      });
    };

    const onPlaying = () => setPlaying(true);
    const onError = () => setFailed(true);
    const onCanPlay = () => tryPlay();

    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("loadeddata", onCanPlay);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) tryPlay();
        else video.pause();
      },
      { threshold: 0.08 },
    );
    io.observe(el);

    const onVis = () => {
      if (!document.hidden) tryPlay();
    };
    document.addEventListener("visibilitychange", onVis);

    // Start immediately — no idle deferral.
    tryPlay();

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("loadeddata", onCanPlay);
      video.pause();
    };
  }, [skipVideo, failed]);

  if (skipVideo || failed) return null;

  return (
    <div
      ref={wrapRef}
      className={`tm-brand-video is-ready${playing ? " tm-brand-video--playing" : ""}`}
    >
      <video
        ref={videoRef}
        className="tm-brand-video-el is-ready"
        src={BRAND_PROMO_VIDEO}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
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
