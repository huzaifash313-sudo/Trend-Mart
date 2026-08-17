"use client";

import { useState, useRef, useCallback } from "react";
import {
  uploadImage,
  validateImage,
  FALLBACK_URLS,
  type ImageValidationResult,
} from "@/services/storageService";

/* -------------------------------------------------------------------------- */
/*  ImageUpload — minimal single-image picker (logo, banner, story).          */
/*                                                                             */
/*  One clean clickable box: tap to pick (or re-pick) a photo, tap the small   */
/*  ✕ to remove. No verbose helper text, no "Change"/"Remove" buttons.        */
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

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
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
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validationError, setValidationError] =
    useState<ImageValidationResult | null>(null);

  const hasImage = !!(currentUrl && currentUrl.trim());
  const previewUrl = hasImage ? currentUrl : FALLBACK_URLS[fallbackType];

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

      setUploading(true);
      const result = await uploadImage(file, folder, fileId);
      if (result.success) onUploaded(result.data);
      else setUploadError(result.error);
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

  /* ── Compact: small inline control (bulk rows) ─────────────────────────── */
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2">
        {fileInput}
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || uploading}
          className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
        >
          {uploading ? (
            <Spinner />
          ) : hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <PlusIcon />
          )}
        </button>
        {hasImage ? (
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

  /* ── Default: one clean clickable box ──────────────────────────────────── */
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
        {label}
      </span>

      {fileInput}

      <button
        type="button"
        onClick={openPicker}
        disabled={disabled || uploading}
        className="group relative block h-40 w-full overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50 transition-colors hover:border-emerald-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
        aria-label={hasImage ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
      >
        {uploading ? (
          <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-400">
            <Spinner />
          </span>
        ) : hasImage && showPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="h-full w-full object-contain p-1.5"
            onError={(e) => {
              (e.target as HTMLImageElement).src = FALLBACK_URLS.generic;
            }}
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-zinc-400">
            <PlusIcon />
            <span className="text-xs font-medium">Upload</span>
          </span>
        )}

        {hasImage && !uploading ? (
          <>
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/70 to-transparent px-2 pb-1.5 pt-5 text-center text-[10px] font-semibold text-white/95">
              Tap to change
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={remove}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  remove(e as unknown as React.MouseEvent);
                }
              }}
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900/60 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-zinc-900/90"
              aria-label="Remove image"
            >
              <XIcon />
            </span>
          </>
        ) : null}
      </button>

      {(uploadError || validationError) && (
        <p className="text-[11px] text-red-500">
          {uploadError || validationError?.message}
        </p>
      )}
    </div>
  );
}
