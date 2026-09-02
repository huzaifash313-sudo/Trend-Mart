"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadImage, validateImage } from "@/services/storageService";
import { MAX_PRODUCT_IMAGES } from "@/lib/productImages";

/* -------------------------------------------------------------------------- */
/*  MultiImageUpload — multi-photo picker with full (uncropped) previews.     */
/* -------------------------------------------------------------------------- */

interface MultiImageUploadProps {
  urls: string[];
  onChange: (urls: string[]) => void;
  folder?: string;
  fileIdPrefix: string;
  label?: string;
  disabled?: boolean;
  maxImages?: number;
  variant?: "default" | "compact";
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
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
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

const TILE = "h-28 w-28 sm:h-32 sm:w-32";
const TILE_COMPACT = "h-14 w-14";

export default function MultiImageUpload({
  urls,
  onChange,
  folder = "products",
  fileIdPrefix,
  label = "Photos",
  disabled = false,
  maxImages = MAX_PRODUCT_IMAGES,
  variant = "default",
}: MultiImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Local blob previews while files upload — full image, no crop. */
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const remaining = Math.max(0, maxImages - urls.length);

  useEffect(() => {
    return () => {
      pendingPreviews.forEach((u) => {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearPending = useCallback(() => {
    setPendingPreviews((prev) => {
      prev.forEach((u) => {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      });
      return [];
    });
  }, []);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).slice(0, remaining);
      if (list.length === 0) return;

      setError(null);
      const blobs = list.map((f) => URL.createObjectURL(f));
      setPendingPreviews(blobs);
      setUploading(true);
      const next = [...urls];

      for (let i = 0; i < list.length; i++) {
        const file = list[i]!;
        const validation = validateImage(file);
        if (!validation.valid) {
          setError(validation.message ?? "Invalid image.");
          continue;
        }
        const id = `${fileIdPrefix}-${Date.now()}-${i}`;
        const result = await uploadImage(file, folder, id);
        if (result.success) {
          if (!next.includes(result.data) && next.length < maxImages) {
            next.push(result.data);
          }
        } else {
          setError(result.error);
        }
      }

      onChange(next);
      clearPending();
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    },
    [urls, remaining, fileIdPrefix, folder, maxImages, onChange, clearPending],
  );

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) await uploadFiles(e.target.files);
  };

  const openReplace = (index: number) => {
    replaceIndexRef.current = index;
    replaceInputRef.current?.click();
  };

  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const index = replaceIndexRef.current;
    replaceIndexRef.current = null;
    if (replaceInputRef.current) replaceInputRef.current.value = "";
    if (!file || index == null) return;

    setError(null);
    setUploading(true);
    const validation = validateImage(file);
    if (!validation.valid) {
      setError(validation.message ?? "Invalid image.");
      setUploading(false);
      return;
    }
    const blob = URL.createObjectURL(file);
    setPendingPreviews([blob]);
    const id = `${fileIdPrefix}-replace-${Date.now()}`;
    const result = await uploadImage(file, folder, id);
    if (result.success) {
      const next = [...urls];
      next[index] = result.data;
      onChange(next);
    } else {
      setError(result.error);
    }
    URL.revokeObjectURL(blob);
    setPendingPreviews([]);
    setUploading(false);
  };

  const removeAt = (index: number) => {
    onChange(urls.filter((_, i) => i !== index));
  };

  const compact = variant === "compact";
  const tile = compact ? TILE_COMPACT : TILE;
  const imgFit = "h-full w-full object-contain object-center p-1";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          {label}
        </span>
        <span className="text-[0.65rem] text-zinc-400">
          {urls.length}/{maxImages}
        </span>
        {urls.length > 0 ? (
          <span className="text-[0.65rem] text-zinc-400">
            · full photo shown · tap ✕ expand to inspect
          </span>
        ) : null}
        {error ? <span className="text-[11px] text-red-500">{error}</span> : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={handleChange}
        disabled={disabled || uploading || remaining <= 0}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={handleReplace}
        disabled={disabled || uploading}
      />

      <div className="flex flex-wrap items-start gap-2.5">
        {urls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className={`group relative shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 ${tile} dark:border-zinc-700 dark:bg-zinc-900`}
          >
            <button
              type="button"
              onClick={() => openReplace(i)}
              disabled={disabled || uploading}
              className="h-full w-full cursor-pointer disabled:cursor-default"
              aria-label={`Change photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Photo ${i + 1}`} className={imgFit} />
            </button>
            {i === 0 ? (
              <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-zinc-950/70 px-1 py-px text-[8px] font-semibold text-white">
                Cover
              </span>
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxSrc(url);
              }}
              className="absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900/55 text-white opacity-90 transition-opacity hover:bg-zinc-900/90"
              aria-label={`View photo ${i + 1} full size`}
              title="View full"
            >
              <ExpandIcon />
            </button>
            <button
              type="button"
              onClick={() => removeAt(i)}
              disabled={disabled || uploading}
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900/60 text-white opacity-90 transition-opacity hover:bg-zinc-900/90 disabled:opacity-40"
              aria-label={`Remove photo ${i + 1}`}
            >
              <XIcon />
            </button>
          </div>
        ))}

        {pendingPreviews.map((src, i) => (
          <div
            key={`pending-${i}`}
            className={`relative shrink-0 overflow-hidden rounded-xl border border-dashed border-emerald-400/60 bg-zinc-100 ${tile} dark:bg-zinc-900`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Uploading preview" className={`${imgFit} opacity-80`} />
            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Spinner />
            </span>
          </div>
        ))}

        {remaining > 0 && pendingPreviews.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 ${tile}`}
            aria-label={`Add ${label.toLowerCase()}`}
          >
            {uploading ? <Spinner /> : <PlusIcon />}
          </button>
        ) : null}
      </div>

      {lightboxSrc ? (
        <PreviewLightbox
          src={lightboxSrc}
          alt="Full photo preview"
          onClose={() => setLightboxSrc(null)}
        />
      ) : null}
    </div>
  );
}
