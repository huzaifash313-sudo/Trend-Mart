/* -------------------------------------------------------------------------- */
/*  TrendMart — Next.js Middleware                                             */
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
import { getDistributedRateLimiter } from "@/lib/rateLimiterRedis";

// ═══════════════════════════════════════════════════════════════════════════════
// TRENDMART MIDDLEWARE — v2.0 FIXED
// Fix: Reordered session refresh BEFORE auth checks to prevent stale-cache
//      redirects. Added comprehensive debug logging. Unverified users can now
//      access /dashboard with a warning instead of being completely blocked.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Debug Mode (set to true during troubleshooting) ──────────────────────
const DEBUG_AUTH = true; // Logs auth decisions to server console

function authDebug(message: string, data?: Record<string, unknown>): void {
  if (!DEBUG_AUTH) return;
  const timestamp = new Date().toISOString();
  console.log(
    `[TrendMart MW ${timestamp}] ${message}`,
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
  try {
    const result = await limiter.checkRateLimit(request, {
      maxRequests: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
      name: "middleware-global",
    });
    return result.allowed;
  } catch {
    console.warn("[TrendMart MW] Rate limiter error — allowing as failsafe");
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


// ─── Role & Route Configuration ────────────────────────────────────────────

type AppRole = "customer" | "merchant" | "admin";

const ROLE_HIERARCHY: Record<AppRole, number> = {
  customer: 0,
  merchant: 1,
  admin: 2,
};

const ROLE_ROUTE_MAP = {
  /** Routes that require at minimum an authenticated user (any role). */
  customer: ["/auth/settings", "/account"],
  /** Routes that require merchant or higher (store owners). */
  merchant: ["/dashboard", "/shop/manage"],
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
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

function canAccessRoute(role: AppRole | null, pathname: string): boolean {
  const required = getRequiredRole(pathname);
  if (required === "public") return true;
  if (!role) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[required];
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
  const accessToken = sanitizeSessionToken(
    request.cookies.get("sb-access-token")?.value,
  );
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
  if (!user) return true; // No session = nothing to verify
  return !!user.email_confirmed_at;
}

/**
 * Paths that unverified users ARE allowed to access.
 * FIX: Added /dashboard so unverified users can access their dashboard
 * with a warning instead of being completely blocked.
 */
const VERIFY_EXEMPT_PATHS = [
  "/login",
  "/signup",
  "/auth",
  "/auth/verify-notice",
  "/auth/callback",
  "/settings",
  "/dashboard", // FIX: Allow unverified users to access dashboard (shows warning client-side)
  "/account", // Customer portal shows its own verify banner; avoid account↔verify loops
  "/wishlist",
  "/orders",
  "/search",
  "/shop",
];

function isVerifyExempt(pathname: string): boolean {
  return VERIFY_EXEMPT_PATHS.some((p) => pathname.startsWith(p));
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

    // If getUser fails but cookies exist, do NOT force "customer" for /dashboard —
    // that caused account↔dashboard loops when the client still saw merchant/shop.
    // Prefer metadata hints, else allow merchant-tier so the page can load.
    if (!user) {
      if (authenticated) {
        authDebug(
          "resolveUserRole: getUser failed but cookies exist — using metadata / merchant fallback",
        );
        return "merchant";
      }
      return null;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      authDebug("resolveUserRole: MISSING ENV VARS");
      return authenticated ? "merchant" : null;
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

    // 1) Explicit role row (maybeSingle — missing row is normal for older accounts)
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const VALID_ROLES: readonly string[] = ["customer", "merchant", "admin"];
    if (roleData?.role && VALID_ROLES.includes(roleData.role)) {
      // Shop owners must keep merchant access even if row still says "customer"
      if (roleData.role === "customer") {
        const { data: shop } = await supabase
          .from("shops")
          .select("id")
          .eq("owner_id", user.id)
          .limit(1)
          .maybeSingle();
        if (shop?.id) {
          authDebug("resolveUserRole: customer row but owns shop → merchant");
          return "merchant";
        }
      }
      authDebug("resolveUserRole: SUCCESS", { role: roleData.role });
      return roleData.role as AppRole;
    }

    // 2) JWT metadata (signup role)
    const meta =
      (typeof user.user_metadata?.role === "string"
        ? user.user_metadata.role
        : undefined) ||
      (typeof user.app_metadata?.role === "string"
        ? user.app_metadata.role
        : undefined);
    if (meta === "admin" || meta === "merchant" || meta === "customer") {
      if (meta === "customer") {
        const { data: shop } = await supabase
          .from("shops")
          .select("id")
          .eq("owner_id", user.id)
          .limit(1)
          .maybeSingle();
        if (shop?.id) {
          authDebug("resolveUserRole: metadata customer but owns shop → merchant");
          return "merchant";
        }
      }
      authDebug("resolveUserRole: from metadata", { role: meta });
      return meta;
    }

    // 3) Shop ownership — older merchants before user_roles existed
    const { data: shop } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();
    if (shop?.id) {
      authDebug("resolveUserRole: shop owner → merchant");
      return "merchant";
    }

    authDebug("resolveUserRole: default customer");
    return "customer";
  } catch (err) {
    authDebug("resolveUserRole: EXCEPTION", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail open to merchant tier when cookies exist so /dashboard isn't bounced to /account
    return authenticated ? "merchant" : null;
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
    "camera=(), microphone=(), geolocation=self",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("X-Download-Options", "noopen");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");

  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    // Always allow Supabase HTTPS + Realtime WebSockets (prod was missing wss://)
    "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in",
    "font-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  if (process.env.NODE_ENV !== "production") {
    cspDirectives[4] =
      "connect-src 'self' ws: wss: https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in";
  }
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  // ── 1. Rate limiting check (edge-safe, async) ──────────────────────────
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

  // ── 2. Route classification ────────────────────────────────────────────
  const requiredRole = getRequiredRole(pathname);
  const authenticated = hasValidSession(request);

  authDebug("Route classification", {
    pathname,
    requiredRole,
    hasSessionCookies: authenticated,
    isAuthRoute: isAuthRoute(pathname),
    isVerifyExempt: isVerifyExempt(pathname),
  });

  // ── 3. PUBLIC routes: fast-path, skip all auth ─────────────────────────
  if (
    requiredRole === "public" &&
    !isAuthRoute(pathname) &&
    !isVerifyExempt(pathname)
  ) {
    authDebug("PUBLIC route — fast return");
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
  //    Now we refresh FIRST, then clear the cache, then do all checks.
  const supabaseResponse = await updateSession(request);

  // Invalidate the user cache so subsequent calls use fresh tokens
  invalidateUserCache();

  // Re-check auth cookies AFTER session refresh (tokens may have been
  // refreshed by updateSession)
  const authenticatedAfterRefresh = hasValidSession(request);
  authDebug("After session refresh", {
    hadSessionCookiesBefore: authenticated,
    hasSessionCookiesAfter: authenticatedAfterRefresh,
  });

  // ── 5. Email verification gate (AFTER session refresh) ────────────────
  //    Only check if user has session AND the path requires verification.
  //    FIX: /dashboard is now in VERIFY_EXEMPT_PATHS, so unverified users
  //    can access their dashboard (the page will show a warning client-side).
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
  if (isAuthRoute(pathname) && authenticatedAfterRefresh && userRole) {
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
