/* -------------------------------------------------------------------------- */
/*  TrendMart — Shared Input Sanitization & Validation Utilities               */
/*  Used across all services to prevent XSS, SQL injection, CSV injection,     */
/*  and path traversal attacks.                                                */
/* -------------------------------------------------------------------------- */

// ─── XSS / HTML Sanitization ────────────────────────────────────────────────

/**
 * Strip all HTML tags, script blocks, and event handlers from a string.
 * Returns a plain-text string safe for rendering in HTML contexts.
 *
 * IMPORTANT: This is a defense-in-depth measure. It does NOT replace
 * framework-level escaping (React does this automatically for JSX).
 * Use this ONLY for data that will be stored/displayed in non-React contexts
 * (e.g., localStorage, CSV exports, plain-text emails).
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*"'[^']*"'/gi, "")
    .trim();
}

/**
 * Lightweight sanitization: remove angle brackets and script-related
 * substrings. Suitable for short fields like names and phone numbers.
 */
export function sanitizeLight(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .trim();
}

// ─── SQL Injection Prevention ──────────────────────────────────────────────

/**
 * Remove characters commonly used in SQL injection payloads from a
 * plain-text search query. This does NOT replace proper parameterization
 * (which Supabase does automatically), but serves as defense-in-depth
 * for dynamic ILIKE/tsquery patterns.
 */
