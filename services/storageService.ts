/* -------------------------------------------------------------------------- */
/*  TrendMart — Storage Service                                               */
/*  Client-side image validation, optimisation & fallback handling before      */
/*  uploading files to Supabase Storage.                                       */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError, toServiceError } from "@/services/errorService";
import { sanitizePathSegment } from "@/lib/sanitization";
import {
  isCloudinaryClientConfigured,
  uploadToCloudinary,
  extractCloudinaryPublicId,
  withAutoFormat,
} from "@/lib/cloudinary";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return toServiceError(err);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BUCKET_NAME = "trendmart-media";

/**
 * Maximum allowed image file size in bytes (20 MB).
 * Deliberately generous: iPhone / DSLR photos often arrive at 10–20 MB. The
 * size is fine because every upload is compressed to WebP (~160 KB) before
 * it ever reaches Cloudinary / Supabase.
 */
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

/** Allowed image MIME types for upload (HEIC included — iPhone cameras). */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
] as const;

/** Corresponding file extensions mapped to MIME types. */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Upload timeout in milliseconds (30 seconds). */
const UPLOAD_TIMEOUT_MS = 30_000;

/** Maximum filename length before truncation. */
const MAX_FILENAME_LENGTH = 120;

// ─── Filename Sanitization ───────────────────────────────────────────────────

/**
 * Sanitize a filename for safe storage in Supabase using the shared utility.
 *
 * - Strips path traversal sequences (../)
 * - Removes control characters and null bytes
 * - Replaces non-alphanumeric characters (except `.`, `-`, `_`) with hyphens
 * - Collapses multiple hyphens into a single one
 * - Truncates to MAX_FILENAME_LENGTH before the extension
 * - Prefixes with a short random string to avoid collisions
 */
function sanitizeFilename(raw: string): string {
  const dotIndex = raw.lastIndexOf(".");
  const name = dotIndex > 0 ? raw.slice(0, dotIndex) : raw;
  const ext = dotIndex > 0 ? raw.slice(dotIndex).toLowerCase() : "";

  // Use the shared sanitization utility for the base name
  let safe = sanitizePathSegment(name, MAX_FILENAME_LENGTH).toLowerCase();

  // If sanitization leaves an empty string, use a fallback
  if (!safe) safe = "image";

  // Add a short random suffix to avoid collisions
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${safe}_${randomSuffix}${ext}`;
}

// ─── Fallback Placeholders ───────────────────────────────────────────────────

// Inline SVG placeholder images encoded as data URIs. These are tiny (< 1 KB),
// self-contained, and guarantee zero broken image links on storefronts.

const SHOP_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
  <rect fill="%23f3f4f6" width="400" height="200"/>
  <text fill="%239ca3af" font-family="Arial,sans-serif" font-size="16" text-anchor="middle" x="200" y="105">
    Shop Banner
  </text>
</svg>`;

const PRODUCT_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect fill="%23f3f4f6" width="300" height="300"/>
  <text fill="%239ca3af" font-family="Arial,sans-serif" font-size="14" text-anchor="middle" x="150" y="155">
    Product Image
  </text>
</svg>`;

const GENERIC_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect fill="%23f3f4f6" width="300" height="300"/>
  <text fill="%239ca3af" font-family="Arial,sans-serif" font-size="14" text-anchor="middle" x="150" y="155">
    Image Unavailable
  </text>
</svg>`;

/**
 * Encode an SVG string as a data URI safe for use in an `<img src>`.
 * The SVG is already pre-encoded (all `#` replaced with `%23`), so we
 * only need to strip excess whitespace and wrap with the data URI prefix.
 */
function svgToDataUri(svg: string): string {
  const encoded = svg.replace(/\s+/g, " ").trim();
  return `data:image/svg+xml,${encoded}`;
}

/** Publicly-accessible fallback URLs (data URIs). */
export const FALLBACK_URLS = {
  shop: svgToDataUri(SHOP_FALLBACK_SVG),
  product: svgToDataUri(PRODUCT_FALLBACK_SVG),
  generic: svgToDataUri(GENERIC_FALLBACK_SVG),
} as const;

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Result returned by `validateImage` — enumerates every possible failure mode
 * so the UI can show precise, user-friendly feedback.
 */
export interface ImageValidationResult {
  valid: boolean;
  /** Human-readable error code. */
  error?:
    | "file_too_large"
    | "unsupported_format"
    | "not_an_image"
    | "empty_file";
  /** Detailed message suitable for toasts. */
  message?: string;
  /** The validated file (only defined when `valid === true`). */
  file?: File;
}

/**
 * Validate an image file against size and format constraints.
 * Returns a structured result so callers can decide how to surface errors.
 */
export function validateImage(file: File | null | undefined): ImageValidationResult {
  if (!file) {
    return { valid: false, error: "empty_file", message: "No file selected." };
  }

  if (file.size === 0) {
    return { valid: false, error: "empty_file", message: "The selected file is empty." };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: "file_too_large",
      message: `File size (${sizeMB} MB) exceeds the 20 MB limit. Please compress or choose a smaller image.`,
    };
  }

  if (!file.type.startsWith("image/")) {
    return {
      valid: false,
      error: "not_an_image",
      message: "Only image files can be uploaded.",
    };
  }

  const allowed = ALLOWED_IMAGE_TYPES as readonly string[];
  if (!allowed.includes(file.type)) {
    const formats = allowed
      .map((t) => t.replace("image/", "").toUpperCase())
      .join(", ");
    return {
      valid: false,
      error: "unsupported_format",
      message: `Unsupported format. Allowed formats: ${formats}.`,
    };
  }

  return { valid: true, file };
}

