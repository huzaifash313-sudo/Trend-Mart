"use client";

import { useCallback, useRef, useState } from "react";
import { uploadImage, validateImage } from "@/services/storageService";
import { MAX_PRODUCT_IMAGES } from "@/lib/productImages";

/* -------------------------------------------------------------------------- */
/*  MultiImageUpload — clean multi-photo picker (products, deals).            */
/*                                                                             */
/*  A wrapping row of square thumbnails: tap the dashed "+" tile to pick       */
/*  photos (up to the max), tap a thumbnail to replace it, tap its ✕ to       */
/*  remove. The first photo is the cover. No verbose helper text.              */
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

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const TILE = "h-20 w-20";
const TILE_COMPACT = "h-12 w-12";

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

  // Tap a thumbnail to replace that specific photo.
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
    const id = `${fileIdPrefix}-replace-${Date.now()}`;
    const result = await uploadImage(file, folder, id);
    if (result.success) {
      const next = [...urls];
      next[index] = result.data;
      onChange(next);
    } else {
      setError(result.error);
    }
    setUploading(false);
  };

  const removeAt = (index: number) => {
    onChange(urls.filter((_, i) => i !== index));
  };

  const compact = variant === "compact";
  const tile = compact ? TILE_COMPACT : TILE;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          {label}
        </span>
        <span className="text-[0.65rem] text-zinc-400">
          {urls.length}/{maxImages}
        </span>
        {urls.length > 0 ? (
          <span className="text-[0.65rem] text-zinc-400">· tap a photo to change it</span>
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

      <div className={`flex flex-wrap items-start gap-2 ${compact ? "" : ""}`}>
        {urls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className={`group relative shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 ${tile} dark:border-zinc-700 dark:bg-zinc-800`}
          >
            <button
              type="button"
              onClick={() => openReplace(i)}
              disabled={disabled || uploading}
              className="h-full w-full cursor-pointer disabled:cursor-default"
              aria-label={`Change photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
            {i === 0 ? (
              <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-zinc-950/70 px-1 py-px text-[8px] font-semibold text-white">
                Cover
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => removeAt(i)}
              disabled={disabled || uploading}
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900/60 text-white opacity-0 transition-opacity hover:bg-zinc-900/90 group-hover:opacity-100 disabled:opacity-0"
              aria-label={`Remove photo ${i + 1}`}
            >
              <XIcon />
            </button>
          </div>
        ))}

        {remaining > 0 ? (
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
    </div>
  );
}