export function sanitizeSqlLiteral(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/['"\\;]/g, "")      // Quotes, backslash, semicolons
    .replace(/--/g, "")            // SQL comment
    .replace(/\/\*/g, "")          // Block comment start
    .replace(/\*\//g, "")          // Block comment end
    .replace(/\\x[0-9a-fA-F]{2}/g, "") // Hex-encoded characters
    .replace(/\\u[0-9a-fA-F]{4}/g, "") // Unicode escape sequences
    .trim();
}

/**
 * Sanitize a value for use in ILIKE patterns.
 * Escapes LIKE wildcards (% and _) which are the only meta-characters
 * that could cause unintended broad matches (not SQL injection per se,
 * but could be used for denial-of-service via overly broad patterns).
 */
export function sanitizeIlikePattern(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input.replace(/[%_]/g, "\\$&").trim();
}

// ─── CSV Injection Prevention ──────────────────────────────────────────────

/**
 * Escape a CSV field value to prevent CSV/Formula injection attacks.
 *
 * If a field starts with =, +, -, or @, it can be interpreted as a formula
 * by Excel or Google Sheets. We prefix such fields with a single quote (')
 * which forces spreadsheet applications to treat the value as literal text.
 *
 * Also handles double-quote escaping and newline containment.
 */
export function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) return "";

  let str = String(value);

  // Prevent CSV formula injection: if the field starts with a formula
  // trigger character (=, +, -, @, |), prefix with a single quote which
  // tells spreadsheet applications to treat the cell as text, not a formula.
  if (/^[=+\-@|\t\r]/.test(str)) {
    str = "'" + str;
  }

  // Escape double quotes by doubling them (CSV standard)
  const needsQuotes =
    str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r");

  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Build a complete CSV row string from an array of field values.
 * Each value is escaped against formula injection and CSV corruption.
 */
export function buildCSVRow(fields: unknown[]): string {
  return fields.map(escapeCSVField).join(",");
}

/**
 * Build a complete CSV document from headers and data rows.
 */
export function buildCSVDocument(headers: string[], rows: unknown[][]): string {
  const headerLine = buildCSVRow(headers);
  const dataLines = rows.map(buildCSVRow);
  return [headerLine, ...dataLines].join("\n");
}

// ─── Path / Filename Sanitization ──────────────────────────────────────────

/**
 * Sanitize a filename or storage path segment.
 * - Removes path traversal sequences (../, ..\\)
 * - Removes null bytes
 * - Replaces non-alphanumeric chars (except ., -, _) with hyphens
 * - Collapses multiple hyphens
 * - Truncates to maxLength
 */
export function sanitizePathSegment(input: string, maxLength: number = 120): string {
  if (!input || typeof input !== "string") return "file";

  let safe = input
    .replace(/\.\.+[\/\\]/g, "")  // Path traversal: ../, ..\\, .../
    .replace(/[\x00-\x1f]/g, "")  // Control characters including null byte
    .replace(/[<>:"|?*\\]/g, "-") // Windows/reserved filename chars
    .replace(/[^a-zA-Z0-9\-_.]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, maxLength);

  if (!safe) safe = "file";
  return safe;
}

/**
 * Validate that a string is a valid UUID (v4 format).
 * Returns true if the string matches UUID pattern.
 */
export function isValidUUID(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ─── Phone Number Sanitization ─────────────────────────────────────────────

/**
 * Sanitize a phone number by keeping only digits and the leading +.
 * Strips all other characters (spaces, dashes, parentheses, etc.).
 */
export function sanitizePhone(input: string): string {
  if (!input || typeof input !== "string") return "";
  // Keep + if it's at the start, keep digits everywhere
  const hasPlus = input.trim().startsWith("+");
  const digits = input.replace(/\D/g, "");
  return hasPlus && digits.length > 0 ? `+${digits}` : digits;
}

/**
 * Normalize a Pakistani (or already-international) mobile to digits for
 * storage / WhatsApp (`wa.me`), without a leading +.
 * Examples: 03001234567 → 923001234567, 3001234567 → 923001234567
 */
export function normalizePkPhoneDigits(
  input: string,
  defaultCountryCode = "92",
): string {
  if (!input || typeof input !== "string") return "";
  let digits = input.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("0") && digits.length >= 10) {
    digits = `${defaultCountryCode}${digits.slice(1)}`;
  } else if (
    digits.length === 10 &&
    digits.startsWith("3") &&
    !digits.startsWith(defaultCountryCode)
  ) {
    digits = `${defaultCountryCode}${digits}`;
  }

  if (digits.length < 10 || digits.length > 15) return "";
  return digits;
}

/**
 * Digits suitable for `https://wa.me/{digits}` links.
 */
export function toWhatsAppDigits(input: string): string {
  return normalizePkPhoneDigits(input);
}

/**
 * Validates and sanitizes a phone number for storage.
 * Returns digits (or +digits when input used international + form).
 */
export function sanitizeAndValidatePhone(input: string): string {
  if (!input || typeof input !== "string") return "";
  const hasPlus = input.trim().startsWith("+");
  const digits = normalizePkPhoneDigits(input);
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

// ─── Category / Enum Validation ────────────────────────────────────────────

/**
 * Check if a string is a valid member of a union type / enum.
 * Returns the value as the expected type if valid, or the default value.
 */
export function validateEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  defaultValue: T,
): T {
  if (!value || typeof value !== "string") return defaultValue;
  return (allowed as readonly string[]).includes(value) ? (value as T) : defaultValue;
}

// ─── Numeric Sanitization ──────────────────────────────────────────────────

/**
 * Ensure a value is a safe finite number within min/max bounds.
 */
export function sanitizeNumeric(
  value: unknown,
  min: number = Number.MIN_SAFE_INTEGER,
  max: number = Number.MAX_SAFE_INTEGER,
  fallback: number = 0,
): number {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

// ─── String Truncation ─────────────────────────────────────────────────────

/**
 * Truncate a string to maxLength, appending nothing.
 * Use before storage to prevent abuse of unlimited-length fields.
 */
export function truncate(input: string, maxLength: number): string {
  if (!input || typeof input !== "string") return "";
  return input.slice(0, maxLength).trim();
}

// ─── Image URL Validation & Sanitization ───────────────────────────────────

/**
 * Allowed URL protocols for image sources.
 * Only https: and data: are permitted — http: is explicitly blocked
 * to prevent mixed-content warnings and MITM injection attacks.
 */
const ALLOWED_IMAGE_PROTOCOLS = ["https:", "data:"] as const;

/**
 * Known-safe image hosting domains. Any URL not matching these patterns
 * (and not being a data: URI) is treated as untrusted and rejected.
 * Supabase storage domains are the only external sources allowed.
 */
const TRUSTED_IMAGE_HOST_PATTERNS = [
  /^.+\.supabase\.co$/i,       // Supabase storage
  /^.+\.supabase\.in$/i,       // Supabase India region
];

/**
 * Extensions considered safe for image URLs. Reject anything else
 * (e.g. .php, .exe, .html served from a compromised CDN).
 */
const VALID_IMAGE_EXTENSIONS = [
  ".jpg", ".jpeg", ".jfif",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".svg",
] as const;

/**
 * Validate that an image URL is safe to render in an <img> tag.
 *
 * Checks:
 *   1. Protocol is https: or data: (no http: mixed content)
 *   2. If external URL, hostname matches trusted Supabase patterns
 *   3. URL does not contain XSS vectors (javascript:, event handlers)
 *   4. URL length is within reasonable bounds (< 2KB)
 *   5. Path extension is a known image format (defense-in-depth)
 *
 * Returns the sanitized URL string if valid, or null if the URL is
 * potentially dangerous and should NOT be rendered.
 */
export function validateImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();
  if (trimmed.length === 0) return null;

  // Reject excessively long URLs (> 2KB) — could be data exfiltration
  if (trimmed.length > 2048) return null;

  // Block any URL containing script-ish patterns (XSS vectors)
  if (/[<>"'()]|javascript:|data\s*:|on\w+\s*=/i.test(trimmed)) {
    return null;
  }

  // Data URIs: validate they're image/* MIME type
  if (trimmed.startsWith("data:")) {
    // Must be data:image/... not data:text or data:application
    if (!/^data:image\/(svg\+xml|jpeg|png|webp|avif|gif)/i.test(trimmed)) {
      return null;
    }
    // Reject overly large data URIs (> 100KB for inline images)
    if (trimmed.length > 102_400) return null;
    return trimmed;
  }

  // Must be https: (block http: to prevent mixed content)
  if (trimmed.startsWith("http://")) return null;
  if (!trimmed.startsWith("https://")) return null;

  // Parse the URL safely
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null; // Malformed URL
  }

  // Enforce https protocol
  if (parsed.protocol !== "https:") return null;

  // Validate hostname against trusted patterns
  const isTrustedHost = TRUSTED_IMAGE_HOST_PATTERNS.some((pattern) =>
    pattern.test(parsed.hostname),
  );
  if (!isTrustedHost) return null;

  // Block authentication info in URL (user:pass@host — credential theft)
  if (parsed.username || parsed.password) return null;

  return parsed.href;
}

/**
 * Validate and sanitize an array of image URLs, returning only the safe ones.
 * Use this when processing product galleries or multi-image uploads.
 */
export function validateImageUrls(urls: (string | null | undefined)[]): string[] {
  if (!urls || !Array.isArray(urls)) return [];
  const safe: string[] = [];
  for (const url of urls) {
    const validated = validateImageUrl(url);
    if (validated) safe.push(validated);
  }
  return safe;
}

/**
 * Check whether a string could plausibly be a valid Supabase storage URL.
 * Lightweight check — does NOT validate the full URL, just checks the format.
 */
export function looksLikeSupabaseUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://")) return false;
  return (
    trimmed.includes("/storage/v1/object/public/") ||
    trimmed.includes("/storage/v1/object/sign/")
  );
}