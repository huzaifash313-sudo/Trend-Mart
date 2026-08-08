"use client";

import { useState, useCallback, useMemo } from "react";
import Image from "next/image";
import { FALLBACK_URLS } from "@/services/storageService";
import { validateImageUrl } from "@/lib/sanitization";

/* -------------------------------------------------------------------------- */
/*  BlurHash → CSS Gradient Fallback Generator                                 */
/*  When no blurDataURL is provided, we generate a random-but-stable gradient   */
/*  based on the src URL to prevent pure-white layout shifts.                   */
/* -------------------------------------------------------------------------- */

const GRADIENT_PRESETS = [
  "from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800",
  "from-zinc-100 to-zinc-300 dark:from-zinc-800 dark:to-zinc-700",
  "from-zinc-200 to-zinc-100 dark:from-zinc-700 dark:to-zinc-800",
  "from-zinc-300 to-zinc-200 dark:from-zinc-600 dark:to-zinc-700",
] as const;

/** Returns a stable gradient class based on a string hash. */
function getStableGradient(src: string): string {
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % GRADIENT_PRESETS.length;
  return GRADIENT_PRESETS[idx];
}

/** Tiny inline SVG placeholder — a 1×1 pixel data URI that's safe for all browsers. */
function generateLQIP(baseColor = "#e4e4e7"): string {
  // Dark mode adaptive: we use CSS classes on the container, but for data-URI we pick a neutral mid-tone
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="100%" height="100%" fill="${encodeURIComponent(baseColor)}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

interface OptimizedImageProps {
  /** Remote image URL (Supabase storage, etc.) */
  src: string | null | undefined;
  /** Alt text for accessibility (required). */
  alt: string;
  /** CSS aspect-ratio (e.g., "1/1", "16/9", "4/3"). Default: "1/1" */
  aspectRatio?: string;
  /** Additional CSS classes applied to the outer container. */
  className?: string;
  /** Object-fit style. Default: "cover" */
  objectFit?: "cover" | "contain" | "fill";
  /** Show fade-in animation on load. Default: true */
  fadeIn?: boolean;
  /** Fallback placeholder type. Default: "icon" */
  fallbackType?: "icon" | "initials" | "none" | "shop" | "product" | "generic";
  /** Initials to show if fallbackType is "initials" */
  initials?: string;
  /**
   * When true, the image loads eagerly (no lazy-loading).
   * Use for hero images and above-the-fold content.
   */
  priority?: boolean;
  /**
   * Responsive sizes string for the `sizes` attribute.
   * e.g. "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
   */
  sizes?: string;
  /** Override the `fill` prop; defaults to true for aspect-ratio containers. */
  fill?: boolean;
  /** Image quality (1-100), passed to Next.js Image. Default: 85 */
  quality?: number;
  /**
   * BlurDataURL for LQIP (Low Quality Image Placeholder).
   * Generate using `plaiceholder` or similar library.
   * If not provided, a stable CSS gradient is used automatically
   * to prevent layout shift and provide visual feedback while loading.
   */
  blurDataURL?: string;
}

/* -------------------------------------------------------------------------- */
/*  Icons / Placeholders                                                       */
/* -------------------------------------------------------------------------- */

function ImagePlaceholderIcon() {
  return (
    <svg
      className="h-12 w-12 text-zinc-300 dark:text-zinc-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function SkeletonShimmer() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-zinc-200 dark:bg-zinc-700">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Optimized image component with implicit aspect-ratio container,
 * smooth fade-in loading, skeleton shimmer, URL validation, and robust
 * fallback handling — eliminating cumulative layout shift (CLS) while
 * preventing XSS and external resource exploits.
 *
 * Uses Next.js `<Image>` for automatic WebP/AVIF conversion,
 * lazy loading via `loading="lazy"`, and responsive sizing via `sizes` / `srcset`.
 *
 * All incoming `src` URLs are validated through `validateImageUrl()` to
 * block http:// (mixed content), non-Supabase external domains, javascript:
 * URIs, and XSS injection vectors before rendering.
 */
export default function OptimizedImage({
  src,
  alt,
  aspectRatio = "1/1",
  className = "",
  objectFit = "cover",
  fadeIn = true,
  fallbackType = "icon",
  initials = "",
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  fill = true,
  quality = 85,
  blurDataURL,
}: OptimizedImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    setError(false);
  }, []);

  const handleError = useCallback(() => {
    setError(true);
    setLoaded(false);
  }, []);

  /** Stable gradient placeholder derived from the image URL. */
  const gradientClass = useMemo(
    () => (src ? getStableGradient(src) : GRADIENT_PRESETS[0]),
    [src],
  );

  /** LQIP fallback: prefer explicit blurDataURL, then generated SVG, then empty. */
  const placeholderDataURL = useMemo(
    () => blurDataURL || (src ? generateLQIP() : undefined),
    [blurDataURL, src],
  );

  /**
   * Resolve and validate the image URL.
   * All URLs pass through validateImageUrl() which checks:
   *   - Protocol (https: or data: only, no http: mixed content)
   *   - Domain allowlist (Supabase only)
   *   - XSS vectors (javascript:, event handlers, angle brackets)
   *   - URL length limits
   *   - Data URI MIME type checks
   */
  const resolvedSrc = useMemo(() => {
    // No src or loading error — use fallback
    if (!src || error) {
      if (fallbackType === "shop") return FALLBACK_URLS.shop;
      if (fallbackType === "product") return FALLBACK_URLS.product;
      if (fallbackType === "generic") return FALLBACK_URLS.generic;
      return FALLBACK_URLS.generic;
    }

    // Validate the URL through our security pipeline
    const validated = validateImageUrl(src);
    if (!validated) {
      // URL failed validation — it's either unsafe, malformed,
      // or from an untrusted external domain.
      // Trigger error state to show the fallback UI.
      // We use a microtask to avoid setState during render warnings.
      if (typeof window !== "undefined") {
        queueMicrotask(() => setError(true));
      }
      if (fallbackType === "shop") return FALLBACK_URLS.shop;
      if (fallbackType === "product") return FALLBACK_URLS.product;
      if (fallbackType === "generic") return FALLBACK_URLS.generic;
      return FALLBACK_URLS.generic;
    }

    return validated;
  }, [src, error, fallbackType]);

  // Render fallback UI (no valid image source)
  if (!src || error) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700 ${className}`}
        style={{ aspectRatio }}
      >
        {fallbackType === "initials" && initials ? (
          <span className="select-none text-3xl font-extrabold tracking-tight text-zinc-400 dark:text-zinc-500 drop-shadow-sm">
            {initials.slice(0, 2).toUpperCase()}
          </span>
        ) : fallbackType === "shop" && initials ? (
          <span className="select-none rounded-full bg-gradient-to-br from-emerald-100 to-emerald-300 dark:from-emerald-800 dark:to-emerald-600 h-16 w-16 flex items-center justify-center text-xl font-extrabold text-emerald-700 dark:text-emerald-200 shadow-md">
            {initials.slice(0, 2).toUpperCase()}
          </span>
        ) : fallbackType === "product" && initials ? (
          <span className="select-none rounded-2xl bg-gradient-to-br from-amber-100 to-amber-300 dark:from-amber-800 dark:to-amber-600 h-16 w-16 flex items-center justify-center text-xl font-extrabold text-amber-700 dark:text-amber-200 shadow-md">
            {initials.slice(0, 2).toUpperCase()}
          </span>
        ) : fallbackType === "icon" ? (
          <ImagePlaceholderIcon />
        ) : fallbackType === "none" ? null : (
          // shop / product / generic → render the SVG fallback as a small img
          <img
            src={resolvedSrc}
            alt={alt}
            className="h-12 w-12 object-contain opacity-50"
            loading="lazy"
            draggable={false}
          />
        )}
      </div>
    );
  }

  // Determine if the URL is an external HTTP(S) URL or a data URI
  const isDataUri = resolvedSrc.startsWith("data:");
  const isAbsoluteUrl =
    resolvedSrc.startsWith("http://") || resolvedSrc.startsWith("https://");

  // For data URIs, we must use native <img> since Next.js Image doesn't optimise them
  if (isDataUri) {
    return (
      <div
        className={`relative overflow-hidden bg-gradient-to-br ${gradientClass} ${className}`}
        style={{ aspectRatio }}
      >
        {/* Low-quality placeholder gradient visible before the image loads */}
        <img
          src={resolvedSrc}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={`h-full w-full transition-opacity duration-500 ${
            fadeIn && loaded ? "opacity-100" : "opacity-0"
          }`}
          style={{ objectFit }}
          draggable={false}
        />
        {!loaded && <SkeletonShimmer />}
      </div>
    );
  }

  // Next.js Image with aspect-ratio container (fill mode) — the common path
  if (fill) {
    return (
      <div
        className={`relative overflow-hidden bg-gradient-to-br ${gradientClass} ${className}`}
        style={{ aspectRatio }}
      >
        {/* Skeleton shimmer behind the image */}
        {!loaded && <SkeletonShimmer />}

        <Image
          src={resolvedSrc}
          alt={alt}
          fill
          sizes={sizes}
          quality={quality}
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={`transition-opacity duration-500 ${
            fadeIn && loaded ? "opacity-100" : "opacity-0"
          }`}
          style={{ objectFit }}
          draggable={false}
          {...(placeholderDataURL ? { blurDataURL: placeholderDataURL, placeholder: "blur" as const } : {})}
        />
      </div>
    );
  }

  // Fallback: fixed-size Next.js Image (rarely used)
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${gradientClass} ${className}`}
    >
      {!loaded && <SkeletonShimmer />}
      <Image
        src={resolvedSrc}
        alt={alt}
        width={400}
        height={400}
        sizes={sizes}
        quality={quality}
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        className={`transition-opacity duration-500 ${
          fadeIn && loaded ? "opacity-100" : "opacity-0"
        }`}
        style={{ objectFit }}
        draggable={false}
        {...(placeholderDataURL ? { blurDataURL: placeholderDataURL, placeholder: "blur" as const } : {})}
      />
    </div>
  );
}