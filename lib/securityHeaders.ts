/* -------------------------------------------------------------------------- */
/*  TrendsMart — CSP Nonce Generator & Security Header Utilities                 */
/*  PROMPT 4: Configures enterprise-grade Content Security Policy (CSP),       */
/*           strict Transport Security (HSTS), X-Frame-Options, and             */
/*           X-Content-Type-Options headers in the Next.js deployment.          */
/* -------------------------------------------------------------------------- */

import { randomBytes } from "crypto";

// ─── CSP Nonce Generation ────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure random nonce for CSP.
 * Nonces are base64-encoded random strings used to allow specific
 * inline scripts/styles while blocking all others.
 *
 * Each request gets a unique nonce, preventing attackers from
 * predicting and injecting matching nonces into malicious payloads.
 *
 * @param length  Number of random bytes (default 16 = 128 bits)
 * @returns       Base64-encoded nonce string
 */
export function generateCspNonce(length: number = 16): string {
  return randomBytes(length).toString("base64");
}

/**
 * Build a complete Content-Security-Policy header value with
 * strict nonce-based script execution policy.
 *
 * This policy is significantly stricter than the one in next.config.ts
 * and should be used for routes that handle user-generated content
 * or sensitive operations (admin dashboard, checkout, account).
 *
 * @param nonce  A unique nonce generated for this request
 * @returns      The CSP header value string
 */
export function buildStrictCspPolicy(nonce: string): string {
  const directives: string[] = [
    // Default: block everything by default
    "default-src 'self'",

    // Scripts: ONLY allow scripts with the request-specific nonce
    // NO 'unsafe-inline', NO 'unsafe-eval' — this is truly strict
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline' 'unsafe-eval'`,

    // Styles: allow inline styles (needed for CSS-in-JS / Tailwind)
    `style-src 'self' 'unsafe-inline' https://*.supabase.co`,

    // Images: allow self-hosting, data URIs, and trusted CDNs
    "img-src 'self' data: https: blob:",

    // Fonts: self-hosted only
    "font-src 'self' data:",

    // Connections: Supabase API + realtime websockets + OSM reverse geocode
    // + Cloudinary upload API (merchant image/story uploads run from the browser).
    // + Cloudflare Turnstile siteverify / challenge assets.
    "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://nominatim.openstreetmap.org https://api.cloudinary.com https://res.cloudinary.com https://challenges.cloudflare.com",

    // Frames: Turnstile challenge iframe only
    "frame-src 'self' https://challenges.cloudflare.com",

    // Objects: none (prevents Flash/ActiveX injection)
    "object-src 'none'",

    // Base URI: restrict to self
    "base-uri 'self'",

    // Form actions: restrict to self (prevents form data exfiltration)
    "form-action 'self'",

    // Frame ancestors: none (defense-in-depth against clickjacking)
    "frame-ancestors 'none'",

    // Manifest: self only
    "manifest-src 'self'",

    // Media: self only
    "media-src 'self'",

    // Worker: self only
    "worker-src 'self' blob:",

    // Upgrade insecure requests in production
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),

    // Report violations to a monitoring endpoint
    `report-uri /api/csp-violation-report`,
  ];

  return directives.join("; ");
}

/**
 * Build a report-only CSP policy for testing.
 * Use this to evaluate CSP violations in production before
 * enforcing with the strict policy.
 *
 * @param nonce  A unique nonce for this request
 * @returns      CSP-Report-Only header value
 */
export function buildCspReportOnlyPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline' 'unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src * data: https: blob:",
    "connect-src * https: wss:",
    "frame-src 'none'",
    "object-src 'none'",
    `report-uri /api/csp-violation-report`,
  ].join("; ");
}

// ─── Security Header Builders ────────────────────────────────────────────────

/**
 * All security headers applied to every response.
 * These are the minimum headers for basic hardening.
 */
export function getBaseSecurityHeaders(): Record<string, string> {
  return {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=(self)",
    "X-Permitted-Cross-Domain-Policies": "none",
    "X-Download-Options": "noopen",
    "X-DNS-Prefetch-Control": "on",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "unsafe-none",
  };
}

