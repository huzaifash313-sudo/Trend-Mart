/* -------------------------------------------------------------------------- */
/*  TrendMart — Client-Side DOM Sanitization Pipeline (DOMPurify)               */
/*  PROMPT 3: Comprehensive client-side sanitization and output-encoding        */
/*           pipeline across all user-generated content injection vectors.      */
/* -------------------------------------------------------------------------- */

import DOMPurify from "dompurify";

// ─── DOMPurify Configuration ─────────────────────────────────────────────────

type Purifier = ReturnType<typeof DOMPurify>;

/**
 * Default DOMPurify configuration for TrendMart.
 * Intentionally restrictive: no scripts, iframes, objects, embeds,
 * forms, inputs, links, styles, or event handlers.
 */
const DEFAULT_ALLOWED_TAGS: string[] = [
  "b", "i", "em", "strong", "u", "s", "del", "ins",
  "sub", "sup", "mark", "small", "br", "span",
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "pre", "code",
  "ul", "ol", "li",
  "br", "hr",
];

/**
 * Extended tags for merchant bio (includes links and images).
 */
const MERCHANT_BIO_ALLOWED_TAGS: string[] = [
  ...DEFAULT_ALLOWED_TAGS,
  "a", "img",
];

/**
 * Create a singleton DOMPurify instance.
 * DOMPurify is a function that sets configuration and returns a sanitizer.
 * We call it once with default config to get a typed instance.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDefaultPurifier = ((): Purifier => DOMPurify as any)();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPurifier = (config?: Record<string, unknown>): any =>
  DOMPurify(config as any);

// ─── Core Sanitization Functions ─────────────────────────────────────────────

/**
 * Sanitize a plain-text string that may contain HTML.
 * Strips ALL HTML and returns clean text.
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== "string") return "";
  return createPurifier().sanitize(input, { ALLOWED_TAGS: [] });
}

/**
 * Sanitize rich-text content (reviews, product descriptions).
 * Preserves basic formatting (bold, italic, paragraphs).
 */
export function sanitizeRichText(html: string): string {
  if (!html || typeof html !== "string") return "";
  return createPurifier({ ALLOWED_TAGS: DEFAULT_ALLOWED_TAGS }).sanitize(html);
}

/**
 * Sanitize a merchant bio / store description.
 * Allows links and images in addition to basic formatting.
 */
export function sanitizeMerchantBio(html: string): string {
  if (!html || typeof html !== "string") return "";
  return createPurifier({
    ALLOWED_TAGS: MERCHANT_BIO_ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "width", "height", "loading"],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
  }).sanitize(html);
}

/**
 * Sanitize a URL for use in <a href="...">.
 * Blocks javascript:, data:, vbscript:, and file: protocols.
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();

  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return "";
  }

  if (!/^https?:\/\//i.test(trimmed) &&
      !trimmed.startsWith("/") &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("mailto:")) {
    return "";
  }

  return trimmed;
}

/**
 * Sanitize a search query string.
 * Strips HTML and collapses whitespace.
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query || typeof query !== "string") return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purifier = createPurifier();
  const noHtml = (purifier as { sanitize: (d: string, o?: Record<string, unknown>) => string })
    .sanitize(query, { ALLOWED_TAGS: [] });
  return noHtml.replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Sanitize a value for use in data attributes or JSON.
 */
