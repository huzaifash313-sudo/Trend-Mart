/* -------------------------------------------------------------------------- */
/*  TrendMart — Short product link codes                                       */
/*                                                                            */
/*  Generates compact, URL-safe codes used for direct product deep links       */
/*  (e.g. `https://…/p/AbCd1234`) instead of long `shop/{slug}#product-{uuid}` */
/*  links in WhatsApp order messages.                                          */
/* -------------------------------------------------------------------------- */

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const SHORT_CODE_RE = /^[0-9A-Za-z_-]{1,32}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generate a cryptographically random, URL-safe short code.
 * 8 chars over a 62-char alphabet ≈ 2.18e14 combinations — collisions are
 * negligible for a local marketplace, and callers retry on unique-violation.
 */
export function generateProductShortCode(length = 8): string {
  let code = "";
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) code += ALPHABET[bytes[i] % 62];
  } else {
    for (let i = 0; i < length; i++) {
      code += ALPHABET[Math.floor(Math.random() * 62)];
    }
  }
  return code;
}

/** True when a value looks like a valid product short code (URL-safe). */
export function isShortCode(value: string): boolean {
  return SHORT_CODE_RE.test(value);
}

/** True when a value looks like a product UUID (used to disambiguate routes). */
export function looksLikeProductUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Build the internal path for a direct product page.
 * Falls back to the full product id when no short code is available yet.
 */
export function getProductShortPath(codeOrId: string | null | undefined): string {
  const c = (codeOrId ?? "").trim();
  if (!c) return "";
  return `/p/${encodeURIComponent(c)}`;
}