// ─── Client-side compression (WebP / JPEG) ───────────────────────────────────

/**
 * Quality profile:
 * - MAX_EDGE 1600px keeps photos sharp even on retina / full-screen product
 *   views (a phone screen is ~1500 physical pixels wide).
 * - Target ~160KB + min quality 0.65 keeps uploads light enough that Cloudinary's
 *   free tier (25GB) comfortably stores tens of thousands of images.
 */
const COMPRESS_MAX_EDGE = 1600;
const COMPRESS_TARGET_BYTES = 160 * 1024;
const COMPRESS_MIN_QUALITY = 0.65;
const COMPRESS_START_QUALITY = 0.85;

/**
 * Overridable compression knobs for `compressImageForUpload` / `uploadImage`.
 * Defaults keep product photos ~160 KB for the Cloudinary free tier, but
 * promotional ad banners are few in number and get shown LARGE on the
 * homepage — so they deliberately skip the aggressive compression that
 * makes small cards look soft/blurry.
 */
export interface CompressionOptions {
  maxEdge?: number;
  targetBytes?: number;
  minQuality?: number;
  startQuality?: number;
}

/** Banner-grade profile: up to 2560px wide, ~640 KB budget, floor q0.82. */
export const BANNER_UPLOAD_OPTIONS: CompressionOptions = {
  maxEdge: 2560,
  targetBytes: 640 * 1024,
  minQuality: 0.82,
  startQuality: 0.92,
};

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image for compression."));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Compress + convert to WebP (JPEG fallback) before upload.
 * Keeps visual quality high while shrinking typical phone photos to ~80–140 KB.
 */
export async function compressImageForUpload(
  file: File,
  options: CompressionOptions = {},
): Promise<File> {
  if (typeof window === "undefined") return file;
  // Already tiny — skip work
  if (file.size > 0 && file.size <= 48 * 1024) return file;

  const maxEdge = options.maxEdge ?? COMPRESS_MAX_EDGE;
  const targetBytes = options.targetBytes ?? COMPRESS_TARGET_BYTES;
  const minQuality = options.minQuality ?? COMPRESS_MIN_QUALITY;
  const startQuality = options.startQuality ?? COMPRESS_START_QUALITY;

  try {
    const img = await loadImageElement(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, tw, th);

    const preferWebp = canvas.toDataURL("image/webp").startsWith("data:image/webp");
    const mime = preferWebp ? "image/webp" : "image/jpeg";
    const ext = preferWebp ? "webp" : "jpg";

    let quality = startQuality;
    let best: Blob | null = await canvasToBlob(canvas, mime, quality);

    while (
      best &&
      best.size > targetBytes &&
      quality > minQuality
    ) {
      quality = Math.max(minQuality, quality - 0.08);
      const next = await canvasToBlob(canvas, mime, quality);
      if (!next) break;
      best = next;
    }

    if (!best || best.size === 0) return file;
    // Don't upload a "compressed" file that somehow got larger
    if (best.size >= file.size && file.type.startsWith("image/")) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([best], `${base}.${ext}`, {
      type: mime,
      lastModified: Date.now(),
    });
  } catch (err) {
    logError(err, { module: "storageService.compressImageForUpload" });
    return file;
  }
}

