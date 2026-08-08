/* -------------------------------------------------------------------------- */
/*  TrendMart — Storage Service                                               */
/*  Client-side image validation, optimisation & fallback handling before      */
/*  uploading files to Supabase Storage.                                       */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError, toServiceError } from "@/services/errorService";
import {
  sanitizePathSegment,
  sanitizeLight,
  truncate,
} from "@/lib/sanitization";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return toServiceError(err);
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Allowed storage bucket names — prevents bucket-swapping attacks. */
const ALLOWED_BUCKETS = ["trendmart-media", "images", "shop-assets"] as const;

const BUCKET_NAME = "trendmart-media";

/** Maximum allowed image file size in bytes (5 MB). */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Allowed image MIME types for upload. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** Corresponding file extensions mapped to MIME types. */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** Valid file extension mappings per MIME type (for extension sniffing). */
const MIME_EXTENSION_MAP: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg", "jfif"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
};

/** Upload timeout in milliseconds (30 seconds). */
const UPLOAD_TIMEOUT_MS = 30_000;

/** Maximum filename length before truncation. */
const MAX_FILENAME_LENGTH = 120;

// ─── Bucket Validation ──────────────────────────────────────────────────────

/**
 * Validate that a bucket name is in the allowed list.
 * Prevents bucket enumeration / bucket-swapping attacks.
 */
function validateBucketName(bucket: string): string {
  const safe = sanitizePathSegment(bucket, 30).toLowerCase();
  if (!(ALLOWED_BUCKETS as readonly string[]).includes(safe)) {
    logError(`Blocked access to unauthorized bucket: ${bucket}`, {
      module: "storageService.validateBucketName",
    });
    return BUCKET_NAME; // Fallback to default
  }
  return safe;
}

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
      message: `File size (${sizeMB} MB) exceeds the 5 MB limit. Please compress or choose a smaller image.`,
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

// ─── Upload ──────────────────────────────────────────────────────────────────

/**
 * Upload an image file to Supabase Storage with a timeout and fallback URL.
 *
 * If the upload fails or times out, the returned URL will be a data-URI
 * fallback placeholder so the UI never displays a broken image link.
 *
 * @param file      The File object from an <input type="file"> picker.
 * @param folder    Subfolder inside the bucket (e.g. "shops" or "products").
 * @param fileId    Unique identifier prepended to the filename (e.g. shop id).
 * @returns         The public URL of the uploaded file, OR a fallback placeholder URL.
 */
export async function uploadImage(
  file: File,
  folder: string,
  fileId: string,
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

  try {
    // Sanitize the original filename to create a safe storage path
    const extension = MIME_TO_EXT[file.type] ?? file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const sanitizedBase = sanitizeFilename(file.name.replace(/\.[^.]+$/, ""));
    // Build path: folder/fileId_sanitizedName_timestamp.extension
    const safeName = `${folder}/${fileId}_${sanitizedBase}_${Date.now()}.${extension}`;

    // Race the upload against a timeout
    const uploadPromise = supabase.storage
      .from(BUCKET_NAME)
      .upload(safeName, file, {
        cacheControl: "31536000", // 1 year
        contentType: file.type,
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
 * Delete a file from Supabase Storage by its full path.
 *
 * @param path  The full path inside the bucket (e.g. "shops/uuid_1234.jpg").
 */
export async function deleteImage(path: string): Promise<ServiceResult<null>> {
  const supabase = createClient();

  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([path]);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "storageService.deleteImage", meta: { path } });
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