export function sanitizeDataAttribute(value: string): string {
  if (!value || typeof value !== "string") return "";
  return sanitizeText(value).replace(/["'&<>]/g, "").slice(0, 256);
}

// ─── Output Encoding (Defense-in-Depth) ──────────────────────────────────────

/**
 * HTML-encode a string for safe insertion into HTML context.
 * Encodes: & < > " '
 */
export function encodeHtmlEntities(input: string): string {
  if (!input || typeof input !== "string") return "";
  const AMP = String.fromCharCode(38);
  const LT = String.fromCharCode(60);
  const GT = String.fromCharCode(62);
  const QUOT = String.fromCharCode(34);
  const APOS = "'";

  return input
    .split(AMP).join(AMP + "amp;")
    .split(LT).join(AMP + "lt;")
    .split(GT).join(AMP + "gt;")
    .split(QUOT).join(AMP + "quot;")
    .split(APOS).join(AMP + "#x27;");
}

/**
 * Encode for safe insertion into a JavaScript string literal.
 */
export function encodeJavaScriptString(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/[\x00-\x1F]/g, "");
}

/**
 * Encode for safe insertion into a URL query parameter.
 */
export function encodeUriComponent(input: string): string {
  if (!input || typeof input !== "string") return "";
  return encodeURIComponent(input);
}

// ─── React-Specific Utilities ────────────────────────────────────────────────

/**
 * Safe HTML rendering wrapper for dangerouslySetInnerHTML.
 *
 * @example
 * ```tsx
 * <div {...safeHtml(review.comment, "review")} />
 * ```
 */
export function safeHtml(
  html: string | null | undefined,
  context: "review" | "description" | "bio" | "announcement" | "title" = "review",
): { dangerouslySetInnerHTML: { __html: string } } | Record<string, never> {
  if (!html) return {};

  let sanitized: string;
  switch (context) {
    case "bio":
    case "announcement":
      sanitized = sanitizeMerchantBio(html);
      break;
    case "description":
      sanitized = sanitizeRichText(html);
      break;
    case "review":
    case "title":
    default:
      sanitized = sanitizeText(html);
      break;
  }

  if (!sanitized) return {};
  return { dangerouslySetInnerHTML: { __html: sanitized } };
}

/**
 * Strip all HTML and return plain text, with optional truncation.
 */
export function htmlToPlainText(html: string, maxLength: number = 150): string {
  if (!html) return "";
  const plain = sanitizeText(html);
  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength - 3).trimEnd() + "...";
}

// ─── Batch Sanitization ──────────────────────────────────────────────────────

/**
 * Recursively sanitize all string values in an object.
 */
export function sanitizeObjectStrings<T extends Record<string, unknown>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      if (key.includes("bio") || key.includes("announcement")) {
        cleaned[key] = sanitizeMerchantBio(value);
      } else if (key.includes("description") || key.includes("comment")) {
        cleaned[key] = sanitizeRichText(value);
      } else if (key.includes("url") || key.includes("href")) {
        cleaned[key] = sanitizeUrl(value);
      } else {
        cleaned[key] = sanitizeText(value);
      }
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map((item) =>
        typeof item === "string" ? sanitizeText(item) : item,
      );
    } else if (value && typeof value === "object") {
      cleaned[key] = sanitizeObjectStrings(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned as T;
}

// ─── XSS Detection (Monitoring) ──────────────────────────────────────────────

/**
 * Check if a string contains potential XSS payloads.
 * Returns an array of detected patterns (empty = safe).
 */
export function detectXssPatterns(input: string): string[] {
  if (!input || typeof input !== "string") return [];

  const detected: string[] = [];
  const patterns: Array<{ name: string; regex: RegExp }> = [
    { name: "script_tag", regex: /<script\b/i },
    { name: "event_handler", regex: /\bon\w+\s*=/i },
    { name: "javascript_protocol", regex: /javascript\s*:/i },
    { name: "data_uri_html", regex: /data\s*:\s*text\/html/i },
    { name: "vbscript", regex: /vbscript\s*:/i },
    { name: "eval_expression", regex: /\beval\s*\(/i },
    { name: "document_cookie", regex: /document\s*\.\s*cookie/i },
    { name: "innerHTML", regex: /\.innerHTML\s*=/i },
    { name: "iframe", regex: /<iframe\b/i },
    { name: "object_embed", regex: /<(object|embed)\b/i },
    { name: "base64_encoded", regex: /atob\s*\(/i },
    { name: "expression_css", regex: /expression\s*\(/i },
  ];

  for (const { name, regex } of patterns) {
    if (regex.test(input)) {
      detected.push(name);
    }
  }

  return detected;
}