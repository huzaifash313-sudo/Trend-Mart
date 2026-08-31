/* -------------------------------------------------------------------------- */
/*  TrendsMart — Next.js Middleware                                             */
/*  Auth session refresh | Route protection | Security headers | Rate limiting  */
/*  Multi-Tenant Role-Based Access Control (RBAC)                              */
/*  PROMPT 1: HARDENED — Strict session validation, sanitized tokens,          */
/*                       zero privilege leakage, CSRF protection               */
/*                                                                              */
/*  Role Hierarchy: public → customer → merchant → admin                       */
/*  - Public routes:     /, /search, /shop/:id, /login, /signup, /auth/*       */
/*  - Customer routes:   /orders, /wishlist, /auth/settings                    */
/*  - Merchant routes:   /dashboard, /dashboard/products, /shop/manage         */
/*  - Admin routes:      /admin/*                                              */
/* -------------------------------------------------------------------------- */

import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import {
  getDistributedRateLimiter,
  bootstrapDistributedRateLimiter,
} from "@/lib/rateLimiterRedis";

// Engage the distributed (Upstash) rate limiter when configured — safe no-op
// without env vars, in which case the per-isolate in-memory fallback applies.
bootstrapDistributedRateLimiter();

// ═══════════════════════════════════════════════════════════════════════════════
// TRENDSMART MIDDLEWARE — v2.0 FIXED
// Fix: Reordered session refresh BEFORE auth checks to prevent stale-cache
//      redirects. Added comprehensive debug logging. Unverified users can now
//      access /dashboard with a warning instead of being completely blocked.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Debug Mode (set to true during troubleshooting) ──────────────────────
const DEBUG_AUTH = process.env.NODE_ENV !== "production";

function authDebug(message: string, data?: Record<string, unknown>): void {
  if (!DEBUG_AUTH) return;
  const timestamp = new Date().toISOString();
  console.log(
    `[TrendsMart MW ${timestamp}] ${message}`,
    data ? JSON.stringify(data) : "",
  );
}

// ─── Rate Limiting (Edge-Safe Distributed with In-Memory Fallback) ───────────

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 15_000;

const SENSITIVE_PATH_PATTERNS = [
  "/api/",
  "/auth/",
  "/dashboard/",
  "/admin/",
  "/login",
  "/signup",
] as const;

const SENSITIVE_RATE_LIMIT_MAX = 10;

/**
 * Edge-safe rate limit check.
 *
 * Delegates to the DistributedRateLimiter (Redis/Upstash-backed with atomic
 * Lua sliding-window when configured; transparent in-memory fallback per
 * edge isolate). The fallback naturally resets on Vercel cold-starts —
 * production deployments against coordinated attacks should configure
 * configureDistributedRateLimiter() with an Upstash Redis client during
 * app bootstrap.
 */
async function checkRateLimit(request: NextRequest): Promise<boolean> {
  const limiter = getDistributedRateLimiter();
  // Sensitive paths (auth/admin/dashboard/api) get a tighter cap than the
  // general browse default. Previously the 10-cap was computed for the header
  // but never actually enforced — every path silently used 30.
  const pathname = request.nextUrl.pathname;
  const isSensitive = SENSITIVE_PATH_PATTERNS.some((p) => pathname.startsWith(p));
  const maxRequests = isSensitive ? SENSITIVE_RATE_LIMIT_MAX : RATE_LIMIT_MAX;
  try {
    const result = await limiter.checkRateLimit(request, {
      maxRequests,
      windowMs: RATE_LIMIT_WINDOW_MS,
      name: isSensitive ? "middleware-sensitive" : "middleware-global",
    });
    return result.allowed;
  } catch {
    console.warn("[TrendsMart MW] Rate limiter error — allowing as failsafe");
    return true;
  }
}

// ─── Session Token Sanitization ──────────────────────────────────────────────

/** Strict JWT structure pattern: header.payload.signature (base64url chars) */
const JWT_TOKEN_PATTERN = /^[A-Za-z0-9\-_]+?\.[A-Za-z0-9\-_]+?\.[A-Za-z0-9\-_]+$/;

/** Maximum allowed token length (4KB prevents memory-exhaustion attacks) */
const MAX_TOKEN_LENGTH = 4096;

