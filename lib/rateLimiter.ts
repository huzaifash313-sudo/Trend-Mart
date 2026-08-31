/* -------------------------------------------------------------------------- */
/*  TrendsMart — API Route Rate Limiter & Request Throttling Utility             */
/*  PROMPT 4: Protects backend endpoints against automated spam, brute-force   */
/*            requests, and denial-of-service vulnerabilities.                 */
/*                                                                            */
/*  Provides:                                                                  */
/*   - Token-bucket algorithm for flexible burst handling                      */
/*   - Per-endpoint configurable rate limits                                   */
/*   - IP-based and session-based rate limiting                                */
/*   - Sliding window for accurate rate tracking                               */
/*   - Automatic cleanup of expired entries                                    */
/*   - Header-forwarding (X-RateLimit-*) for client transparency               */
/* -------------------------------------------------------------------------- */

import { type NextRequest } from "next/server";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Optional: human-readable endpoint name for logging. */
  name?: string;
}

export interface RateLimitEntry {
  count: number;
  resetAt: number;
  tokens: number;
  lastRefill: number;
}

export interface RateLimitResult {
  /** Whether the request should be allowed to proceed. */
  allowed: boolean;
  /** Number of remaining requests in the current window. */
  remaining: number;
  /** Unix timestamp (in seconds) when the rate limit resets. */
  resetAt: number;
  /** Total limit for this endpoint. */
  limit: number;
  /** Human-readable error message if rate limited. */
  message?: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Pre-configured rate limits for different endpoint categories.
 * These are tuned to allow normal user activity while blocking abuse.
 */
export const RATE_LIMITS = {
  /** Default rate limit for general API requests. */
  DEFAULT: {
    maxRequests: 60,
    windowMs: 60_000, // 60 requests per minute
  } as const,

  /** Stricter limits for auth endpoints (login, signup, password reset). */
  AUTH: {
    maxRequests: 10,
    windowMs: 60_000, // 10 requests per minute
  } as const,

  /** Search queries — moderate limit to allow browsing but prevent scraping. */
  SEARCH: {
    maxRequests: 30,
    windowMs: 60_000, // 30 searches per minute
  } as const,

  /** Review and rating submissions — prevent review spam. */
  REVIEWS: {
    maxRequests: 5,
    windowMs: 60_000, // 5 review submissions per minute
  } as const,

  /** Support tickets / contact form — block spam. */
  SUPPORT: {
    maxRequests: 5,
    windowMs: 15 * 60_000, // 5 tickets per 15 minutes
  } as const,

  /** WhatsApp cart generation — prevent flooding. */
  WHATSAPP_GENERATE: {
    maxRequests: 10,
    windowMs: 60_000, // 10 cart generations per minute
  } as const,

  /** Shop/product creation (mutations) — very strict to prevent mass-creation. */
  MUTATIONS: {
    maxRequests: 15,
    windowMs: 60_000, // 15 mutations per minute
  } as const,

  /** File uploads — strict due to storage costs and potential abuse. */
  UPLOADS: {
    maxRequests: 10,
    windowMs: 120_000, // 10 uploads per 2 minutes
  } as const,

  /** Export/pagination endpoints — prevent data exfiltration. */
  EXPORTS: {
    maxRequests: 5,
    windowMs: 300_000, // 5 exports per 5 minutes
  } as const,

  /** Internal health checks and metrics — very high limit. */
  HEALTH: {
    maxRequests: 120,
    windowMs: 60_000, // 120 health checks per minute
  } as const,
} as const satisfies Record<string, RateLimitConfig>;

/**
 * Map URL path patterns to their rate limit configurations.
 * Patterns are matched with `startsWith()`.
 */
const ENDPOINT_RATE_LIMIT_MAP: [string[], RateLimitConfig][] = [
  [
    [
      "/api/auth/",
      "/auth/login",
      "/auth/signup",
      "/auth/reset-password",
      "/login",
      "/signup",
    ],
    RATE_LIMITS.AUTH,
  ],
  [
    [
      "/api/search",
      "/api/global-search",
      "/search",
    ],
    RATE_LIMITS.SEARCH,
  ],
  [
    [
      "/api/reviews",
      "/api/submit-review",
      "/api/ratings",
    ],
    RATE_LIMITS.REVIEWS,
  ],
  [
    [
      "/api/whatsapp-checkout",
      "/api/whatsapp-cart",
      "/api/cart/generate",
    ],
    RATE_LIMITS.WHATSAPP_GENERATE,
  ],
  [
    [
      "/api/shops",
      "/api/products",
      "/api/categories",
      "/api/inventory",
      "/api/coupons",
      "/admin/",
      "/dashboard/products/new",
      "/dashboard/shop/create",
    ],
    RATE_LIMITS.MUTATIONS,
  ],
  [
    [
      "/api/upload",
      "/api/storage/upload",
      "/api/images/upload",
    ],
    RATE_LIMITS.UPLOADS,
  ],
  [
    [
      "/api/export",
      "/api/orders/export",
      "/api/products/export",
      "/api/admin/export",
    ],
    RATE_LIMITS.EXPORTS,
  ],
  [
    [
      "/api/health",
      "/api/status",
      "/api/ping",
    ],
    RATE_LIMITS.HEALTH,
  ],
];

/**
 * Determine the appropriate rate limit config for a given URL path.
 * Falls back to DEFAULT if no specific pattern matches.
 */
export function getRateLimitConfig(pathname: string): RateLimitConfig {
  for (const [patterns, config] of ENDPOINT_RATE_LIMIT_MAP) {
    for (const pattern of patterns) {
      if (pathname.startsWith(pattern)) {
        return { ...config, name: pattern };
      }
    }
  }
  return { ...RATE_LIMITS.DEFAULT, name: "default" };
}

// ─── Sliding Window Rate Limiter ─────────────────────────────────────────────

/**
 * In-memory rate limit store per edge function instance.
 * In production with Vercel, this is per-edge-location and resets on cold start.
 * For distributed rate limiting, use Upstash Redis or similar.
 */
const store = new Map<string, RateLimitEntry>();

/**
 * Timestamp of the last cleanup run.
 */
let lastCleanup = Date.now();

/**
 * Interval between cleanup runs in milliseconds.
 */
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

/**
 * Maximum age of a rate limit entry before it's cleaned up.
 */
const MAX_ENTRY_AGE_MS = 600_000; // 10 minutes

/**
 * Remove expired entries from the store to prevent memory leaks.
 */
function cleanExpiredEntries(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    if (now > entry.resetAt + MAX_ENTRY_AGE_MS) {
      store.delete(key);
    }
  }
}