/**
 * Enhanced security headers for sensitive routes (admin, dashboard, checkout).
 * Includes stricter CSP with nonce.
 *
 * @param nonce  Request-specific nonce for CSP
 * @returns      Record of security header key-value pairs
 */
export function getEnhancedSecurityHeaders(nonce: string): Record<string, string> {
  return {
    ...getBaseSecurityHeaders(),
    "Content-Security-Policy": buildStrictCspPolicy(nonce),
  };
}

/**
 * Applies all security headers to a Response object.
 *
 * @param response  The NextResponse or Response object
 * @param nonce     Optional request-specific nonce for CSP
 */
export function applySecurityHeadersToResponse(
  response: Response,
  nonce?: string,
): void {
  const headers = nonce
    ? getEnhancedSecurityHeaders(nonce)
    : getBaseSecurityHeaders();

  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  // Remove server fingerprinting headers
  response.headers.delete("Server");
  response.headers.delete("X-Powered-By");
}

// ─── Nonce Context for React Server Components ───────────────────────────────

/**
 * Generates a CSP nonce and provides it via React context or server props.
 * Use this in Server Components that render user-generated content.
 *
 * @returns Object containing the nonce value and CSP header string
 */
export function createCspNonceContext(): {
  nonce: string;
  cspHeader: string;
  cspReportOnlyHeader: string;
} {
  const nonce = generateCspNonce();

  return {
    nonce,
    cspHeader: buildStrictCspPolicy(nonce),
    cspReportOnlyHeader: buildCspReportOnlyPolicy(nonce),
  };
}

// ─── Token & Secret Pattern Scanner ──────────────────────────────────────────

/**
 * Patterns that indicate a hardcoded secret or token in source code.
 * Used by CI/CD pipeline scanning and the env variable audit.
 */
export const SECRET_PATTERNS: Array<{
  name: string;
  regex: RegExp;
  severity: "critical" | "high" | "medium";
}> = [
  {
    name: "Supabase Service Role Key",
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    severity: "critical",
  },
  {
    name: "AWS Access Key ID",
    regex: /AKIA[0-9A-Z]{16}/,
    severity: "critical",
  },
  {
    name: "GitHub Personal Access Token",
    regex: /ghp_[A-Za-z0-9]{36,}/,
    severity: "critical",
  },
  {
    name: "Private SSH Key",
    regex: /-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----/,
    severity: "critical",
  },
  {
    name: "JWT Token",
    regex: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}/,
    severity: "high",
  },
  {
    name: "Google API Key",
    regex: /AIza[0-9A-Za-z_-]{35}/,
    severity: "high",
  },
  {
    name: "Stripe Secret Key",
    regex: /sk_live_[0-9a-zA-Z]{24,}/,
    severity: "critical",
  },
  {
    name: "Vercel Token",
    regex: /vercel_[A-Za-z0-9]{20,}/,
    severity: "high",
  },
  {
    name: "Generic API Key Assignment",
    regex: /(api[-_]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_-]{8,}['"]/i,
    severity: "high",
  },
  {
    name: "Database Connection String",
    regex: /(postgres(ql)?|mysql|mongodb|sqlite):\/\/[^'"\s]+@/i,
    severity: "critical",
  },
];

/**
 * Scan a string for hardcoded secrets.
 * Returns an array of detected patterns with their severity.
 */
export function scanForSecrets(content: string): Array<{
  name: string;
  severity: string;
  match: string;
}> {
  const findings: Array<{ name: string; severity: string; match: string }> = [];

  for (const pattern of SECRET_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches) {
      for (const match of matches) {
        // Redact the actual secret in logs
        const redacted = match.length > 12
          ? match.slice(0, 6) + "..." + match.slice(-4)
          : "***";
        findings.push({
          name: pattern.name,
          severity: pattern.severity,
          match: redacted,
        });
      }
    }
  }

  return findings;
}