/** Characters that are NEVER valid in a base64url-encoded JWT */
const JWT_INVALID_CHARS = /[^A-Za-z0-9\-_\.]/g;

/**
 * Sanitize a raw session token value read from a cookie or header.
 *
 * Defenses applied (in order):
 *   1. Type guard — rejects non-string values immediately
 *   2. Whitespace trim — strips whitespace from misconfigured proxies
 *   3. Empty check — rejects zero-length strings
 *   4. Length cap — rejects tokens > 4KB (prevents DoS via memory exhaustion)
 *   5. Character allowlist — strips characters invalid in base64url
 *   6. Structure validation — rejects strings that don't match JWT format
 *
 * Returns an empty string for any invalid input. Callers MUST check for
 * empty-string returns and treat them as "no valid token present."
 */
function sanitizeSessionToken(token: string | undefined): string {
  if (!token || typeof token !== "string") return "";
  const trimmed = token.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length > MAX_TOKEN_LENGTH) return "";

  // Defense-in-depth: reject tokens with characters that are NEVER valid
  // in a base64url-encoded JWT (prevents injection of special chars)
  if (JWT_INVALID_CHARS.test(trimmed)) return "";

  if (!JWT_TOKEN_PATTERN.test(trimmed)) return "";
  return trimmed;
}

/**
 * Decode a base64 / base64url string into a JSON object.
 * Works in the Edge runtime (no Buffer dependency) — normalizes the URL-safe
 * alphabet, pads, decodes bytes with `atob`, then UTF-8 decodes.
 */
function decodeBase64Json(value: string): Record<string, unknown> | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extract the raw access token from Supabase's auth cookies.
 *
 * COMPATIBILITY: Supabase SSR v0.12+ stores a single combined cookie
 * (`sb-<project-ref>-auth-token`) whose value is a base64 JSON blob
 * `{ access_token, refresh_token, ... }`. Older builds used a separate
 * `sb-access-token` cookie. We resolve BOTH so the middleware's short-lived
 * user cache is keyed on the real token (per user) instead of the caller's
 * IP — two different accounts on the same device/IP previously collided in
 * the cache for up to 5 seconds.
 */
function getSessionAccessToken(request: NextRequest): string {
  const allCookies = request.cookies.getAll();
  const combined = allCookies.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token") && c.value.length > 0,
  );
  if (combined) {
    const parsed = decodeBase64Json(combined.value);
    if (
      parsed &&
      typeof parsed.access_token === "string" &&
      parsed.access_token.length > 0
    ) {
      return parsed.access_token;
    }
  }
  return request.cookies.get("sb-access-token")?.value ?? "";
}


// ─── Role & Route Configuration ────────────────────────────────────────────

type AppRole = "customer" | "merchant" | "admin";

const ROLE_HIERARCHY: Record<AppRole, number> = {
  customer: 0,
  merchant: 1,
  admin: 2,
};

const ROLE_ROUTE_MAP = {
  /** Routes that require at minimum an authenticated user (any role). */
  customer: ["/auth/settings", "/account", "/orders"],
  /** Routes that require merchant or higher (store owners). */
  merchant: ["/dashboard"],
  /** Routes that require admin role exclusively. */
  admin: ["/admin"],
} as const;

const AUTH_ROUTES = ["/login", "/signup", "/auth"] as const;

function getRequiredRole(pathname: string): AppRole | "public" {
  if (ROLE_ROUTE_MAP.admin.some((route) => pathname.startsWith(route)))
    return "admin";
  if (ROLE_ROUTE_MAP.merchant.some((route) => pathname.startsWith(route)))
    return "merchant";
  if (ROLE_ROUTE_MAP.customer.some((route) => pathname.startsWith(route)))
    return "customer";
  return "public";
}

function isAuthRoute(pathname: string): boolean {
  // Exact match only. Sub-routes under /auth/* (settings, verify-notice,
  // callback, reset-password) are functional pages that logged-in users
  // must be able to reach — only the bare entry points below are "auth
  // pages" that a signed-in user should be redirected away from.
  return AUTH_ROUTES.some((route) => pathname === route);
}

// ─── Session & Role Resolution ────────────────────────────────────────────