// ─── Upload ──────────────────────────────────────────────────────────────────

/**
 * Upload an image file to Cloudinary (global CDN + auto-optimized delivery),
 * falling back to Supabase Storage when Cloudinary is not configured or the
 * upload fails. The returned URL is what gets persisted in the DB.
 *
 * Existing images already stored in Supabase Storage keep working untouched —
 * their old URLs in the DB still render, so nothing is lost during the switch.
 *
 * @param file      The File object from an <input type="file"> picker.
 * @param folder    Subfolder for the asset (e.g. "shops" or "products").
 * @param fileId    Unique identifier used in the storage path.
 * @param options   Optional compression overrides. Defaults to banner-grade
 *                  compression when `folder === "ads"`.
 * @returns         The public URL of the uploaded file, OR a fallback placeholder URL.
 */
export async function uploadImage(
  file: File,
  folder: string,
  fileId: string,
  options?: CompressionOptions,
): Promise<ServiceResult<string>> {
  const supabase = createClient();

  // Determine which fallback to use based on folder context
  const fallbackUrl =
    folder === "shops" || folder === "shop_banners"
      ? FALLBACK_URLS.shop
      : folder === "products"
        ? FALLBACK_URLS.product
        : FALLBACK_URLS.generic;

  // Validate before uploading
  const validation = validateImage(file);
  if (!validation.valid) {
    return { success: false, error: validation.message ?? "Invalid image file." };
  }

  let optimized: File = file;
  try {
    // Ad banners are shown large on the homepage, so they always skip the
    // aggressive product-photo compression (unless the caller overrides).
    const compressionOptions =
      options ?? (folder === "ads" ? BANNER_UPLOAD_OPTIONS : undefined);
    optimized = await compressImageForUpload(file, compressionOptions);
  } catch {
    /* non-fatal — upload the original file as-is */
  }

  // HEIC/HEIF that the browser could NOT decode (e.g. iPhone photos picked on
  // desktop Chrome) pass through untouched. Cloudinary will serve them fine,
  // so we ask the CDN to auto-format for the viewing browser.
  const heicPassthrough =
    optimized.type === "image/heic" || optimized.type === "image/heif";

  // ── Primary: Cloudinary (unsigned preset, client-safe) ─────────────────
  // If Cloudinary is configured and the upload succeeds, store the CDN URL.
  if (isCloudinaryClientConfigured()) {
    const cloudinaryUrl = await uploadToCloudinary(optimized, folder);
    if (cloudinaryUrl) {
      return {
        success: true,
        data: heicPassthrough ? withAutoFormat(cloudinaryUrl) : cloudinaryUrl,
      };
    }
    // Cloudinary unavailable / failed → silently fall back to Supabase so the
    // merchant's upload never breaks.
    logError("Cloudinary upload failed — falling back to Supabase Storage.", {
      module: "storageService.uploadImage",
      meta: { folder, fileId, fileName: file.name },
    });
  }

  // ── Fallback: Supabase Storage (previous behavior) ─────────────────────
  try {
    // Sanitize the original filename to create a safe storage path
    const extension =
      MIME_TO_EXT[optimized.type] ??
      optimized.name.split(".").pop()?.toLowerCase() ??
      "jpg";
    const sanitizedBase = sanitizeFilename(optimized.name.replace(/\.[^.]+$/, ""));
    // Build path: folder/fileId_sanitizedName_timestamp.extension
    const safeName = `${folder}/${fileId}_${sanitizedBase}_${Date.now()}.${extension}`;

    // Race the upload against a timeout
    const uploadPromise = supabase.storage
      .from(BUCKET_NAME)
      .upload(safeName, optimized, {
        cacheControl: "31536000", // 1 year
        contentType: optimized.type || file.type,
        upsert: true, // Allow overwriting if the same path is re-used
      });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Upload timed out after 30 seconds.")),
        UPLOAD_TIMEOUT_MS,
      ),
    );

    const { error } = await Promise.race([uploadPromise, timeoutPromise]);

    if (error) throw error;

    // Get the public URL safely with try-catch for malformed paths
    const publicUrl = getPublicUrlSafe(safeName, fallbackUrl);

    return { success: true, data: publicUrl };
  } catch (err) {
    logError(err, {
      module: "storageService.uploadImage",
      meta: { folder, fileId, fileName: file.name, fileSize: file.size },
    });

    // Return error to caller — do NOT silently swallow with fallback
    return { success: false, error: toError(err) };
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

/**
 * Delete an image by its stored URL or storage path.
 *
 * - Cloudinary CDN URL → deleted via the server-only delete route (keeps the
 *   API secret out of the browser). Best-effort — a failed delete never
 *   breaks the caller.
 * - Supabase Storage path (legacy images) → deleted from the bucket.
 *
 * @param pathOrUrl  The stored URL (cloudinary.com) or storage path (e.g. "shops/uuid.jpg").
 */
export async function deleteImage(pathOrUrl: string): Promise<ServiceResult<null>> {
  const supabase = createClient();

  // Cloudinary asset URL → route through the server-side signed delete.
  const publicId = extractCloudinaryPublicId(pathOrUrl);
  if (publicId) {
    try {
      await fetch("/api/cloudinary/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId }),
      });
    } catch {
      /* best-effort — orphan cleanup can be retried later */
    }
    return { success: true, data: null };
  }

  // Legacy Supabase Storage path.
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([pathOrUrl]);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "storageService.deleteImage", meta: { path: pathOrUrl } });
    return { success: false, error: toError(err) };
  }
}

