"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  uploadImage,
  validateImage,
  FALLBACK_URLS,
  type ImageValidationResult,
} from "@/services/storageService";

/* -------------------------------------------------------------------------- */
/*  ImageUpload — single-image picker with full (uncropped) preview.          */
/* -------------------------------------------------------------------------- */

export interface ImageUploadProps {
  currentUrl: string;
  onUploaded: (url: string) => void;
  folder: string;
  fileId: string;
  label?: string;
  disabled?: boolean;
  showPreview?: boolean;
  fallbackType?: "shop" | "product" | "generic";
  variant?: "default" | "compact";
  /** "video" = wide 16:9 frame (ads/banners). Image still fits fully inside. */
  aspect?: "square" | "video";
}

function PlusIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Full-bleed lightbox — entire image visible (object-contain). */
function PreviewLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        aria-label="Close preview"
      >
        <XIcon />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[min(96vw,56rem)] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export default function ImageUpload({
  currentUrl,
  onUploaded,
  folder,
  fileId,
  label = "Image",
  disabled = false,
  showPreview = true,
  fallbackType = "generic",
  variant = "default",
  aspect = "square",
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validationError, setValidationError] =
    useState<ImageValidationResult | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  const hasImage = !!(currentUrl && currentUrl.trim());
  const showImage = !!(localPreview || hasImage);
  const previewUrl = localPreview ?? (hasImage ? currentUrl : FALLBACK_URLS[fallbackType]);

  // Revoke object URLs on unmount / replace
  useEffect(() => {
    return () => {
      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadError(null);
      setValidationError(null);

      const validation = validateImage(file);
      if (!validation.valid) {
        setValidationError(validation);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      setLocalPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return objectUrl;
      });

      setUploading(true);
      const result = await uploadImage(file, folder, fileId);
      if (result.success) {
        onUploaded(result.data);
        setLocalPreview((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return null;
        });
      } else {
        setUploadError(result.error);
        // Keep local preview so merchant still sees what they picked
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [folder, fileId, onUploaded],
  );

  const remove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onUploaded("");
      setUploadError(null);
      setValidationError(null);
      setLocalPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
    },
    [onUploaded],
  );

  const openPicker = () => {
    if (!disabled && !uploading) fileInputRef.current?.click();
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/avif"
      onChange={handleFileChange}
      className="hidden"
      aria-label={`Upload ${label.toLowerCase()}`}
    />
  );

  const imgClass =
    "h-full w-full object-contain object-center";

  /* ── Compact: small inline control (bulk rows) ─────────────────────────── */
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2">
        {fileInput}
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || uploading}
          className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-100 text-zinc-400 transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {uploading && !showImage ? (
            <Spinner />
          ) : showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className={imgClass} />
          ) : (
            <PlusIcon />
          )}
        </button>
        {showImage ? (
          <button
            type="button"
            onClick={remove}
            disabled={disabled || uploading}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-300"
            aria-label="Remove image"
          >
            <XIcon />
          </button>
        ) : null}
        {(uploadError || validationError) && (
          <span className="text-[11px] text-red-500">
            {uploadError || validationError?.message}
          </span>
        )}
      </div>
    );
  }

  /* ── Default: roomy frame — full image via object-contain ──────────────── */
  const boxShape =
    aspect === "video"
      ? "aspect-video w-full min-h-[11rem]"
      : "h-52 w-full sm:h-56";

  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
        {label}
      </span>

      {fileInput}

      <div
        className={`group relative ${boxShape} overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900`}
      >
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || uploading}
          className="absolute inset-0 z-0 disabled:opacity-50"
          aria-label={hasImage ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        />

        {uploading && !showImage ? (
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400">
            <Spinner />
            <span className="text-xs font-medium">Uploading…</span>
          </span>
        ) : showImage && showPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className={`pointer-events-none absolute inset-0 p-2 ${imgClass}`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = FALLBACK_URLS.generic;
            }}
          />
        ) : (
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-400">
            <PlusIcon />
            <span className="text-xs font-medium">Upload</span>
          </span>
        )}

        {uploading && showImage ? (
          <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/35">
            <span className="inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white">
              <Spinner /> Uploading…
            </span>
          </span>
        ) : null}

        {showImage && !uploading ? (
          <>
            <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-zinc-950/65 to-transparent px-2 pb-1.5 pt-6 text-center text-[10px] font-semibold text-white/95">
              Tap to change · full image shown
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(true);
              }}
              className="absolute left-1.5 top-1.5 z-[2] flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/55 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-zinc-900/90"
              aria-label="View full image"
              title="View full image"
            >
              <ExpandIcon />
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={disabled}
              className="absolute right-1.5 top-1.5 z-[2] flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/55 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-zinc-900/90 disabled:opacity-50"
              aria-label="Remove image"
            >
              <XIcon />
            </button>
          </>
        ) : null}
      </div>

      {(uploadError || validationError) && (
        <p className="text-[11px] text-red-500">
          {uploadError || validationError?.message}
        </p>
      )}

      {lightbox && showImage ? (
        <PreviewLightbox
          src={previewUrl}
          alt={`${label} full preview`}
          onClose={() => setLightbox(false)}
        />
      ) : null}
    </div>
  );
}
