/* -------------------------------------------------------------------------- */
/*  TrendMart — Production Environment Variable Audit & Security Validator      */
/*  PROMPT 5: Ensures all private database keys, API secrets, and storage       */
/*            credentials remain strictly server-side with zero client-side      */
/*            exposure. Runs at build time and optionally at startup.            */
/*                                                                            */
/*  This module is designed to run ONLY on the server (Node.js / Edge runtime). */
/*  It validates that:                                                          */
/*   1. All NEXT_PUBLIC_* variables are safe to expose (no secrets)             */
/*   2. Critical server-side variables are present and non-empty               */
/*   3. No sensitive keys have leaked into the client bundle                   */
/*   4. Production URLs are configured correctly                              */
/* -------------------------------------------------------------------------- */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EnvAuditResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  /** Count of exposed variables that should be private. */
  exposedSecretCount: number;
  /** Count of missing required variables. */
  missingRequiredCount: number;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Patterns that indicate a variable contains a secret and must NOT
 * be exposed via NEXT_PUBLIC_* prefix.
 */
const SECRET_PATTERNS = [
  /secret/i,
  /private/i,
  /password/i,
  /token/i,
  /key$/i,
  /credential/i,
  /^db_/i,
  /^database_/i,
  /_secret$/i,
  /_key$/i,
  /^encryption_/i,
  /^signing_/i,
  /^admin_/i,
  /^service_role/i,
  /^service_key/i,
] as const;

/**
 * These variables are known to be SAFE for client-side exposure
 * despite matching a warning pattern. They are comm-separated
 * publishable keys that Next.js intentionally exposes.
 */
const KNOWN_SAFE_PUBLIC_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_VERCEL_URL",
  "NEXT_PUBLIC_VERCEL_ENV",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_GOOGLE_MAPS_KEY",
  "NEXT_PUBLIC_MAPBOX_TOKEN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_GA_MEASUREMENT_ID",
] as const;

/**
 * Required server-side environment variables.
 * Missing any of these in production is a critical error.
 */
const REQUIRED_SERVER_VARS = [
  // Supabase
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",

  // Supabase service role (server-only, must NOT be NEXT_PUBLIC_)
  "SUPABASE_SERVICE_ROLE_KEY",

  // Database (direct connection, if used)
  "DATABASE_URL",

  // Storage
  "SUPABASE_STORAGE_BUCKET",

  // Optional but recommended for production
  // "SENTRY_DSN",
  // "UPSTASH_REDIS_URL",
] as const;

/**
 * Variables that are recommended for production but not strictly required.
 * Their absence generates a warning, not an error.
 */
const RECOMMENDED_SERVER_VARS = [
  "SENTRY_DSN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN",
  "UPSTASH_REDIS_URL",
  "UPSTASH_REDIS_TOKEN",
  "NEXT_PUBLIC_SITE_NAME",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  // Branded transactional email (Resend) — see lib/email.ts
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "SUPPORT_TEAM_EMAIL",
] as const;

/**
 * Variables that must NOT exist with the NEXT_PUBLIC_ prefix.
 * These are server-only and exposing them would be a security breach.
 */
const FORBIDDEN_PUBLIC_PREFIXES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
  "POSTGRES_URL",
  "ENCRYPTION_KEY",
  "SIGNING_KEY",
  "JWT_SECRET",
  "API_SECRET",
  "STRIPE_SECRET_KEY",
  "RESEND_API_KEY",
  "SMTP_PASSWORD",
  "AWS_SECRET_ACCESS_KEY",
] as const;

// ─── Audit Implementation ────────────────────────────────────────────────────

/**
 * Check if a variable name contains patterns indicating it's a secret.
 */
function hasSecretIndicator(name: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Database connection strings use postgres(ql):// — not https://.
 * These must be accepted by the audit even in production.
 */
function isDatabaseConnectionUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "postgresql:" || parsed.protocol === "postgres:";
  } catch {
    return false;
  }
}

/**
 * Validate that a URL is properly formed.
 * - Web / API URLs must use HTTPS in production.
 * - Database URLs (`postgresql://` / `postgres://`) are allowed as-is.
 */
