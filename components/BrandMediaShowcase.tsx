"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Brand promo video (homepage)                                  */
/*                                                                            */
/*  Fixed-aspect stage always reserved (no CLS). A static poster is the LCP   */
/*  paint; the MP4 mounts later (in-view + idle) so it never fights shop LCP.  */
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
  const [skip, setSkip] = useState(false);
  const [failed, setFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  /** Mount <video> only after the stage is near viewport — keeps first paint light. */
  const [allowVideo, setAllowVideo] = useState(false);

  useEffect(() => {
    if (shouldSkipHeavyMedia()) {
      setSkip(true);
      return;
    }

    const el = wrapRef.current;
    if (!el) return;

    let cancelled = false;
    const arm = () => {
      if (!cancelled) setAllowVideo(true);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        // Yield to shop banners / hydration before starting the MP4 download.
        const ric = (
          window as Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
          }
        ).requestIdleCallback;
        if (typeof ric === "function") {
          ric(arm, { timeout: 1200 });
        } else {
          window.setTimeout(arm, 400);
        }
      },
      { rootMargin: "120px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!allowVideo || skip) return;
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
  }, [allowVideo, skip]);

  return (
    <div ref={wrapRef} className="tm-brand-video">
      {/* LCP: local poster (Next can optimize; page already preloads this URL) */}
      <Image
        src={BRAND_PROMO_POSTER}
        alt="TrendsMart"
        fill
        priority
        sizes="(max-width: 640px) 100vw, 1152px"
        className={`tm-brand-video-poster${videoReady && !skip && !failed ? " is-hidden" : ""}`}
      />
      {allowVideo && !skip && !failed ? (
        <video
          ref={videoRef}
          className={`tm-brand-video-el${videoReady ? " is-ready" : ""}`}
          src={BRAND_PROMO_VIDEO}
          muted
          loop
          playsInline
          preload="none"
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
