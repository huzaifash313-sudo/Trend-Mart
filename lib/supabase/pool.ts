/* -------------------------------------------------------------------------- */
/*  TrendMart — Enterprise Connection Pooling & Retry Configuration            */
/*  PROMPT 1: Configure connection limits, idle timeouts, and retry logic       */
/*           to prevent exhaustion under heavy concurrent user traffic.         */
/* -------------------------------------------------------------------------- */

import type { SupabaseClientOptions } from "@supabase/supabase-js";

// ─── Connection Pool Configuration ───────────────────────────────────────────

/**
 * Maximum number of concurrent connections per server instance.
 * Tuned for Vercel serverless functions (which scale horizontally).
 * Each function instance maintains its own pool; this limit prevents
 * any single instance from exhausting Supabase connection slots.
 *
 * Supabase free tier: ~60 connections via pgBouncer
 * Supabase pro tier:  ~200 connections
 * Per-instance limit of 5 ensures at least 12 concurrent serverless
 * functions before hitting free-tier limits.
 */
export const CONNECTION_POOL_CONFIG = {
  /** Maximum concurrent connections per serverless instance. */
  maxConnections: 5,

  /** Connection idle timeout in milliseconds (30 seconds).
   *  Connections idle longer than this are recycled to free up slots. */
  idleTimeoutMs: 30_000,

  /** Maximum connection lifetime in milliseconds (10 minutes).
   *  Forces connection rotation to prevent stale/TCP-timeout connections. */
  maxLifetimeMs: 600_000,

  /** Connection acquire timeout in milliseconds (10 seconds).
   *  If a connection cannot be acquired within this window, the request
   *  fails fast rather than hanging indefinitely. */
  acquireTimeoutMs: 10_000,

  /** Minimum idle connections to keep warm in the pool.
   *  Reduces cold-start latency for sudden traffic spikes. */
  minIdleConnections: 1,

  /** Health check interval in milliseconds (15 seconds).
   *  Periodically validates idle connections are still alive. */
  healthCheckIntervalMs: 15_000,
} as const;

// ─── Retry Configuration ─────────────────────────────────────────────────────

export interface RetryConfig {
  /** Maximum number of retry attempts (including the initial call). */
  maxRetries: number;
  /** Base delay in milliseconds before first retry. */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds. */
  maxDelayMs: number;
  /** Backoff multiplier (e.g., 2 = exponential, 1.5 = slower exponential). */
  backoffMultiplier: number;
  /** Whether to add jitter to prevent thundering herd. */
  jitter: boolean;
  /** Error codes that should NOT be retried (e.g., auth errors, data violations). */
  nonRetryableCodes: string[];
  /** Whether to retry on network/timeout errors only. */
  retryOnNetworkOnly: boolean;
}

/**
 * Default retry configuration for database operations.
 *
 * Strategy: Exponential backoff with full jitter.
 * - Attempt 1: immediate
 * - Attempt 2: 200-400ms delay
 * - Attempt 3: 400-800ms delay
 * - Max 3 attempts total before failing
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 200,
  maxDelayMs: 3000,
  backoffMultiplier: 2,
  jitter: true,
  nonRetryableCodes: [
    "23505", // unique_violation
    "23503", // foreign_key_violation
    "23514", // check_violation
    "42501", // insufficient_privilege
    "42P01", // undefined_table
    "42703", // undefined_column
    "23502", // not_null_violation
    "22P02", // invalid_text_representation
    "PGRST", // PostgREST errors (starts with PGRST)
  ],
  retryOnNetworkOnly: false,
};

/**
 * Aggressive retry config for operations where consistency is critical
 * (e.g., inventory deductions during checkout).
 */
export const CRITICAL_RETRY_CONFIG: RetryConfig = {
  ...DEFAULT_RETRY_CONFIG,
  maxRetries: 5,
  baseDelayMs: 100,
  maxDelayMs: 5000,
};

/**
 * Lightweight retry config for read-only queries.
 */
export const READ_RETRY_CONFIG: RetryConfig = {
  ...DEFAULT_RETRY_CONFIG,
  maxRetries: 2,
  baseDelayMs: 50,
};

// ─── Retry Executor ───────────────────────────────────────────────────────────

