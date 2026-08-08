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
  /** Current image URL (from Supabase Storage or external). */
  currentUrl: string;
  /** Called with the public URL after a successful upload. */
  onUploaded: (url: string) => void;
  /** Subfolder inside the bucket (e.g. "shops" or "products"). */
  folder: string;
  /** Unique file identifier (e.g. shop uuid or "new-product"). */
  fileId: string;
  /** Optional label override. */
  label?: string;
  /** If true, disable the picker. */
  disabled?: boolean;
  /** If true, show a small preview of the current image. */
  showPreview?: boolean;
  /** Fallback type for missing images (determines placeholder style). */
  fallbackType?: "shop" | "product" | "generic";
}

/* -------------------------------------------------------------------------- */
/*  Inline Icons                                                               */
/* -------------------------------------------------------------------------- */

function UploadIcon() {
  return (
    <svg
      className="h-4 w-4"
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

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
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

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Image file upload + URL fallback input.
 *
 * Shows a file picker button. On selection, validates then uploads the file
 * to Supabase Storage and calls `onUploaded` with the resulting public URL.
 * Also includes a text input for manual URL entry.
 *
 * Synchronises accepted MIME types with `ALLOWED_IMAGE_TYPES` from
 * the storage service to ensure consistent validation.
 */
export default function ImageUpload({
  currentUrl,
  onUploaded,
  folder,
  fileId,
  label = "Image",
  disabled = false,
  showPreview = true,
  fallbackType = "generic",
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validationError, setValidationError] =
    useState<ImageValidationResult | null>(null);

  /** Resolve a safely usable preview URL (fallback if current is empty/invalid). */
  const previewUrl =
    currentUrl && currentUrl.trim() !== "" ? currentUrl : FALLBACK_URLS[fallbackType];

  /** Build accept string from allowed types. */
  const acceptTypes = "image/jpeg,image/png,image/webp,image/avif";

  /* ── File picker handler ───────────────────────────────────────────────── */
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Clear previous errors
      setUploadError(null);
      setValidationError(null);

      // Client-side validation before upload
      const validation = validateImage(file);
      if (!validation.valid) {
        setValidationError(validation);
        // Reset input so the same file can be re-selected after fixing
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
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

      // Reset so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [folder, fileId, onUploaded],
  );

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-2">
      {/* Label + error summary */}
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          {label}
        </label>
        {uploadError && (
          <span className="text-xs text-red-500">{uploadError}</span>
        )}
      </div>

      {/* Preview (optional) — always shows a valid image, never broken */}
      {showPreview && (
        <div className="flex items-center gap-3">
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="h-12 w-12 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
            onError={(e) => {
              // Last-resort fallback if even the fallback URL fails
              (e.target as HTMLImageElement).src = FALLBACK_URLS.generic;
            }}
          />
          <span className="text-xs text-zinc-400 truncate max-w-[180px]">
            {currentUrl || "No image set"}
          </span>
        </div>
      )}

      {/* Validation error banner */}
      {validationError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertIcon />
          <span>{validationError.message}</span>
        </div>
      )}

      {/* File picker + URL input */}
      <div className="flex gap-2">
        {/* Upload button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {uploading ? (
            <>
              <Spinner />
              Uploading…
            </>
          ) : (
            <>
              <UploadIcon />
              Upload
            </>
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept={acceptTypes}
          onChange={handleFileChange}
          className="hidden"
          aria-label={`Upload ${label.toLowerCase()}`}
        />

        {/* URL fallback */}
        <input
          type="url"
          value={currentUrl}
          onChange={(e) => onUploaded(e.target.value)}
          placeholder="https://example.com/image.jpg"
          disabled={disabled}
          className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 disabled:opacity-50"
        />
      </div>
    </div>
  );
}