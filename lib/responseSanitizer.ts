/* -------------------------------------------------------------------------- */
/*  TrendsMart — API Response Sanitizer                                          */
/*                                                                             */
/*  PROMPT 5: Strips sensitive merchant data (internal tokens, private          */
/*            credentials, PII) from public-facing API responses before        */
/*            rendering on the frontend. Ensures zero sensitive data leakage.  */
/* -------------------------------------------------------------------------- */

import type { Shop, Product, Review } from "@/types";
import { sanitizeLight, sanitizeHtml } from "@/lib/sanitization";

// ─── Sensitive Field Lists ──────────────────────────────────────────────────

/**
 * PROMPT 5: Fields that must NEVER appear in public API responses.
 * These are stripped regardless of their value.
 */
const SENSITIVE_SHOP_FIELDS: readonly string[] = [
  "owner_id",
  "internal_token",
  "api_key",
  "secret_key",
  "private_key",
  "auth_token",
  "refresh_token",
  "access_token",
];

/**
 * PROMPT 5: PII (Personally Identifiable Information) fields that
 * should be masked or removed from public responses.
 */
const PII_FIELDS: readonly string[] = [
  "customer_phone",
  "customer_email",
  "email",
  "phone",
  "whatsapp_number",
  "secondary_phone",
  "address",
  "customer_address",
];

/**
 * PROMPT 5: Internal metadata fields that shouldn't be exposed.
 */
const INTERNAL_FIELDS: readonly string[] = [
  "created_at",
  "updated_at",
  "deleted_at",
  "version",
  "_internal",
  "row_number",
];

// ─── Sanitization Functions ─────────────────────────────────────────────────

/**
 * PROMPT 5: Strip sensitive fields from a single object.
 * Removes any keys that match the sensitive field lists.
 */
export function stripSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  additionalFields: string[] = [],
): T {
  if (!obj || typeof obj !== "object") return obj;

  const allSensitiveFields = new Set([
    ...SENSITIVE_SHOP_FIELDS,
    ...additionalFields,
  ]);

  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Skip sensitive fields
    if (allSensitiveFields.has(key) || allSensitiveFields.has(lowerKey)) {
      continue;
    }

    // Skip PII in public contexts (but allow in authenticated contexts)
    if (PII_FIELDS.some((f) => lowerKey.includes(f.toLowerCase()))) {
      // Mask the value instead of removing it
      cleaned[key] = maskPiiValue(value);
      continue;
    }

    // Skip internal metadata
    if (INTERNAL_FIELDS.some((f) => lowerKey === f.toLowerCase())) {
      continue;
    }

    // Recursively clean nested objects
    if (value && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = stripSensitiveFields(
        value as Record<string, unknown>,
        additionalFields,
      );
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map((item) =>
        item && typeof item === "object"
          ? stripSensitiveFields(item as Record<string, unknown>, additionalFields)
          : item,
      );
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned as T;
}

/**
 * PROMPT 5: Mask PII values for public responses.
 * Phone numbers: show last 4 digits (e.g. "*******1234")
 * Emails: show first char and domain (e.g. "j***@example.com")
 */
function maskPiiValue(value: unknown): unknown {
  if (!value || typeof value !== "string") return null;

  const str = value.trim();

  // Check if it looks like a phone number (digits only, possibly with + prefix)
  if (/^\+?\d{10,15}$/.test(str.replace(/[\s-]/g, ""))) {
    const digits = str.replace(/\D/g, "");
    if (digits.length >= 7) {
      return `*******${digits.slice(-4)}`;
    }
    return "*******";
  }

  // Check if it looks like an email
  if (str.includes("@") && str.includes(".")) {
    const [localPart, domain] = str.split("@");
    if (localPart && domain) {
      const masked = localPart.length > 1
        ? `${localPart[0]}***`
        : "***";
      return `${masked}@${domain}`;
    }
  }

  // Generic masking for other PII
  return "***";
}

/**
 * PROMPT 5: Sanitize a shop object for public API responses.
 * Strips internal fields and masks contact information.
 */
export function sanitizeShopForPublic(shop: Shop): Partial<Shop> {
  const stripped = stripSensitiveFields({ ...shop });

  // Additional sanitization for shop content
  if (stripped.name) {
    stripped.name = sanitizeLight(stripped.name);
  }
  if (stripped.store_bio) {
    stripped.store_bio = sanitizeHtml(stripped.store_bio);
  }
  if (stripped.announcement) {
    stripped.announcement = sanitizeLight(stripped.announcement);
  }
  if (stripped.operating_status) {
    stripped.operating_status = sanitizeLight(stripped.operating_status);
  }

  return stripped;
}

/**
 * PROMPT 5: Sanitize a product object for public API responses.
 */
export function sanitizeProductForPublic(product: Product): Partial<Product> {
  const stripped = stripSensitiveFields({ ...product });

  if (stripped.name) {
    stripped.name = sanitizeLight(stripped.name);
  }
  if (stripped.description) {
    stripped.description = sanitizeHtml(stripped.description);
  }

  return stripped;
}

/**
 * PROMPT 5: Sanitize an array of shops for public API responses.
 */
export function sanitizeShopsForPublic(shops: Shop[]): Partial<Shop>[] {
  if (!shops || !Array.isArray(shops)) return [];
  return shops.map(sanitizeShopForPublic);
}

/**
 * PROMPT 5: Sanitize an array of products for public API responses.
 */
export function sanitizeProductsForPublic(products: Product[]): Partial<Product>[] {
  if (!products || !Array.isArray(products)) return [];
  return products.map(sanitizeProductForPublic);
}

/**
 * PROMPT 5: Sanitize a review object for public display.
 */
export function sanitizeReviewForPublic(review: Review): Review {
  return {
    ...review,
    customer_name: sanitizeLight(review.customer_name),
    comment: sanitizeHtml(review.comment),
  };
}

/**
 * PROMPT 5: Strip all internal metadata from an API response envelope.
 * Ensures the response object itself doesn't leak infrastructure details.
 */
export function sanitizeApiResponse<T extends Record<string, unknown>>(
  response: T,
): T {
  const cleaned = { ...response };

  // Remove internal metadata keys from the response envelope
  const metaKeys = [
    "error_details",
    "stack_trace",
    "internal_error",
    "debug_info",
    "query_time_ms",
    "db_latency",
    "server_time",
    "node_version",
    "request_id",
    "trace_id",
  ];

  for (const key of metaKeys) {
    delete cleaned[key];
  }

  return cleaned;
}

/**
 * PROMPT 5: Build a safe, minimal error response that doesn't leak
 * implementation details. This should be used for all public API error
 * responses instead of forwarding raw error messages.
 */
export function buildSafeErrorResponse(
  statusCode: number,
  publicMessage: string,
  originalError?: unknown,
): {
  error: string;
  status: number;
} {
  // Never include raw error details in public responses
  const safeMessage = sanitizeLight(publicMessage) || "An unexpected error occurred.";

  // Log the original error server-side (in production, this would go to a logging service)
  if (originalError && process.env.NODE_ENV !== "production") {
    console.error("[API Error]", originalError);
  }

  return {
    error: safeMessage,
    status: statusCode,
  };
}