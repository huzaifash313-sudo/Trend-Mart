"use client";

import { useState, useCallback, useEffect } from "react";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function ChevronLeftIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function ImagePlaceholderIcon() {
  return (
    <svg className="h-12 w-12 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface ProductGalleryImage {
  id: string;
  url: string;
  alt?: string;
}

interface ProductGalleryProps {
  images: ProductGalleryImage[];
  productName?: string;
  className?: string;
  /** Enable lightbox zoom on thumbnail click */
  enableLightbox?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Lightbox Modal                                                             */
/* -------------------------------------------------------------------------- */

function LightboxModal({
  images,
  currentIndex,
  onClose,
  onPrev,
  onNext,
}: {
  images: ProductGalleryImage[];
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose, onPrev, onNext]);

  const current = images[currentIndex];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        aria-label="Close lightbox"
      >
        <XIcon />
      </button>

      {/* Counter badge */}
      <div className="absolute left-4 top-4 z-10 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
        {currentIndex + 1} / {images.length}
      </div>

      {/* Prev button */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          aria-label="Previous image"
        >
          <ChevronLeftIcon />
        </button>
      )}

      {/* Image */}
      <div className="flex h-full w-full items-center justify-center p-8 sm:p-16" onClick={(e) => e.stopPropagation()}>
        <img
          src={current.url}
          alt={current.alt || `Product image ${currentIndex + 1}`}
          className="max-h-full max-w-full rounded-lg object-contain"
          draggable={false}
        />
      </div>

      {/* Next button */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          aria-label="Next image"
        >
          <ChevronRightIcon />
        </button>
      )}

      {/* Thumbnail strip at bottom */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 rounded-full bg-white/10 px-3 py-2 backdrop-blur-sm">
          {images.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); /* set index via parent */ }}
              className={`h-2 w-2 rounded-full transition-all ${
                idx === currentIndex
                  ? "bg-white w-6"
                  : "bg-white/50 hover:bg-white/70"
              }`}
              aria-label={`Go to image ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ProductGallery Component                                                    */
/* -------------------------------------------------------------------------- */

export default function ProductGallery({
  images,
  productName = "Product",
  className = "",
  enableLightbox = true,
}: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const validImages = images.filter((img) => img.url?.trim());

  const handleThumbnailClick = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const handleOpenLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const handlePrevLightbox = useCallback(() => {
    setLightboxIndex((prev) => (prev > 0 ? prev - 1 : validImages.length - 1));
  }, [validImages.length]);

  const handleNextLightbox = useCallback(() => {
    setLightboxIndex((prev) => (prev < validImages.length - 1 ? prev + 1 : 0));
  }, [validImages.length]);

  // No images case
  if (validImages.length === 0) {
    return (
      <div className={`flex items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800 aspect-square ${className}`}>
        <ImagePlaceholderIcon />
      </div>
    );
  }

  // Single image case - still show gallery with zoom
  if (validImages.length === 1) {
    return (
      <>
        <div className={`relative overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800 ${className}`}>
          <img
            src={validImages[0].url}
            alt={validImages[0].alt || productName}
            className="h-full w-full object-cover"
          />
          {enableLightbox && (
            <button
              type="button"
              onClick={() => handleOpenLightbox(0)}
              className="absolute bottom-3 right-3 rounded-full bg-black/40 p-2 text-white transition-colors hover:bg-black/60"
              aria-label="Zoom image"
            >
              <ZoomInIcon />
            </button>
          )}
        </div>

        {lightboxOpen && (
          <LightboxModal
            images={validImages}
            currentIndex={lightboxIndex}
            onClose={handleCloseLightbox}
            onPrev={handlePrevLightbox}
            onNext={handleNextLightbox}
          />
        )}
      </>
    );
  }

  // Multi-image gallery
  return (
    <>
      <div className={`space-y-3 ${className}`}>
        {/* Main Image */}
        <div className="relative overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800 aspect-square">
          <img
            src={validImages[selectedIndex]?.url}
            alt={validImages[selectedIndex]?.alt || `${productName} - Image ${selectedIndex + 1}`}
            className="h-full w-full object-cover transition-opacity duration-300"
          />
          {enableLightbox && (
            <button
              type="button"
              onClick={() => handleOpenLightbox(selectedIndex)}
              className="absolute bottom-3 right-3 rounded-full bg-black/40 p-2 text-white transition-colors hover:bg-black/60"
              aria-label="Zoom image"
            >
              <ZoomInIcon />
            </button>
          )}

          {/* Navigation arrows on main image */}
          <button
            type="button"
            onClick={() => setSelectedIndex((prev) => (prev > 0 ? prev - 1 : validImages.length - 1))}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1.5 text-zinc-700 shadow-sm transition-colors hover:bg-white"
            aria-label="Previous image"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            onClick={() => setSelectedIndex((prev) => (prev < validImages.length - 1 ? prev + 1 : 0))}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1.5 text-zinc-700 shadow-sm transition-colors hover:bg-white"
            aria-label="Next image"
          >
            <ChevronRightIcon />
          </button>

          {/* Image counter */}
          <div className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs font-semibold text-white">
            {selectedIndex + 1} / {validImages.length}
          </div>
        </div>

        {/* Thumbnail Grid */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {validImages.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              onClick={() => handleThumbnailClick(idx)}
              className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all sm:h-20 sm:w-20 ${
                idx === selectedIndex
                  ? "border-emerald-500 ring-2 ring-emerald-500/30"
                  : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
              }`}
              aria-label={`View image ${idx + 1}`}
              aria-current={idx === selectedIndex ? "true" : undefined}
            >
              <img
                src={img.url}
                alt={img.alt || `${productName} thumbnail ${idx + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <LightboxModal
          images={validImages}
          currentIndex={lightboxIndex}
          onClose={handleCloseLightbox}
          onPrev={handlePrevLightbox}
          onNext={handleNextLightbox}
        />
      )}
    </>
  );
}