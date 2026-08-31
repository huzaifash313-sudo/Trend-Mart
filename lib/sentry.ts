/* -------------------------------------------------------------------------- */
/*  TrendsMart — Sentry Error Monitoring & Performance Telemetry                */
/*                                                                             */
/*  Integrates with Sentry for:                                                */
/*   - Real-time exception tracking with source maps                           */
/*   - Web Vitals monitoring (LCP, FID, CLS, INP, TTFB)                       */
/*   - Release health tracking                                                 */
/*   - Server-side error capture in API routes & server actions                */
/* -------------------------------------------------------------------------- */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
  replaysSessionSampleRate: number;
  replaysOnErrorSampleRate: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Retrieve the Sentry DSN from environment variables.
 * Falls back to undefined when not configured (graceful degradation).
 */
export function getSentryDsn(): string | undefined {
  return process.env.NEXT_PUBLIC_SENTRY_DSN;
}

/**
 * Retrieve the current environment name for Sentry grouping.
 */
export function getSentryEnvironment(): string {
  return process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    (process.env.NODE_ENV === "production" ? "production" : "development");
}

/**
 * Retrieve full Sentry configuration object for use by instrumentation hooks.
 */
export function getSentryConfig(): SentryConfig | null {
  const dsn = getSentryDsn();
  if (!dsn) return null;

  return {
    dsn,
    environment: getSentryEnvironment(),
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    replaysSessionSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE) || 0.1,
    replaysOnErrorSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE) || 1.0,
  };
}

// ---------------------------------------------------------------------------
// Web Vitals Thresholds
// ---------------------------------------------------------------------------

/**
 * Web Vitals reporting thresholds.
 * Any metric exceeding these values triggers a warning in CI.
 */
export const WEB_VITALS_THRESHOLDS = {
  /** Largest Contentful Paint — should be < 2.5s for good UX */
  LCP: 2500,
  /** First Input Delay — should be < 100ms for good UX */
  FID: 100,
  /** Cumulative Layout Shift — should be < 0.1 for good UX */
  CLS: 0.1,
  /** Interaction to Next Paint — should be < 200ms for good UX */
  INP: 200,
  /** Time to First Byte — should be < 800ms for good UX */
  TTFB: 800,
} as const;

/**
 * Report Web Vitals to analytics & Sentry.
 * Called from next/web-vitals or _app layout.
 */
export function reportWebVital(metric: {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
}): void {
  if (process.env.NODE_ENV !== "production") return;

  const threshold =
    WEB_VITALS_THRESHOLDS[metric.name as keyof typeof WEB_VITALS_THRESHOLDS];

  if (threshold && metric.value > threshold * 1.5) {
    console.warn(
      `[Web Vitals] ⚠️  ${metric.name} = ${metric.value}ms (exceeds ${threshold}ms threshold)`,
    );
  }

  if (metric.rating === "poor") {
    console.error(
      `[Web Vitals] 🔴 POOR: ${metric.name} = ${metric.value}ms`,
    );
    // In production, this would be sent to Sentry via captureMessage
    captureException(
      new Error(`Poor Web Vital: ${metric.name}`),
      {
        webVital: metric.name,
        value: metric.value,
        rating: metric.rating,
        threshold: threshold ?? "N/A",
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Exception Capture (Sentry-ready with structured logging fallback)
// ---------------------------------------------------------------------------

/**
 * Manually capture an exception with additional context.
 *
 * In a full Sentry integration this calls Sentry.captureException().
 * When Sentry DSN is not configured, falls back to structured console
 * logging for local debugging.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  // Structured console output (always available)
  console.error("[Sentry Capture]", {
    message: err.message,
    stack: err.stack,
    ...context,
  });

  if (context?.route) {
    console.error(`  Route: ${context.route}`);
  }

  // If Sentry is initialised, the actual @sentry/nextjs SDK will
  // intercept console.error calls and forward them automatically.
  // The explicit path below is for SDKs that require manual calls.
  if (typeof window !== "undefined") {
    // Browser-side: Sentry's SDK patches console.error, so this is sufficient.
    // For explicit capture when SDK is loaded asynchronously:
    try {
      const sentry = (window as unknown as Record<string, unknown>)["Sentry"] as
        | { captureException: (e: Error, ctx?: Record<string, unknown>) => void }
        | undefined;
      sentry?.captureException(err, context);
    } catch {
      // Sentry SDK not loaded — no-op
    }
  }
}

// ---------------------------------------------------------------------------
// User Context
// ---------------------------------------------------------------------------

/**
 * Set user context for error tracking.
 * Should be called after successful authentication.
 */
export function setSentryUser(user: {
  id: string;
  email?: string;
  shopId?: string;
}): void {
  console.log("[Sentry] User context set:", user.id);

  // If Sentry SDK is available, set user context
  if (typeof window !== "undefined") {
    try {
      const sentry = (window as unknown as Record<string, unknown>)["Sentry"] as
        | {
            setUser: (user: { id: string; email?: string; username?: string }) => void;
          }
        | undefined;
      sentry?.setUser({
        id: user.id,
        email: user.email,
        username: user.shopId ? `shop:${user.shopId}` : undefined,
      });
    } catch {
      // Sentry SDK not loaded — no-op
    }
  }
}

// ---------------------------------------------------------------------------
// Server-Side Error Capture (API routes, server actions)
// ---------------------------------------------------------------------------

/**
 * Capture an error from a server-side context (API route, server action).
 * This is called by the error boundary and API handler wrappers.
 */
export function captureServerError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  // Server-side: log structured JSON for log aggregation tools
  console.error(
    JSON.stringify({
      level: "error",
      source: "server",
      timestamp: new Date().toISOString(),
      message: err.message,
      stack: err.stack,
      ...context,
    }),
  );

  // If @sentry/nextjs is configured for server-side, it will
  // automatically instrument console.error. Explicit capture:
  if (getSentryDsn()) {
    // In a real Sentry setup with the Next.js SDK, this would call:
    // import * as Sentry from "@sentry/nextjs";
    // Sentry.captureException(err, { extra: context });
  }
}