function isValidUrl(url: string): boolean {
  try {
    if (isDatabaseConnectionUrl(url)) {
      return true;
    }
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
      return false; // Production web URLs must use HTTPS
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all environment variable names accessible in the current runtime.
 * In Next.js, server-side env vars are in process.env.
 * Client-side only has NEXT_PUBLIC_* vars.
 *
 * IMPORTANT: This function should ONLY be called on the server.
 * Calling it on the client would only see NEXT_PUBLIC_* vars.
 */
function getAllEnvVarNames(): string[] {
  try {
    return Object.keys(process.env);
  } catch {
    return [];
  }
}

/**
 * Run a comprehensive audit of all environment variables.
 *
 * Checks:
 *  1. NEXT_PUBLIC_* variables don't contain secrets
 *  2. All required server variables are present
 *  3. URL variables use HTTPS in production
 *  4. No forbidden variables have leaked to the public prefix
 *
 * @param isServer Whether this is running in a server context.
 *                 Set to true for server-side calls, false for build-time checks.
 */
export function auditEnvironmentVariables(isServer: boolean = true): EnvAuditResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let exposedSecretCount = 0;
  let missingRequiredCount = 0;

  const allVarNames = getAllEnvVarNames();
  const envVars: Record<string, string | undefined> = {};

  for (const name of allVarNames) {
    envVars[name] = process.env[name];
  }

  // ── 1. Check NEXT_PUBLIC_* variables for secrets ───────────────────────
  for (const name of allVarNames) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;

    // Skip known-safe variables
    if ((KNOWN_SAFE_PUBLIC_VARS as readonly string[]).includes(name)) {
      continue;
    }

    const value = envVars[name];

    // Check if the name matches secret patterns
    if (hasSecretIndicator(name)) {
      exposedSecretCount++;
      errors.push(
        `SECURITY: "${name}" matches secret patterns but uses NEXT_PUBLIC_ prefix. ` +
        `This variable will be exposed to the client browser. Rename it to remove NEXT_PUBLIC_.`,
      );
    }

    // Check if the value itself looks like a secret
    if (value) {
      if (value.length > 30 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
        warnings.push(
          `WARNING: "${name}" contains a value that looks like a base64 token/key. ` +
          `Verify this is safe for client exposure.`,
        );
      }

      // Check for common secret formats
      if (value.startsWith("sk_") || value.startsWith("sk-")) {
        exposedSecretCount++;
        errors.push(
          `CRITICAL: "${name}" contains a Stripe-like secret key (starts with sk_). ` +
          `Remove this from NEXT_PUBLIC_ immediately.`,
        );
      }
    }
  }

  // ── 2. Check forbidden public prefixes ────────────────────────────────
  for (const forbidden of FORBIDDEN_PUBLIC_PREFIXES) {
    const publicName = `NEXT_PUBLIC_${forbidden}`;
    if (envVars[publicName]) {
      exposedSecretCount++;
      errors.push(
        `CRITICAL: "${publicName}" is set. The ${forbidden} secret is being leaked to the client. ` +
        `Remove the NEXT_PUBLIC_ prefix from this variable immediately.`,
      );
    }
  }

  // ── 3. Check required server-side variables (only in server context) ───
  if (isServer) {
    for (const required of REQUIRED_SERVER_VARS) {
      const value = envVars[required];
      if (!value || value.trim() === "") {
        missingRequiredCount++;
        if (process.env.NODE_ENV === "production") {
          errors.push(`MISSING: Required variable "${required}" is not set in production.`);
        } else {
          warnings.push(`MISSING: Required variable "${required}" is not set.`);
        }
      }

      // For URL variables, validate the URL format
      if (value && (required.includes("URL") || required.includes("ENDPOINT"))) {
        if (!isValidUrl(value)) {
          errors.push(
            `INVALID_URL: "${required}" contains an invalid or non-HTTPS URL: ${value.slice(0, 50)}...`,
          );
        }
      }
    }

    // ── 4. Check recommended variables (warnings only) ───────────────────
    for (const recommended of RECOMMENDED_SERVER_VARS) {
      const value = envVars[recommended];
      if (!value || value.trim() === "") {
        if (process.env.NODE_ENV === "production") {
          warnings.push(`RECOMMENDED: "${recommended}" is not set in production.`);
        }
      }
    }
  }

  // ── 5. Check for hardcoded defaults that look like development fallbacks ──
  for (const name of allVarNames) {
    const value = envVars[name];
    if (value && (
      value.includes("localhost") ||
      value.includes("127.0.0.1") ||
      value.includes("example.com") ||
      value.includes("change_me") ||
      value.includes("TODO") ||
      value === "your-key-here"
    )) {
      if (process.env.NODE_ENV === "production") {
        warnings.push(
          `SUSPICIOUS: "${name}" contains a development/default value in production: ` +
          `"${value.slice(0, 50)}..."`,
        );
      }
    }
  }

  // ── 6. Check Supabase specific security ────────────────────────────────
  const anonKey = envVars["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const serviceRoleKey = envVars["SUPABASE_SERVICE_ROLE_KEY"];

  if (anonKey && serviceRoleKey && anonKey === serviceRoleKey) {
    exposedSecretCount++;
    errors.push(
      "CRITICAL: NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are identical. " +
      "The service_role key must NEVER be exposed to the client.",
    );
  }

  if (serviceRoleKey && serviceRoleKey.startsWith("sb_publishable_")) {
    warnings.push(
      "WARNING: SUPABASE_SERVICE_ROLE_KEY looks like a publishable/anonymous key. " +
      "The service_role key should start with 'eyJ' (JWT format), not 'sb_publishable_'.",
    );
  }

  const passed = errors.length === 0;

  return {
    passed,
    errors,
    warnings,
    exposedSecretCount,
    missingRequiredCount,
  };
}

/**
 * Generate a human-readable audit report string.
 * Useful for build logs and CI output.
 */
export function formatAuditReport(result: EnvAuditResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("  TrendMart — Environment Variable Security Audit");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("");

  if (result.passed) {
    lines.push("  ✅ PASSED — No critical issues found.");
  } else {
    lines.push(`  ❌ FAILED — ${result.errors.length} error(s) found.`);
  }

  lines.push(`  Exposed Secrets: ${result.exposedSecretCount}`);
  lines.push(`  Missing Required: ${result.missingRequiredCount}`);
  lines.push(`  Warnings: ${result.warnings.length}`);
  lines.push("");

  if (result.errors.length > 0) {
    lines.push("  ── CRITICAL ERRORS ──────────────────────────────────");
    for (const error of result.errors) {
      lines.push(`  ❌ ${error}`);
    }
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("  ── WARNINGS ─────────────────────────────────────────");
    for (const warning of result.warnings) {
      lines.push(`  ⚠️  ${warning}`);
    }
    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════");
  lines.push("");

  return lines.join("\n");
}

/**
 * Perform the audit and log results to the console.
 * Call this at the top of next.config.ts or in a server startup script.
 */
export function runEnvAudit(): void {
  // Only run on the server side (Node.js runtime)
  if (typeof window !== "undefined") return;

  const result = auditEnvironmentVariables(true);
  const report = formatAuditReport(result);

  if (process.env.NODE_ENV === "production") {
    // In production, any error is critical
    if (!result.passed) {
      console.error(report);
      if (result.exposedSecretCount > 0) {
        // Throw to fail the build if secrets are exposed
        throw new Error(
          `Environment audit FAILED: ${result.exposedSecretCount} secret(s) exposed to client. Fix before deploying to production.`,
        );
      }
    } else {
      console.info(report);
    }
  } else {
    // In development, just log the report
    console.info(report);
  }
}

/**
 * Generate a .env.example file suggestion based on required variables.
 * Useful for onboarding new developers.
 */
export function generateEnvExample(): string {
  const lines: string[] = [
    "# TrendMart — Environment Variables",
    "# Copy this file to .env.local and fill in the values.",
    "# NEVER commit .env.local or .env files to version control.",
    "",
    "# ── Supabase Configuration ─────────────────────────────────────────",
    "NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anonymous-key",
    "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key",
    "",
    "# ── Database ───────────────────────────────────────────────────────",
    "DATABASE_URL=postgresql://localhost:5432/postgres",
    "",
    "# ── Storage ────────────────────────────────────────────────────────",
    "SUPABASE_STORAGE_BUCKET=trendmart-media",
    "",
    "# ── Monitoring (Optional) ──────────────────────────────────────────",
    "# SENTRY_DSN=https://your-sentry-dsn.ingest.sentry.io/123",
    "# SENTRY_ORG=your-org",
    "# SENTRY_PROJECT=your-project",
    "",
    "# ── Redis / Rate Limiting (Optional) ───────────────────────────────",
    "# UPSTASH_REDIS_URL=https://your-redis.upstash.io",
    "# UPSTASH_REDIS_TOKEN=your-token",
    "",
    "# ── Branded Email — Resend (Optional, see lib/email.ts) ─────────────",
    "# RESEND_API_KEY=re_your_api_key",
    "# EMAIL_FROM=TrendMart <notifications@trendmart.pk>",
    "# SUPPORT_TEAM_EMAIL=support@trendmart.pk",
    "",
    "# ── Application ────────────────────────────────────────────────────",
    "NODE_ENV=development",
    "NEXT_PUBLIC_APP_URL=http://localhost:3000",
  ];

  return lines.join("\n");
}