/**
 * Execute an async database operation with automatic retry logic.
 *
 * Uses exponential backoff with optional jitter to prevent thundering herd
 * when many concurrent requests fail simultaneously and retry.
 *
 * @param operation  The async function to execute (should return Supabase response)
 * @param config     Retry configuration (defaults to DEFAULT_RETRY_CONFIG)
 * @returns          The result of the operation
 * @throws           The last error if all retries are exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const cfg: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  let lastError: unknown;
  let delay = cfg.baseDelayMs;

  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      // Check if the error is non-retryable
      if (isNonRetryableError(err, cfg)) {
        throw err;
      }

      // If this was the last attempt, don't wait
      if (attempt === cfg.maxRetries) {
        break;
      }

      // Calculate backoff delay
      const jitteredDelay = cfg.jitter
        ? Math.random() * delay
        : delay;

      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));

      // Exponential backoff for next attempt
      delay = Math.min(delay * cfg.backoffMultiplier, cfg.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Determine if an error should NOT be retried based on its PostgreSQL error code
 * or HTTP status code.
 */
function isNonRetryableError(err: unknown, config: RetryConfig): boolean {
  if (err instanceof Error) {
    const pg = err as Error & { code?: string; status?: number };

    // PostgreSQL error codes
    if (pg.code) {
      for (const nonRetryable of config.nonRetryableCodes) {
        if (pg.code.startsWith(nonRetryable)) {
          return true;
        }
      }
    }

    // HTTP status codes that indicate client error (4xx except 429)
    if (pg.status && pg.status >= 400 && pg.status < 500 && pg.status !== 429) {
      return true;
    }

    // Network errors are always retryable
    const message = pg.message?.toLowerCase() ?? "";
    if (
      message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("socket hang up")
    ) {
      return false;
    }

    if (config.retryOnNetworkOnly) {
      return true;
    }
  }

  return false;
}

// ─── Supabase Client Options with Pooling ─────────────────────────────────────

/**
 * Generate Supabase client options with enterprise-grade connection
 * management and retry configuration.
 */
export function getPooledClientOptions(opts?: {
  retry?: Partial<RetryConfig>;
}): Partial<SupabaseClientOptions<"public">> {
  return {
    db: {
      schema: "public",
    },
    global: {
      headers: {
        "x-client-info": "trendmart-nextjs/0.1.0",
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 1,
      },
    },
  };
}

// ─── Connection Health Check ──────────────────────────────────────────────────

/**
 * Perform a lightweight health check against the Supabase connection.
 */
export async function checkConnectionHealth(supabase: {
  from: (table: string) => {
    select: (columns: string, opts?: { count: "exact"; head: boolean }) =>
      Promise<{ error: unknown }>;
  };
}): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    const { error } = await supabase
      .from("shops")
      .select("*", { count: "exact", head: true });

    const latencyMs = Math.round(performance.now() - start);

    if (error) {
      return { healthy: false, latencyMs, error: (error as Error).message };
    }

    return { healthy: true, latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      healthy: false,
      latencyMs,
      error: err instanceof Error ? err.message : "Unknown connection error",
    };
  }
}

// ─── Connection Metrics ───────────────────────────────────────────────────────

interface ConnectionMetrics {
  totalQueries: number;
  failedQueries: number;
  avgLatencyMs: number;
  lastHealthCheck: number;
  isHealthy: boolean;
}

/**
 * In-memory connection metrics tracker (per serverless instance).
 */
class ConnectionMetricsTracker {
  private totalQueries = 0;
  private failedQueries = 0;
  private latencySamples: number[] = [];
  private lastHealthCheckTimestamp = 0;
  private healthy = true;

  recordQuery(latencyMs: number, success: boolean): void {
    this.totalQueries++;
    if (!success) this.failedQueries++;
    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > 100) {
      this.latencySamples.shift();
    }
  }

  recordHealthCheck(isHealthy: boolean): void {
    this.healthy = isHealthy;
    this.lastHealthCheckTimestamp = Date.now();
  }

  getMetrics(): ConnectionMetrics {
    const avgLatencyMs =
      this.latencySamples.length > 0
        ? Math.round(
            this.latencySamples.reduce((a, b) => a + b, 0) /
              this.latencySamples.length,
          )
        : 0;

    return {
      totalQueries: this.totalQueries,
      failedQueries: this.failedQueries,
      avgLatencyMs,
      lastHealthCheck: this.lastHealthCheckTimestamp,
      isHealthy: this.healthy,
    };
  }

  reset(): void {
    this.totalQueries = 0;
    this.failedQueries = 0;
    this.latencySamples = [];
    this.healthy = true;
  }
}

/** Singleton metrics tracker for the serverless instance. */
export const connectionMetrics = new ConnectionMetricsTracker();