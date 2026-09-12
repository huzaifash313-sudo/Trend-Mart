"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Brand promo (homepage)                                        */
/*                                                                            */
/*  LCP strategy: always paint a lightweight poster first (priority Image).   */
/*  The MP4 only attaches after idle + in-view so it never competes with      */
/*  splash / first shop paint. Save-Data / 2G / reduced-motion skip video.    */
/* -------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BRAND_PROMO_POSTER, BRAND_PROMO_VIDEO } from "@/lib/brandMedia";
import { shouldSkipHeavyMedia } from "@/lib/mobilePerf";

function BrandVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [skipVideo, setSkipVideo] = useState(false);
  const [failed, setFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [inView, setInView] = useState(false);
  const [idleOk, setIdleOk] = useState(false);

  useEffect(() => {
    if (shouldSkipHeavyMedia()) {
      setSkipVideo(true);
      return;
    }
    // Never start the reel until the browser is idle — protects mobile LCP.
    let idleId = 0;
    let timer = 0;
    const armIdle = () => setIdleOk(true);
    const ric = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      }
    ).requestIdleCallback;
    if (typeof ric === "function") {
      idleId = ric(armIdle, { timeout: 2800 });
    } else {
      timer = window.setTimeout(armIdle, 2200);
    }
    return () => {
      if (idleId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (skipVideo) return;
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [skipVideo]);

  const armed = !skipVideo && !failed && inView && idleOk;

  useEffect(() => {
    if (!armed || !videoReady) return;
    const el = wrapRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

    const tryPlay = () => {
      if (document.hidden) return;
      video.play().catch(() => {
        /* autoplay blocked — poster stays visible */
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
    tryPlay();

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      video.pause();
    };
  }, [armed, videoReady]);

  return (
    <div
      ref={wrapRef}
      className={`tm-brand-video is-ready${videoReady ? " tm-brand-video--playing" : ""}`}
      aria-busy={armed && !videoReady}
    >
      {/* Poster is the LCP candidate — always present, never waits on MP4. */}
      <Image
        src={BRAND_PROMO_POSTER}
        alt="TrendsMart — local shopping across Pakistan"
        fill
        priority
        fetchPriority="high"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 72rem"
        className={`tm-brand-video-poster${videoReady ? " is-hidden" : ""}`}
      />
      {armed ? (
        <video
          ref={videoRef}
          className={`tm-brand-video-el${videoReady ? " is-ready" : ""}`}
          src={BRAND_PROMO_VIDEO}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
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