// ─── URL Helpers ─────────────────────────────────────────────────────────────

/**
 * Safely generate a public URL from a Supabase Storage path.
 *
 * Wraps `supabase.storage.from().getPublicUrl()` in a try-catch so that
 * malformed or missing paths never throw — a fallback is returned instead.
 *
 * @param path        The storage path (e.g. "shops/uuid.jpg").
 * @param fallbackUrl The fallback data URI to return if URL generation fails.
 */
export function getPublicUrlSafe(path: string, fallbackUrl: string): string {
  try {
    const supabase = createClient();
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

    if (!publicUrl || publicUrl.trim() === "") {
      return fallbackUrl;
    }

    return publicUrl;
  } catch (err) {
    logError(err, { module: "storageService.getPublicUrlSafe", meta: { path } });
    return fallbackUrl;
  }
}

/**
 * Extract the storage path from a Supabase public URL.
 *
 * Example:
 * "https://xxx.supabase.co/storage/v1/object/public/trendmart-media/shops/uuid.jpg"
 * → "shops/uuid.jpg"
 */
export function extractPathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/");
    const bucketIdx = segments.indexOf("trendmart-media");
    if (bucketIdx === -1) return null;
    return segments.slice(bucketIdx + 1).join("/");
  } catch {
    return null;
  }
}

/**
 * Return a reliable image URL, falling back to a placeholder if the provided
 * URL is empty, null, undefined, or a data URI (already a fallback).
 *
 * Use this in `<img src={getSafeImageUrl(url, "product")} />` components.
 *
 * **Important:** This only catches null/empty URLs synchronously.
 * For runtime loading failures (404s, network errors), use `onError`
 * on the `<img>` element in combination with this function.
 */
export function getSafeImageUrl(
  url: string | null | undefined,
  fallbackType: "shop" | "product" | "generic" = "generic",
): string {
  if (!url || url.trim() === "") {
    return FALLBACK_URLS[fallbackType];
  }
  return url;
}

/**
 * Check whether a URL is a data URI fallback (produced by this service).
 * Useful for determining if an image is a placeholder vs. a real upload.
 */
export function isFallbackUrl(url: string): boolean {
  return url.startsWith("data:image/svg+xml,");
}