/**
 * Sanitize a string to be used as a rate-limit key.
 * Prevents key injection attacks.
 */
function sanitizeKey(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9\-_:.]/g, "")
    .slice(0, 128);
}

/**
 * Derive a rate-limit key from the incoming request.
 *
 * Priority:
 *   1. Authenticated session ID (most specific)
 *   2. IP address + User-Agent hash
 *   3. IP address only (fallback)
 */
export function deriveRateLimitKey(request: NextRequest): string {
  // Try to get a session cookie for authenticated user identification
  const accessToken = request.cookies.get("sb-access-token")?.value;
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;

  if (accessToken || refreshToken) {
    const token = (accessToken || refreshToken)!;
    // Use a truncated hash of the token as the session identifier
    // This avoids storing the full token in memory
    const sessionHash = token.slice(0, 24);
    return sanitizeKey(`session:${sessionHash}`);
  }

  // Fall back to IP-based rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  // Sanitize IP to prevent header injection
  const sanitizedIp = ip.replace(/[^0-9a-fA-F.:]/g, "").slice(0, 45);

  // Include a truncated, sanitized User-Agent for more granularity
  // (helps differentiate users behind the same NAT/office IP)
  const ua = (request.headers.get("user-agent") ?? "")
    .slice(0, 32)
    .replace(/[^\x20-\x7E]/g, "");

  return sanitizeKey(`ip:${sanitizedIp}:${ua}`);
}

