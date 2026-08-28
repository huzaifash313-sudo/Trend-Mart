/* -------------------------------------------------------------------------- */
/*  TrendMart — High-Performance Image Optimization & CDN Compression Pipeline */
/*  Client-side compression, WebP conversion, thumbnail generation,            */
/*  file-size validation, and Supabase Storage bucket upload.                  */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { sanitizePathSegment } from "@/lib/sanitization";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const THUMBNAIL_WIDTH = 400;
const OPTIMAL_QUALITY = 0.82; // 82% WebP quality — excellent balance of size vs quality

export type UploadResult =
  | {
      success: true;
      url: string;
      thumbnail_url: string;
      original_size_kb: number;
      compressed_size_kb: number;
      format: string;
    }
  | {
      success: false;
      error: string;
    };

// ─── File Validation ──────────────────────────────────────────────────────────

export function validateImageFile(file: File): string | null {
  if (!file) return "No file provided.";

  // Strict MIME-type validation — only allow clean image formats (no GIF)
  if (!ALLOWED_MIME_TYPES.includes(file.type as AllowedMimeType)) {
    return `Unsupported file type "${file.type}". Accepted: JPEG, PNG, WebP, AVIF.`;
  }

  // Additional sniffing: verify the file extension matches the MIME type
  // This prevents files renamed with fake extensions
  const ext = file.name.split(".").pop()?.toLowerCase();
  const validExtensions: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg", "jfif"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/avif": ["avif"],
  };
  const allowedExts = validExtensions[file.type];
  if (allowedExts && ext && !allowedExts.includes(ext)) {
    return `File extension ".${ext}" does not match its detected type "${file.type}".`;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File size ${(file.size / (1024 * 1024)).toFixed(1)} MB exceeds the maximum of ${MAX_FILE_SIZE_MB} MB.`;
  }

  if (file.size === 0) {
    return "File is empty (0 bytes).";
  }

  // Check for null bytes in filename (path traversal indicator)
  if (file.name.includes("\x00") || file.name.includes("%00")) {
    return "Invalid filename.";
  }

  return null; // Valid
}

// ─── Image Loading Helper ─────────────────────────────────────────────────────

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to decode image."));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

// ─── Canvas-based WebP Compression ────────────────────────────────────────────

interface CompressResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

/**
 * Compress and convert an image to WebP format using Canvas API.
 * Also generates a thumbnail variant for responsive previews.
 */
async function compressToWebP(
  img: HTMLImageElement,
  quality: number = OPTIMAL_QUALITY,
  maxWidth: number = 1200,
): Promise<CompressResult> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available.");

  // Calculate output dimensions while maintaining aspect ratio
  let outputWidth = img.naturalWidth;
  let outputHeight = img.naturalHeight;

  if (outputWidth > maxWidth) {
    const ratio = maxWidth / outputWidth;
    outputWidth = maxWidth;
    outputHeight = Math.round(outputHeight * ratio);
  }

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  // Draw with white background for transparency-handling
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outputWidth, outputHeight);
  ctx.drawImage(img, 0, 0, outputWidth, outputHeight);

  // Convert to WebP blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Canvas toBlob conversion failed."));
      },
      "image/webp",
      quality,
    );
  });

  // Also get data URL for the thumbnail generator
  const dataUrl = canvas.toDataURL("image/webp", quality);

  return {
    blob,
    dataUrl,
    width: outputWidth,
    height: outputHeight,
    originalSize: img.naturalWidth * img.naturalHeight * 4, // rough byte estimate of original RGBA
    compressedSize: blob.size,
  };
}

/**
 * Generate a smaller thumbnail variant (400px wide).
 */
async function generateThumbnail(
  img: HTMLImageElement,
  quality: number = 0.75,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available.");

  let thumbWidth = THUMBNAIL_WIDTH;
  let thumbHeight = Math.round((THUMBNAIL_WIDTH / img.naturalWidth) * img.naturalHeight);

  if (thumbHeight > THUMBNAIL_WIDTH * 1.5) {
    thumbHeight = Math.round(THUMBNAIL_WIDTH * 1.5);
    thumbWidth = Math.round((img.naturalWidth / img.naturalHeight) * thumbHeight);
  }

  canvas.width = thumbWidth;
  canvas.height = thumbHeight;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, thumbWidth, thumbHeight);
  ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Thumbnail generation failed."));
      },
      "image/webp",
      quality,
    );
  });

  return blob;
}

// ─── Supabase Upload ──────────────────────────────────────────────────────────

/**
 * Upload a blob to Supabase Storage and return its public URL.
 */
async function uploadBlobToStorage(
  blob: Blob,
  bucket: string,
  filePath: string,
  contentType: string = "image/webp",
): Promise<string> {
  const supabase = createClient();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, blob, {
      cacheControl: "2592000", // 30-day cache
      contentType,
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return urlData.publicUrl;
}

// ─── Main Upload Pipeline ─────────────────────────────────────────────────────

export interface UploadOptions {
  file: File;
  folder: string;        // e.g., "products", "shops", "stories"
  fileId: string;        // unique identifier (product id, shop id, etc.)
  bucket?: string;       // Supabase bucket name (default: "images")
  maxWidth?: number;     // max output width (default: 1200)
  quality?: number;      // WebP quality 0-1 (default: 0.82)
}

/**
 * Complete image optimization pipeline:
 * 1. Validate the file
 * 2. Load into an Image element
 * 3. Compress & convert to WebP
 * 4. Generate thumbnail
 * 5. Upload both to Supabase Storage
 * 6. Return public URLs with size metrics
 */
export async function uploadOptimizedImage(
  options: UploadOptions,
): Promise<UploadResult> {
  try {
    const {
      file,
      folder,
      fileId,
      bucket = "images",
      maxWidth = 1200,
      quality = OPTIMAL_QUALITY,
    } = options;

    // 1. Validate
    const validationError = validateImageFile(file);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // 2. Load image
    const img = await loadImageFromFile(file);

    // 3. Compress & convert to WebP
    const compressed = await compressToWebP(img, quality, maxWidth);

    // 4. Generate thumbnail
    const thumbnail = await generateThumbnail(img);

    // 5. Generate unique filenames with full path sanitization
    const timestamp = Date.now();
    const safeFolder = sanitizePathSegment(folder, 50);
    const safeFileId = sanitizePathSegment(fileId, 80);
    const mainPath = `${safeFolder}/${safeFileId}-${timestamp}.webp`;
    const thumbPath = `${safeFolder}/${safeFileId}-${timestamp}-thumb.webp`;

    // 6. Upload main image and thumbnail in parallel
    const [mainUrl, thumbUrl] = await Promise.all([
      uploadBlobToStorage(compressed.blob, bucket, mainPath, "image/webp"),
      uploadBlobToStorage(thumbnail, bucket, thumbPath, "image/webp"),
    ]);

    return {
      success: true,
      url: mainUrl,
      thumbnail_url: thumbUrl,
      original_size_kb: Math.round(file.size / 1024),
      compressed_size_kb: Math.round(compressed.compressedSize / 1024),
      format: "webp",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image upload failed.";
    return { success: false, error: message };
  }
}

/**
 * Quick validation-only check (used in UI before starting the upload pipeline).
 * Returns null if valid, or an error string if invalid.
 */
export function quickValidate(file: File | null): string | null {
  if (!file) return "No file selected.";
  return validateImageFile(file);
}

/**
 * Validate a bucket name against the allowed storage bucket list.
 * Prevents bucket enumeration / bucket-swapping attacks.
 */
const ALLOWED_BUCKETS = ["images", "trendmart-media", "shop-assets"] as const;

export function validateBucket(bucket: string): string {
  const safe = sanitizePathSegment(bucket, 30);
  if (!(ALLOWED_BUCKETS as readonly string[]).includes(safe)) {
    return "images"; // Fallback to default bucket
  }
  return safe;
}

/**
 * Format a file size in KB to a human-readable string.
 */
export function formatFileSize(sizeKb: number): string {
  if (sizeKb < 1) return "< 1 KB";
  if (sizeKb < 1024) return `${sizeKb} KB`;
  return `${(sizeKb / 1024).toFixed(1)} MB`;
}

/**
 * Estimated upload time for a given file size at ~2 Mbps average mobile upload.
 * Pure client-side utility for progressive UX.
 */
export function estimateUploadTime(sizeBytes: number): string {
  const speedBps = 250_000; // ~2 Mbps realistic mobile upload
  const seconds = sizeBytes / speedBps;
  if (seconds < 1) return "< 1 sec";
  if (seconds < 60) return `~${Math.ceil(seconds)} sec`;
  return `~${Math.ceil(seconds / 60)} min`;
}

/**
 * Cache-busting URL helper: appends a version parameter to force CDN refresh.
 */
export function cacheBustUrl(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${Date.now()}`;
}