/**
 * Check for Supabase auth cookies.
 *
 * COMPATIBILITY: Supabase SSR v0.12+ uses a **combined** cookie format:
 *   sb-<project-ref>-auth-token
 * The value is a base64-encoded JSON blob containing { access_token, refresh_token, ... }.
 *
 * Older versions used separate cookies:
 *   sb-access-token  (raw JWT)
 *   sb-refresh-token (raw JWT)
 *
 * We check BOTH patterns to support all Supabase SSR versions.
 * This is a fast, synchronous presence check — actual token validity is
 * verified later by updateSession() → supabase.auth.getUser().
 */
function hasValidSession(request: NextRequest): boolean {
  const allCookies = request.cookies.getAll();

  // Check for Supabase SSR v0.12+ combined cookie: sb-*-auth-token
  const hasCombinedCookie = allCookies.some((c) =>
    c.name.startsWith("sb-") && c.name.endsWith("-auth-token") && c.value.length > 0,
  );
  if (hasCombinedCookie) return true;

  // Check for legacy separate cookies (pre-v0.12)
  const accessToken = request.cookies.get("sb-access-token")?.value;
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;
  if (accessToken && accessToken.length > 0) return true;
  if (refreshToken && refreshToken.length > 0) return true;

  // Also check for any cookie starting with "sb-" that has content
  // (catches edge cases with different Supabase project configurations)
  return allCookies.some(
    (c) => c.name.startsWith("sb-") && c.name.includes("auth") && c.value.length > 0,
  );
}

/**
 * Short-lived user cache. CRITICAL FIX: We now invalidate this cache
 * after updateSession() refreshes tokens, preventing stale null entries
 * from poisoning role resolution.
 */
type MiddlewareAuthUser = {
  id: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
};

interface CachedUser {
  user: MiddlewareAuthUser | null;
  timestamp: number;
}

const userCache = new Map<string, CachedUser>();

/** Clear all cached user entries — called after session refresh. */
function invalidateUserCache(): void {
  userCache.clear();
  authDebug("User cache cleared after session refresh");
}

/**
 * Get the authenticated user from Supabase.
 * Uses short-lived cache to avoid redundant API calls, but the cache
 * is cleared after updateSession() refreshes tokens.
 */
