/* -------------------------------------------------------------------------- */
/*  TrendMart — Cloudinary Image Engine                                        */
/*                                                                             */
/*  Images uploaded by merchants/customers go to Cloudinary (global CDN +     */
/*  auto-optimized delivery) with the URL stored in the DB. Existing images    */
/*  already sitting in Supabase Storage keep working untouched — they are      */
/*  still rendered from their old URLs.                                        */
/*                                                                             */
/*  Client side: unsigned upload preset (public key only — safe for browsers). */
/*  Server side: signed delete using the API secret (never exposed to client). */
/* -------------------------------------------------------------------------- */

/** Public cloud name + unsigned upload preset — required for client uploads. */
export function isCloudinaryClientConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
  );
}

/**
 * Upload an already-optimized image file to Cloudinary using the unsigned
 * upload preset. Returns the secure CDN URL, or null on any failure so the
 * caller can fall back to Supabase Storage without breaking the flow.
 */
export async function uploadToCloudinary(
  file: File | Blob,
  folder: string,
): Promise<string | null> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !preset) return null;

  try {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", preset);
    if (folder) form.append("folder", folder);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: form },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { secure_url?: string };
    return json.secure_url ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract the Cloudinary public_id from a res.cloudinary.com URL.
 * Example: .../image/upload/v1234567890/shops/abc.webp → "shops/abc"
 * Returns null when the URL is not a Cloudinary asset URL.
 */
export function extractCloudinaryPublicId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("cloudinary.com")) return null;
    const segments = parsed.pathname.split("/");
    const uploadIdx = segments.indexOf("upload");
    if (uploadIdx === -1) return null;
    let rest = segments.slice(uploadIdx + 1);
    // Drop the version segment (e.g. v1712345678) if present.
    if (rest.length > 0 && /^v\d+$/.test(rest[0]!)) rest = rest.slice(1);
    if (rest.length === 0) return null;
    const last = rest[rest.length - 1]!;
    rest[rest.length - 1] = last.replace(/\.[^.]+$/, "");
    return rest.join("/");
  } catch {
    return null;
  }
}

/**
 * Insert an `f_auto` transformation into a Cloudinary URL so the CDN serves
 * the best browser-compatible format (WebP/AVIF/JPEG) even when the stored
 * asset is HEIC/HEIF that some browsers cannot decode.
 *
 * Only applied to assets that were NOT already client-compressed (HEIC/HEIF
 * passthrough) — already-optimized WebP images keep their exact bytes.
 */
export function withAutoFormat(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("cloudinary.com")) return url;
    const parts = parsed.pathname.split("/");
    const uploadIdx = parts.indexOf("upload");
    if (uploadIdx === -1) return url;
    const before = parts.slice(0, uploadIdx + 1);
    const after = parts.slice(uploadIdx + 1);
    if (after[0] === "f_auto") return url; // already optimized
    parsed.pathname = [...before, "f_auto", ...after].join("/");
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Server-only: delete an asset from Cloudinary using a signed API call.
 * Runs in an API route so the API secret never reaches the browser.
 */
export async function destroyCloudinaryAsset(
  publicId: string,
): Promise<boolean> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return false;

  try {
    const timestamp = Math.round(Date.now() / 1000).toString();
    const crypto = await import("crypto");
    const signature = crypto
      .createHash("sha1")
      .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");

    const params = new URLSearchParams({
      public_id: publicId,
      timestamp,
      api_key: apiKey,
      signature,
    });

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      { method: "POST", body: params },
    );
    if (!res.ok) return false;
    const json = (await res.json()) as { result?: string };
    return json.result === "ok" || json.result === "not found";
  } catch {
    return false;
  }
}
