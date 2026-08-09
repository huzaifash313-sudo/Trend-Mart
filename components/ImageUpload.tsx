"use client";

import { useState, useRef, useCallback } from "react";
import {
  uploadImage,
  validateImage,
  FALLBACK_URLS,
  type ImageValidationResult,
} from "@/services/storageService";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface ImageUploadProps {
  /** Current image URL (from Supabase Storage). */
  currentUrl: string;
  /** Called with the public URL after a successful upload (or "" when cleared). */
  onUploaded: (url: string) => void;
  /** Subfolder inside the bucket (e.g. "shops" or "products"). */
  folder: string;
  /** Unique file identifier (e.g. shop uuid or "new-product"). */
  fileId: string;
  /** Optional label override. */
  label?: string;
  /** If true, disable the picker. */
  disabled?: boolean;
  /** If true, show a preview of the current image. */
  showPreview?: boolean;
  /** Fallback type for missing images. */
  fallbackType?: "shop" | "product" | "generic";
  /**
   * compact: single-row upload control (bulk table / tight layouts).
   * default: stacked preview + full-width upload button.
   */
  variant?: "default" | "compact";
}

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function UploadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path
        d="M4 12a8 8 0 0 1 8-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
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

/* -------------------------------------------------------------------------- */
/*  Component — file upload only (no manual URL field)                        */
/* -------------------------------------------------------------------------- */

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
  const acceptTypes = "image/jpeg,image/png,image/webp,image/avif";

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
      if (result.success) {
        onUploaded(result.data);
      } else {
        setUploadError(result.error);
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [folder, fileId, onUploaded],
  );

  const handleClear = useCallback(
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
      accept={acceptTypes}
      onChange={handleFileChange}
      className="hidden"
      aria-label={`Upload ${label.toLowerCase()}`}
    />
  );

  /* ── Compact: single horizontal line (bulk desktop / tight UIs) ─────────── */
  if (variant === "compact") {
    return (
      <div className="tm-img-upload tm-img-upload--compact">
        {fileInput}
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || uploading}
          className="tm-img-upload__btn tm-img-upload__btn--compact"
        >
          {uploading ? (
            <>
              <Spinner className="h-3.5 w-3.5" />
              <span>…</span>
            </>
          ) : hasImage ? (
            <>
              {showPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt=""
                  className="tm-img-upload__thumb"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = FALLBACK_URLS.generic;
                  }}
                />
              ) : null}
              <span>Change</span>
            </>
          ) : (
            <>
              <UploadIcon className="h-3.5 w-3.5" />
              <span>Upload</span>
            </>
          )}
        </button>
        {hasImage ? (
          <button
            type="button"
            onClick={handleClear}
            className="tm-img-upload__clear"
            aria-label="Remove image"
            disabled={disabled || uploading}
          >
            <XIcon />
          </button>
        ) : null}
        {(uploadError || validationError) && (
          <p className="tm-img-upload__err">
            {uploadError || validationError?.message}
          </p>
        )}
      </div>
    );
  }

  /* ── Default: stacked, mobile-friendly ──────────────────────────────────── */
  return (
    <div className="tm-img-upload tm-img-upload--stack space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          {label}
        </label>
        {uploadError ? <span className="text-xs text-red-500">{uploadError}</span> : null}
      </div>

      {showPreview ? (
        <div className="flex items-center gap-3">
          <div className="tm-img-upload__preview">
            {hasImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={`${label} preview`}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = FALLBACK_URLS.generic;
                }}
              />
            ) : (
              <span className="text-[10px] font-medium text-teal-700/50 dark:text-teal-300/40">
                No image
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {hasImage ? "Image ready" : "Tap upload to add a photo"}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              JPG, PNG or WebP · auto-compressed
            </p>
          </div>
        </div>
      ) : null}

      {validationError ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertIcon />
          <span>{validationError.message}</span>
        </div>
      ) : null}

      {fileInput}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || uploading}
          className="tm-img-upload__btn w-full sm:w-auto sm:min-w-[9.5rem]"
        >
          {uploading ? (
            <>
              <Spinner />
              Uploading…
            </>
          ) : (
            <>
              <UploadIcon />
              {hasImage ? "Change photo" : "Upload photo"}
            </>
          )}
        </button>
        {hasImage ? (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled || uploading}
            className="tm-img-upload__clear-btn"
            aria-label="Remove image"
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