/**
 * Check if a request should be rate-limited.
 *
 * Uses a sliding window algorithm with token bucket for burst handling.
 *
 * @param request  The incoming NextRequest
 * @param config   Optional override for the rate limit configuration.
 *                 If not provided, the config is derived from the URL path.
 * @returns        A RateLimitResult indicating whether the request is allowed.
 */
export function checkRateLimit(
  request: NextRequest,
  config?: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  cleanExpiredEntries(now);

  const pathname = request.nextUrl.pathname;
  const resolvedConfig = config ?? getRateLimitConfig(pathname);
  const { maxRequests, windowMs } = resolvedConfig;

  const baseKey = deriveRateLimitKey(request);
  const key = `${baseKey}:${sanitizeKey(pathname)}`;

  const existing = store.get(key);

  // No existing entry or window has expired — create a new one
  if (!existing || now > existing.resetAt) {
    const entry: RateLimitEntry = {
      count: 1,
      resetAt: now + windowMs,
      tokens: maxRequests - 1,
      lastRefill: now,
    };
    store.set(key, entry);

    return {
      allowed: true,
      remaining: Math.floor(entry.tokens),
      resetAt: Math.ceil(entry.resetAt / 1000),
      limit: maxRequests,
    };
  }

  // Refill tokens based on elapsed time (sliding window with token bucket)
  const elapsed = now - existing.lastRefill;
  const refillRate = maxRequests / windowMs; // tokens per millisecond
  const tokensToAdd = elapsed * refillRate;

  existing.tokens = Math.min(maxRequests, existing.tokens + tokensToAdd);
  existing.lastRefill = now;

  // Check if we have a token available
  if (existing.tokens >= 1) {
    existing.tokens -= 1;
    existing.count += 1;

    return {
      allowed: true,
      remaining: Math.floor(existing.tokens),
      resetAt: Math.ceil(existing.resetAt / 1000),
      limit: maxRequests,
    };
  }

  // No tokens available — rate limited
  existing.count += 1; // Still count the attempt for metrics

  const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);

  return {
    allowed: false,
    remaining: 0,
    resetAt: Math.ceil(existing.resetAt / 1000),
    limit: maxRequests,
    message: `Rate limit exceeded. Please wait ${retryAfterSeconds} second(s) before trying again.`,
  };
}

// ─── Response Helpers ────────────────────────────────────────────────────────

/**
 * Build the standard rate limit response headers.
 * These headers inform clients about their current rate limit status.
 */
export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(result.resetAt),
    ...(result.message ? { "Retry-After": String(Math.ceil(result.resetAt - Date.now() / 1000)) } : {}),
  };
}

/**
 * Build a 429 (Too Many Requests) JSON response with rate limit headers.
 */
export function buildRateLimitResponse(result: RateLimitResult): {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
} {
  return {
    status: 429,
    body: {
      error: "Too many requests",
      message: result.message ?? "Rate limit exceeded. Please slow down.",
      retryAfter: Math.ceil(result.resetAt - Date.now() / 1000),
    },
    headers: {
      "Content-Type": "application/json",
      ...buildRateLimitHeaders(result),
    },
  };
}

// ─── Stats & Monitoring ──────────────────────────────────────────────────────

/**
 * Get the current number of tracked rate limit entries.
 * Useful for monitoring memory usage in edge functions.
 */
export function getRateLimitStats(): {
  totalEntries: number;
  oldestEntryAgeMs: number;
} {
  const now = Date.now();
  let oldestAge = 0;

  for (const [, entry] of store) {
    const age = now - entry.lastRefill;
    if (age > oldestAge) oldestAge = age;
  }

  return {
    totalEntries: store.size,
    oldestEntryAgeMs: oldestAge,
  };
}

/**
 * Clear all rate limit entries (for testing or emergency reset).
 */
export function resetRateLimits(): void {
  store.clear();
  lastCleanup = Date.now();
}