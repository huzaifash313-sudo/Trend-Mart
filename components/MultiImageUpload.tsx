"use client";

import { useCallback, useRef, useState } from "react";
import { uploadImage, validateImage } from "@/services/storageService";
import { MAX_PRODUCT_IMAGES } from "@/lib/productImages";

interface MultiImageUploadProps {
  urls: string[];
  onChange: (urls: string[]) => void;
  folder?: string;
  fileIdPrefix: string;
  label?: string;
  disabled?: boolean;
  maxImages?: number;
  /** compact: tighter “Add” control for bulk rows */
  variant?: "default" | "compact";
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
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

/**
 * Multi photo picker for products — select several at once or tap “Add more”.
 * No URL fields; file upload only. Images are compressed in storageService.
 */
export default function MultiImageUpload({
  urls,
  onChange,
  folder = "products",
  fileIdPrefix,
  label = "Product photos",
  disabled = false,
  maxImages = MAX_PRODUCT_IMAGES,
  variant = "default",
}: MultiImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = Math.max(0, maxImages - urls.length);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).slice(0, remaining);
      if (list.length === 0) return;

      setError(null);
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
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    },
    [urls, remaining, fileIdPrefix, folder, maxImages, onChange],
  );

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) await uploadFiles(e.target.files);
  };

  const removeAt = (index: number) => {
    onChange(urls.filter((_, i) => i !== index));
  };

  const moveToCover = (index: number) => {
    if (index <= 0) return;
    const next = [...urls];
    const [item] = next.splice(index, 1);
    if (item) next.unshift(item);
    onChange(next);
  };

  const compact = variant === "compact";

  return (
    <div className={`tm-multi-img space-y-1.5 ${compact ? "tm-multi-img--compact" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          {label}
          <span className="ml-1 font-normal text-zinc-400">
            ({urls.length}/{maxImages})
          </span>
        </label>
        {error ? <span className="text-[11px] text-red-500">{error}</span> : null}
      </div>

      {urls.length > 0 ? (
        <div className="tm-multi-img__strip">
          {urls.map((url, i) => (
            <div key={`${url}-${i}`} className="tm-multi-img__tile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full" />
              {i === 0 ? (
                <span className="tm-multi-img__cover">Cover</span>
              ) : (
                <button
                  type="button"
                  onClick={() => moveToCover(i)}
                  className="tm-multi-img__set-cover"
                  title="Make cover"
                >
                  Set cover
                </button>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="tm-multi-img__remove"
                aria-label={`Remove photo ${i + 1}`}
                disabled={disabled || uploading}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        !compact && (
          <div className="tm-multi-img__empty">
            <p className="text-xs font-medium text-teal-800/70 dark:text-teal-300/70">
              No photos yet
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Pick up to {maxImages} at once — JPG, PNG or WebP
            </p>
          </div>
        )
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={handleChange}
        disabled={disabled || uploading || remaining <= 0}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading || remaining <= 0}
          className={
            compact
              ? "text-xs font-semibold text-teal-700 hover:underline disabled:opacity-40 dark:text-teal-300"
              : "tm-img-upload__btn flex-1 sm:flex-none"
          }
        >
          {uploading ? (
            compact ? (
              "Uploading…"
            ) : (
              <>
                <Spinner />
                Uploading…
              </>
            )
          ) : compact ? (
            urls.length === 0 ? "Add photos" : "Add more"
          ) : (
            <>
              <UploadIcon />
              {urls.length === 0 ? "Upload photos" : "Add more"}
            </>
          )}
        </button>
        {!compact && urls.length > 0 && remaining > 0 ? (
          <p className="self-center text-[11px] text-zinc-400">
            {remaining} more slot{remaining === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