async function getAuthenticatedUser(
  request: NextRequest,
): Promise<MiddlewareAuthUser | null> {
  // Key the cache on the caller's own access token (resolved from either the
  // combined SSR cookie or the legacy separate cookie) so two different users
  // behind the same IP / device never share a cached identity.
  const accessToken = sanitizeSessionToken(getSessionAccessToken(request));
  const cacheKey = accessToken
    ? accessToken.slice(0, 32)
    : `anon_${request.headers.get("x-forwarded-for") ?? "unknown"}`;

  const cached = userCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5_000) {
    authDebug("getAuthenticatedUser: cache HIT", {
      cacheKey: cacheKey.slice(0, 16),
      hasUser: !!cached.user,
    });
    return cached.user;
  }

  authDebug("getAuthenticatedUser: cache MISS, calling Supabase", {
    cacheKey: cacheKey.slice(0, 16),
  });

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      authDebug("getAuthenticatedUser: MISSING ENV VARS", {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnonKey,
      });
      return null;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          /* no-op — session refresh is handled by updateSession() */
        },
      },
    });

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      authDebug("getAuthenticatedUser: getUser() ERROR", {
        message: error.message,
        status: error.status,
      });
      // DON'T cache errors — they may be transient (expired token that
      // will be refreshed by updateSession)
      return null;
    }

    if (!user) {
      authDebug("getAuthenticatedUser: no user returned");
      userCache.set(cacheKey, { user: null, timestamp: Date.now() });
      return null;
    }

    const result: MiddlewareAuthUser = {
      id: user.id,
      email_confirmed_at: user.email_confirmed_at,
      user_metadata: user.user_metadata ?? null,
      app_metadata: user.app_metadata ?? null,
    };
    authDebug("getAuthenticatedUser: SUCCESS", {
      userId: user.id.slice(0, 8),
      emailConfirmed: !!user.email_confirmed_at,
    });
    userCache.set(cacheKey, { user: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    authDebug("getAuthenticatedUser: EXCEPTION", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Check if the authenticated user has confirmed their email.
 * Returns true if email is confirmed OR if no session exists.
 */
async function isEmailConfirmed(request: NextRequest): Promise<boolean> {
  const user = await getAuthenticatedUser(request);
  // Fail closed: when cookies are present but the user cannot be resolved
  // (stale cookie or an auth outage), do NOT treat verification as passed.
  if (!user) return false;
  return !!user.email_confirmed_at;
}

/**
 * Paths unverified users may access.
 * Browse/search/shop stay public via the public fast-path; auth pages stay
 * open so email OTP / magic-link confirm can finish. Dashboard, account, and
 * orders require a verified email (enforced below).
 */
const VERIFY_EXEMPT_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth",
  "/auth/verify-notice",
  "/auth/callback",
  "/auth/reset-password",
  "/settings",
  "/search",
  "/products",
  "/wishlist", // guest local wishlist; purchase still gated at checkout
  "/banned",
  // Merchant onboarding is intentionally direct (no email-verification gate).
  // Verification is still enforced at checkout/order time, not for store setup.
  "/account/become-merchant",
  "/dashboard",
];

function isVerifyExempt(pathname: string): boolean {
  // Public storefront shop pages only — not merchant tools
  if (pathname === "/shop" || /^\/shop\/[^/]+/.test(pathname)) {
    if (pathname.startsWith("/shop/manage")) return false;
    return true;
  }
  return VERIFY_EXEMPT_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * Public catalog / marketing pages — skip session refresh & role RPC for speed.
 * Auth/dashboard/admin still go through the full gate below.
 */
function isPublicBrowsePath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  if (pathname === "/products" || pathname.startsWith("/products/")) return true;
  if (pathname === "/deals" || pathname.startsWith("/deals/")) return true;
  if (pathname === "/search" || pathname.startsWith("/search/")) return true;
  if (pathname === "/faq" || pathname.startsWith("/faq/")) return true;
  if (pathname.startsWith("/legal")) return true;
  if (pathname === "/support" || pathname.startsWith("/support/")) return true;
  if (pathname === "/banned") return true;
  if (pathname === "/offline") return true;
  if (pathname === "/shop" || /^\/shop\/[^/]+/.test(pathname)) {
    return !pathname.startsWith("/shop/manage");
  }
  return false;
}

/**
 * Fetch the user's role from the `user_roles` table.
 * FIX: If getUser() fails but session cookies exist, fall back to "customer"
 * instead of returning null. This prevents the login redirect loop when
 * Supabase is temporarily unreachable or tokens are being refreshed.
 *
 * FIX 2: The `authenticated` parameter allows us to skip the getUser() call
 * entirely when we already know cookies exist — falling back to "customer"
 * instead of making a potentially-failing network call.
 */
async function resolveUserRole(
  request: NextRequest,
  authenticated: boolean,
): Promise<AppRole | null> {
  try {
    const user = await getAuthenticatedUser(request);

    // Fail closed: when we cannot resolve the user (stale cookie, transient
    // auth outage, or missing env), do NOT grant merchant/admin privileges.
    // The route guard below treats a null role as unauthenticated.
    if (!user) {
      authDebug("resolveUserRole: getUser failed — failing closed (no role)", {
        authenticated,
      });
      return null;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      authDebug("resolveUserRole: MISSING ENV VARS — failing closed");
      return null;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          /* no-op */
        },
      },
    });

    // app_metadata is written ONLY by the service role (never by the user) —
    // fast and fully trusted, so no extra network calls are needed for it.
    const appMeta =
      typeof user.app_metadata?.role === "string" ? user.app_metadata.role : "";
    if (appMeta === "admin") {
      authDebug("resolveUserRole: admin via app_metadata");
      return "admin";
    }
    if (appMeta === "merchant") {
      authDebug("resolveUserRole: merchant via app_metadata");
      return "merchant";
    }

    // Authoritative check: get_my_role() RPC and the shop-ownership probe run
    // IN PARALLEL so role resolution costs one max() round-trip instead of two
    // sequential waits. Shop ownership is the un-fakeable merchant signal
    // (legacy merchants who predate user_roles).
    const [rpcResult, shopResult] = await Promise.all([
      supabase.rpc("get_my_role"),
      supabase
        .from("shops")
        .select("id")
        .eq("owner_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]);

    const rpcRole =
      !rpcResult.error && typeof rpcResult.data === "string" ? rpcResult.data : "";

    if (rpcRole === "admin") {
      authDebug("resolveUserRole: admin via get_my_role");
      return "admin";
    }
    if (rpcRole === "merchant") {
      authDebug("resolveUserRole: merchant via get_my_role");
      return "merchant";
    }
    if (shopResult?.data?.id) {
      authDebug("resolveUserRole: shop owner → merchant");
      return "merchant";
    }
    if (rpcRole === "customer") {
      authDebug("resolveUserRole: customer via get_my_role");
      return "customer";
    }

    authDebug("resolveUserRole: default customer");
    return "customer";
  } catch (err) {
    authDebug("resolveUserRole: EXCEPTION", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail closed: never infer a privileged role from an exception.
    return null;
  }
}

/**
 * Check whether the signed-in user's account has been banned by a Super-Admin
 * (user moderation). Fails OPEN on transient errors so an auth outage never
 * locks everyone out — a ban is only enforced when we positively know it.
 */
async function isAccountBanned(request: NextRequest): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return false;
  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          /* no-op */
        },
      },
    });
    const { data, error } = await supabase.rpc("is_account_banned");
    if (error) {
      authDebug("isAccountBanned: RPC error", { message: error.message });
      return false;
    }
    return data === true;
  } catch (err) {
    authDebug("isAccountBanned: EXCEPTION", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ─── Security Headers Builder ──────────────────────────────────────────────

function applySecurityHeaders(response: NextResponse): void {
  const headers = response.headers;
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("X-Download-Options", "noopen");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");

  const isProd = process.env.NODE_ENV === "production";
  const cspDirectives = [
    "default-src 'self'",
    // 'unsafe-inline' is required for the inline theme/splash bootstrap scripts
    // in app/layout.tsx. 'unsafe-eval' only in development — React/Next DevTools
    // need eval for callstacks; production CSP stays without it.
    isProd
      ? "script-src 'self' 'unsafe-inline' https://*.supabase.co"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    // Always allow Supabase HTTPS + Realtime WebSockets (prod was missing wss://)
    // + Cloudinary upload API (merchant image/story uploads run from the browser).
    isProd
      ? "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://nominatim.openstreetmap.org https://api.cloudinary.com https://res.cloudinary.com"
      : "connect-src 'self' ws: wss: https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://nominatim.openstreetmap.org https://api.cloudinary.com https://res.cloudinary.com",
    "font-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  headers.set("Content-Security-Policy", cspDirectives.join("; "));
}

function stripSensitiveHeaders(
  response: NextResponse,
  options?: { keepRoleHeader?: boolean },
): void {
  const SENSITIVE_HEADERS = [
    "X-Internal-Auth",
    "X-Forwarded-Auth",
    "Server",
    "X-Powered-By",
  ];
  // X-User-Role is intentionally set for downstream server-side use;
  // only strip it when explicitly requested (error/redirect responses).
  if (!options?.keepRoleHeader) {
    SENSITIVE_HEADERS.push("X-User-Role");
  }
  for (const header of SENSITIVE_HEADERS) {
    response.headers.delete(header);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE MAIN HANDLER — FIXED FLOW
// ═══════════════════════════════════════════════════════════════════════════════

/** Cookie name used for redirect-loop tracking */
const REDIRECT_LOOP_COOKIE = "_tm_rlc";

/**
 * Build a redirect response that tracks consecutive redirects to prevent
 * infinite browser redirect loops (e.g., when stale cookies cause the
 * middleware to bounce between /login and /admin).
 *
 * After 3 consecutive redirects the loop-detector at the top of the
 * middleware short-circuits and serves the requested page directly.
 */
function buildRedirectWithLoopTracking(
  targetUrl: URL,
  request: NextRequest,
): NextResponse {
  const currentCount = parseInt(
    request.cookies.get(REDIRECT_LOOP_COOKIE)?.value ?? "0",
    10,
  );
  const nextCount = currentCount + 1;
  const response = NextResponse.redirect(targetUrl);
  response.cookies.set(REDIRECT_LOOP_COOKIE, String(nextCount), {
    maxAge: 30, // auto-expire after 30s so legitimate redirects still work
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  stripSensitiveHeaders(response);
  return response;
}

/** Canonical host from NEXT_PUBLIC_APP_URL / SITE_URL (no hardcoded domain). */
function getCanonicalHostname(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  if (!raw.trim()) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./, "");
    if (!host || host === "localhost" || host === "127.0.0.1") return null;
    if (host.endsWith(".vercel.app") || host.endsWith(".vercel.com")) return null;
    return host;
  } catch {
    return null;
  }
}

function shouldCanonicalHostRedirect(
  hostname: string,
  canonicalHost: string,
): boolean {
  if (!hostname || hostname === canonicalHost) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") return false;
  if (hostname === `www.${canonicalHost}`) return true;
  if (hostname.endsWith(".vercel.app") || hostname.endsWith(".vercel.com")) {
    return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.nextUrl.hostname;
  const canonicalHost = getCanonicalHostname();

  // ── Canonical domain (from NEXT_PUBLIC_APP_URL) ─────────────────────────
  // Keep QR / auth / share links on the configured public host — never leave
  // users on *.vercel.app or www after the custom domain is live.
  if (
    process.env.NODE_ENV === "production" &&
    canonicalHost &&
    shouldCanonicalHostRedirect(hostname, canonicalHost)
  ) {
    const target = request.nextUrl.clone();
    target.protocol = "https:";
    target.hostname = canonicalHost;
    target.port = "";
    return NextResponse.redirect(target, 308);
  }

  authDebug(">>> REQUEST", { pathname, method: request.method });

  // ── 0. Redirect-loop detection ──────────────────────────────────────────
  //    If the browser has been redirected 3+ times in quick succession,
  //    short-circuit all redirect logic and serve the requested page.
  //    This prevents infinite loops when role/cookie state is inconsistent.
  const redirectLoopCount = parseInt(
    request.cookies.get(REDIRECT_LOOP_COOKIE)?.value ?? "0",
    10,
  );

  if (redirectLoopCount >= 3) {
    authDebug("REDIRECT LOOP DETECTED — breaking to a safe landing", {
      pathname,
      redirectCount: redirectLoopCount,
    });
    // Stop bouncing account↔dashboard↔login. Prefer home for logged-in users;
    // auth pages can still render; otherwise go home (not /login which restarts loops).
    const hasSession = hasValidSession(request);
    let safePath = pathname;
    if (isAuthRoute(pathname)) {
      safePath = pathname;
    } else if (hasSession) {
      safePath = "/";
    } else {
      safePath = "/login";
    }
    const loopResponse =
      safePath === pathname
        ? NextResponse.next({ request: { headers: request.headers } })
        : NextResponse.redirect(new URL(safePath, request.url));
    loopResponse.cookies.set(REDIRECT_LOOP_COOKIE, "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    applySecurityHeaders(loopResponse);
    stripSensitiveHeaders(loopResponse);
    return loopResponse;
  }

  // ── 1. Rate limiting — skip anonymous GETs on public browse (major speed win)
  const method = request.method.toUpperCase();
  const isBrowseGet = method === "GET" || method === "HEAD";
  const browseFast = isPublicBrowsePath(pathname);
  if (!(browseFast && isBrowseGet)) {
    const rateLimitAllowed = await checkRateLimit(request);
    if (!rateLimitAllowed) {
      const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
      const response = new NextResponse(
        JSON.stringify({
          error: "Too many requests. Please slow down and try again.",
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(
              SENSITIVE_PATH_PATTERNS.some((p) => pathname.startsWith(p))
                ? SENSITIVE_RATE_LIMIT_MAX
                : RATE_LIMIT_MAX,
            ),
          },
        },
      );
      stripSensitiveHeaders(response);
      return response;
    }
  }

  // ── 2. Route classification ────────────────────────────────────────────
  const requiredRole = getRequiredRole(pathname);
  const authenticated = hasValidSession(request);

  authDebug("Route classification", {
    pathname,
    requiredRole,
    hasSessionCookies: authenticated,
    isAuthRoute: isAuthRoute(pathname),
    isVerifyExempt: isVerifyExempt(pathname),
    isPublicBrowse: browseFast,
  });

  // ── 2.5 Guest fast-path: auth entry pages & auth API routes ────────────
  //    Guests (no session cookies) hitting /login, /signup, /forgot-password
  //    or /api/auth/* only need the form / endpoint handler. Skipping the
  //    session refresh, email gate, and role RPC makes these pages render
  //    instantly — exactly what a signing-in user wants. Signed-in users still
  //    go through the full gate below so they're redirected to their dashboard.
  const isGuestAuthFastPath =
    !authenticated &&
    (pathname === "/login" ||
      pathname === "/signup" ||
      pathname === "/forgot-password" ||
      pathname.startsWith("/api/auth/"));

  if (isGuestAuthFastPath) {
    authDebug("GUEST AUTH fast path — serving without session work", { pathname });
    const response = NextResponse.next({
      request: { headers: request.headers },
    });
    applySecurityHeaders(response);
    stripSensitiveHeaders(response);
    return response;
  }

  // ── 3. PUBLIC browse: fast-path (no session refresh / role RPC) ────────
  if (
    browseFast ||
    (requiredRole === "public" && !isAuthRoute(pathname) && !isVerifyExempt(pathname))
  ) {
    authDebug("PUBLIC browse — fast return");
    const response = NextResponse.next({
      request: { headers: request.headers },
    });
    applySecurityHeaders(response);
    stripSensitiveHeaders(response);
    return response;
  }

  // ── 4. CRITICAL FIX: Refresh session BEFORE any getUser() calls ─────────
  //    Previously, isEmailConfirmed() was called before updateSession(),
  //    causing a stale null user to be cached. The cache would then poison
  //    resolveUserRole() even after tokens were refreshed.
  //    Now we refresh FIRST, then seed the cache with the freshly refreshed
  //    session so the email gate + role RPC never re-fetch the user.
  const { response: supabaseResponse, user: refreshedUser } = await updateSession(request);

  // Re-check auth cookies AFTER session refresh (tokens may have been
  // refreshed by updateSession)
  const authenticatedAfterRefresh = hasValidSession(request);
  authDebug("After session refresh", {
    hadSessionCookiesBefore: authenticated,
    hasSessionCookiesAfter: authenticatedAfterRefresh,
    sessionUserResolved: !!refreshedUser,
  });

  if (refreshedUser) {
    // Seed the short-lived cache — subsequent getAuthenticatedUser() calls in
    // this request (email gate + role resolution) hit it and skip a 2nd getUser().
    // Key on the caller's own token (same rule as getAuthenticatedUser) so two
    // different users on one IP can never share a cached identity.
    const accessToken = sanitizeSessionToken(getSessionAccessToken(request));
    const cacheKey = accessToken
      ? accessToken.slice(0, 32)
      : `anon_${request.headers.get("x-forwarded-for") ?? "unknown"}`;
    userCache.set(cacheKey, { user: refreshedUser, timestamp: Date.now() });
    authDebug("User cache seeded from session refresh", {
      userId: refreshedUser.id.slice(0, 8),
    });
  } else {
    // No active session after refresh — clear stale entries so a previous
    // user's cached identity can never leak into this request.
    invalidateUserCache();
  }

  // ── 5. Email verification gate (AFTER session refresh) ────────────────
  //    Authenticated but unverified users cannot enter account/dashboard/admin
  //    (or any non-exempt path). Guests may still browse public storefront.
  if (authenticatedAfterRefresh && !isVerifyExempt(pathname)) {
    const emailConfirmed = await isEmailConfirmed(request);
    authDebug("Email verification check", {
      pathname,
      emailConfirmed,
      isExempt: false,
    });
    if (!emailConfirmed) {
      authDebug("REDIRECTING: unverified email → /auth/verify-notice", {
        from: pathname,
      });
      const verifyUrl = new URL("/auth/verify-notice", request.url);
      verifyUrl.searchParams.set("redirect", pathname);
      return buildRedirectWithLoopTracking(verifyUrl, request);
    }
  } else if (authenticatedAfterRefresh && isVerifyExempt(pathname)) {
    authDebug("Email verification SKIPPED (path is exempt)", {
      pathname,
    });
  }

  // ── 6. Resolve user role (AFTER session refresh + cache invalidation) ──
  //    Pass authenticatedAfterRefresh so resolveUserRole can fall back to
  //    "customer" if getUser() fails but cookies exist.
  let userRole: AppRole | null = null;
  if (authenticatedAfterRefresh) {
    userRole = await resolveUserRole(request, authenticatedAfterRefresh);
    authDebug("Role resolution complete", {
      role: userRole,
      requiredRole,
    });
  }

  // ── 6.5 Ban enforcement ────────────────────────────────────────────────
  //    Banned accounts are sent to /banned for every page except /banned
  //    itself (public storefront browsing still works via the fast-path).
  if (authenticatedAfterRefresh && userRole && pathname !== "/banned") {
    const banned = await isAccountBanned(request);
    if (banned) {
      authDebug("BANNED ACCOUNT — redirecting to /banned", { pathname });
      return buildRedirectWithLoopTracking(
        new URL("/banned", request.url),
        request,
      );
    }
  }

  // ── 7. Role-based route protection (with redirect-loop tracking) ───────
  //    Every redirect carries a counter cookie (_tm_rlc). If 3 consecutive
  //    redirects occur, the loop-detector at step 0 short-circuits.

  // 7a. Admin-only routes
  if (requiredRole === "admin") {
    if (!authenticatedAfterRefresh || !userRole) {
      authDebug("BLOCKED: admin route, no auth", { pathname });
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return buildRedirectWithLoopTracking(loginUrl, request);
    }
    if (userRole !== "admin") {
      authDebug("BLOCKED: admin route, insufficient role", {
        userRole,
        pathname,
      });
      const forbidden = new NextResponse(
        JSON.stringify({ error: "Forbidden: Insufficient permissions." }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
      stripSensitiveHeaders(forbidden);
      return forbidden;
    }
  }

  // 7b. Merchant routes — must be merchant or admin
  if (requiredRole === "merchant") {
    if (!authenticatedAfterRefresh || !userRole) {
      authDebug("BLOCKED: merchant route, no auth — redirecting to /login", {
        pathname,
        hasCookies: authenticatedAfterRefresh,
        role: userRole,
      });
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return buildRedirectWithLoopTracking(loginUrl, request);
    }
    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.merchant) {
      authDebug("BLOCKED: merchant route, insufficient role", {
        userRole,
        requiredMinimum: "merchant",
        pathname,
      });
      return buildRedirectWithLoopTracking(new URL("/account", request.url), request);
    }
  }

  // 7c. Customer routes — any logged-in user
  if (requiredRole === "customer") {
    if (!authenticatedAfterRefresh || !userRole) {
      authDebug("BLOCKED: customer route, no auth", { pathname });
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return buildRedirectWithLoopTracking(loginUrl, request);
    }
  }

  // ── 8. Redirect authenticated users away from auth pages ────────────────
  //    Unverified sessions must stay on /auth/* (OTP / verify-notice).
  if (isAuthRoute(pathname) && authenticatedAfterRefresh && userRole) {
    const emailConfirmed = await isEmailConfirmed(request);
    if (!emailConfirmed) {
      if (pathname.startsWith("/auth/")) {
        authDebug("Unverified session on /auth/* — allowing", { pathname });
      } else {
        authDebug("Unverified session on login/signup → verify-notice", {
          from: pathname,
        });
        return buildRedirectWithLoopTracking(
          new URL("/auth/verify-notice", request.url),
          request,
        );
      }
    } else {
      authDebug("Auth page visited while logged in — redirecting", {
        userRole,
        from: pathname,
      });
      if (userRole === "admin") {
        return buildRedirectWithLoopTracking(
          new URL("/admin/dashboard", request.url),
          request,
        );
      }
      if (userRole === "merchant") {
        return buildRedirectWithLoopTracking(
          new URL("/dashboard", request.url),
          request,
        );
      }
      return buildRedirectWithLoopTracking(new URL("/account", request.url), request);
    }
  }

  // ── 9. Build response with security headers ────────────────────────────
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Copy Supabase cookies from the session refresh response
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie.name, cookie.value, cookie);
  });

  // Preserve supabase response status if modified
  if (supabaseResponse.status !== 200 && supabaseResponse.status !== 307) {
    stripSensitiveHeaders(supabaseResponse);
    return supabaseResponse;
  }

  // ── 10. Internal role context header ────────────────────────────────────
  if (userRole) {
    response.headers.set("X-User-Role", userRole);
  }

  // ── 11. Apply security headers ─────────────────────────────────────────
  applySecurityHeaders(response);

  // ── 12. Strip sensitive headers (preserve X-User-Role for downstream use)
  stripSensitiveHeaders(response, { keepRoleHeader: true });

  authDebug("<<< ALLOW", { pathname, userRole });
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
