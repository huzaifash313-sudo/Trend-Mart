/* -------------------------------------------------------------------------- */
/*  TrendsMart — Production Telemetry & Performance Monitoring (Prompt 5)        */
/*                                                                             */
/*  Comprehensive telemetry pipeline integrating:                               */
/*   - Structured error logging with Sentry/Vercel Analytics fallback          */
/*   - Unhandled exception & promise rejection catchers (browser + server)     */
/*   - API latency tracking with percentile aggregation                        */
/*   - Performance monitoring (Web Vitals, custom metrics)                     */
/*   - Request/response lifecycle hooks for server-side observability           */
/*   - Rate-limiting aware telemetry batching to avoid log flooding             */
/* -------------------------------------------------------------------------- */

// ─── Types ───────────────────────────────────────────────────────────────────────

/** Severity levels for structured logging */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

/** Structured log entry */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  /** Module/component name where the log originated */
  source: string;
  /** Runtime environment: "browser" | "server" | "edge" */
  environment: "browser" | "server" | "edge";
  /** Request trace ID for correlating logs across services */
  traceId?: string;
  /** Authenticated user ID (if available) */
  userId?: string;
  /** Shop context ID (if applicable) */
  shopId?: string;
  /** Arbitrary structured metadata */
  metadata?: Record<string, unknown>;
  /** Error stack trace (for error/fatal levels) */
  stack?: string;
  /** Browser/device info */
  userAgent?: string;
  /** Page URL where the log originated (browser only) */
  url?: string;
}

/** API latency measurement */
export interface LatencyMetric {
  /** Route pattern (e.g., "/api/products/[id]") */
  route: string;
  /** HTTP method */
  method: string;
  /** Response status code */
  statusCode: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** ISO timestamp */
  timestamp: string;
}

/** Aggregated latency statistics */
export interface LatencyStats {
  route: string;
  method: string;
  count: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  lastUpdated: string;
}

/** Performance metric (Web Vital or custom) */
export interface PerformanceMetric {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  timestamp: string;
  url?: string;
}

// ─── Configuration ──────────────────────────────────────────────────────────────

/** Telemetry configuration from environment */
export interface TelemetryConfig {
  /** Enable structured logging to console */
  consoleEnabled: boolean;
  /** Minimum log level to emit (debug < info < warn < error < fatal) */
  minLevel: LogLevel;
  /** Enable Sentry integration */
  sentryEnabled: boolean;
  /** Sentry DSN */
  sentryDsn: string | undefined;
  /** Current environment name */
  environment: string;
  /** API latency tracking enabled */
  latencyTrackingEnabled: boolean;
  /** Max latency samples to keep in memory (ring buffer) */
  maxLatencySamples: number;
  /** Telemetry batch flush interval (ms) */
  flushIntervalMs: number;
}

/** Default configuration — all features enabled, appropriate for production */
function getDefaultConfig(): TelemetryConfig {
  return {
    consoleEnabled: true,
    minLevel: process.env.NODE_ENV === "production" ? "warn" : "debug",
    sentryEnabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
      (process.env.NODE_ENV === "production" ? "production" : "development"),
    latencyTrackingEnabled: process.env.NODE_ENV === "production",
    maxLatencySamples: 500,
    flushIntervalMs: 10_000,
  };
}

// ─── Log Level Numeric Mapping ──────────────────────────────────────────────────

const LOG_LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

function shouldEmit(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_WEIGHTS[level] >= LOG_LEVEL_WEIGHTS[minLevel];
}

// ─── Trace ID Generator ─────────────────────────────────────────────────────────

/**
 * Generate a compact trace ID for correlating logs across client/server boundaries.
 * Format: 16-char hex string (first 8 bytes of a UUID-like random value)
 */
function generateTraceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  // Fallback for environments without crypto
  return Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10);
}

// ─── Structured Logger Class ────────────────────────────────────────────────────

/**
 * Singleton structured logger with batching, level filtering, and multi-destination output.
 */
class TelemetryLogger {
  private config: TelemetryConfig;
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private latencySamples: LatencyMetric[] = [];

  constructor() {
    this.config = getDefaultConfig();
    this.startFlushInterval();
    this.installGlobalErrorHandlers();
  }

  /** Update configuration at runtime */
  configure(partial: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /** Get current configuration (read-only) */
  getConfig(): Readonly<TelemetryConfig> {
    return this.config;
  }

  // ─── Logging Methods ─────────────────────────────────────────────────────────

  debug(message: string, metadata?: Record<string, unknown>, source = "app"): void {
    this.log("debug", message, metadata, source);
  }

  info(message: string, metadata?: Record<string, unknown>, source = "app"): void {
    this.log("info", message, metadata, source);
  }

  warn(message: string, metadata?: Record<string, unknown>, source = "app"): void {
    this.log("warn", message, metadata, source);
  }

  error(message: string, error?: unknown, metadata?: Record<string, unknown>, source = "app"): void {
    const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined;
    this.log("error", message, metadata, source, err);
  }

  fatal(message: string, error?: unknown, metadata?: Record<string, unknown>, source = "app"): void {
    const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined;
    this.log("fatal", message, metadata, source, err);
  }

  // ─── API Latency Tracking ────────────────────────────────────────────────────

  /**
   * Record an API request latency measurement.
   * Stores in a ring buffer for percentile aggregation.
   */
  recordLatency(metric: LatencyMetric): void {
    if (!this.config.latencyTrackingEnabled) return;

    this.latencySamples.push(metric);
    if (this.latencySamples.length > this.config.maxLatencySamples) {
      this.latencySamples.shift();
    }

    // Warn on slow responses (> 1000ms)
    if (metric.durationMs > 1000) {
      this.warn(`Slow API response: ${metric.method} ${metric.route} took ${metric.durationMs}ms`, {
        route: metric.route,
        method: metric.method,
        durationMs: metric.durationMs,
        statusCode: metric.statusCode,
      }, "api-latency");
    }

    // Error on timeout-like durations (> 5000ms)
    if (metric.durationMs > 5000) {
      this.error(`API timeout threshold exceeded: ${metric.method} ${metric.route}`, undefined, {
        route: metric.route,
        method: metric.method,
        durationMs: metric.durationMs,
      }, "api-latency");
    }
  }

  /**
   * Get aggregated latency statistics for all tracked routes.
   */
  getLatencyStats(): LatencyStats[] {
    const grouped = new Map<string, LatencyMetric[]>();

    for (const sample of this.latencySamples) {
      const key = `${sample.method}:${sample.route}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(sample);
    }

    const stats: LatencyStats[] = [];
    for (const [key, samples] of grouped) {
      const [method, route] = key.split(":");
      const sorted = samples.map((s) => s.durationMs).sort((a, b) => a - b);
      const errorCount = samples.filter((s) => s.statusCode >= 400).length;

      stats.push({
        route,
        method,
        count: samples.length,
        minMs: sorted[0] ?? 0,
        maxMs: sorted[sorted.length - 1] ?? 0,
        avgMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        p99Ms: percentile(sorted, 99),
        errorRate: samples.length > 0 ? errorCount / samples.length : 0,
        lastUpdated: new Date().toISOString(),
      });
    }

    return stats.sort((a, b) => b.count - a.count);
  }

  /** Clear all latency samples */
  clearLatencySamples(): void {
    this.latencySamples = [];
  }

  // ─── Performance Metrics ─────────────────────────────────────────────────────

  /**
   * Record a Web Vital or custom performance metric.
   */
  recordPerformance(metric: PerformanceMetric): void {
    const level: LogLevel = metric.rating === "poor" ? "warn" : "info";

    this.log(level, `[Perf] ${metric.name}: ${metric.value} (${metric.rating})`, {
      metricName: metric.name,
      metricValue: metric.value,
      rating: metric.rating,
      url: metric.url,
    }, "performance");

    // Forward to Sentry for "poor" metrics
    if (metric.rating === "poor" && this.config.sentryEnabled) {
      this.log("error", `Poor Web Vital: ${metric.name} = ${metric.value}`, {
        webVital: metric.name,
        value: metric.value,
        rating: metric.rating,
      }, "performance");
    }
  }

  // ─── Internal Log Pipeline ───────────────────────────────────────────────────

  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    source = "app",
    error?: Error,
  ): void {
    if (!shouldEmit(level, this.config.minLevel) && level !== "fatal") return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      source,
      environment: typeof window === "undefined" ? "server" : "browser",
      traceId: generateTraceId(),
      metadata,
      stack: error?.stack,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    };

    // 1. Console output (always)
    if (this.config.consoleEnabled) {
      this.emitToConsole(entry);
    }

    // 2. Buffer for batch flush to external service
    this.buffer.push(entry);

    // 3. Immediate flush for fatal errors
    if (level === "fatal") {
      this.flush();
    }
  }

  private emitToConsole(entry: LogEntry): void {
    const prefix = `[${entry.level.toUpperCase()}] [${entry.source}]`;
    const color = entry.level === "error" || entry.level === "fatal"
      ? "color: #e00; font-weight: bold;"
      : entry.level === "warn"
        ? "color: #e90; font-weight: bold;"
        : "color: inherit;";

    switch (entry.level) {
      case "error":
      case "fatal":
        console.error(`%c${prefix}`, color, entry.message, entry.metadata ?? "", entry.stack ?? "");
        break;
      case "warn":
        console.warn(`%c${prefix}`, color, entry.message, entry.metadata ?? "");
        break;
      case "info":
        console.info(`%c${prefix}`, color, entry.message, entry.metadata ?? "");
        break;
      default:
        console.debug(`%c${prefix}`, color, entry.message, entry.metadata ?? "");
    }
  }

  // ─── Flush to External Services ──────────────────────────────────────────────

  private startFlushInterval(): void {
    if (typeof window === "undefined") return; // Only browser-side batching for now

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs);
  }

  /** Flush buffered logs to external monitoring services */
  flush(): void {
    if (this.buffer.length === 0) return;

    const batch = [...this.buffer];
    this.buffer = [];

    // Send to Sentry (if configured)
    if (this.config.sentryEnabled && this.config.sentryDsn) {
      this.sendToSentry(batch).catch(() => {
        // Silently fail — don't cause recursive error loops
      });
    }

    // Send to Vercel Analytics (if available)
    if (typeof window !== "undefined" && "va" in window) {
      this.sendToVercelAnalytics(batch);
    }
  }

  private async sendToSentry(batch: LogEntry[]): Promise<void> {
    // Sentry SDK handles batching internally; we forward error-level entries
    for (const entry of batch) {
      if (entry.level === "error" || entry.level === "fatal") {
        try {
          const sentry = (window as unknown as Record<string, unknown>)["Sentry"] as
            | { captureException: (e: Error, ctx?: Record<string, unknown>) => void }
            | undefined;
          if (sentry?.captureException) {
            const error = new Error(entry.message);
            error.stack = entry.stack;
            sentry.captureException(error, {
              extra: {
                ...entry.metadata,
                source: entry.source,
                traceId: entry.traceId,
                logLevel: entry.level,
              },
              tags: {
                source: entry.source,
                environment: entry.environment,
              },
            });
          }
        } catch {
          // Sentry SDK unavailable or threw — silently continue
        }
      }
    }
  }

  private sendToVercelAnalytics(batch: LogEntry[]): void {
    try {
      const va = (window as unknown as Record<string, unknown>)["va"] as
        | ((event: string, properties?: Record<string, unknown>) => void)
        | undefined;
      if (va) {
        for (const entry of batch) {
          if (entry.level === "error" || entry.level === "fatal") {
            va("exception", {
              message: entry.message,
              source: entry.source,
              level: entry.level,
            });
          }
        }
      }
    } catch {
      // Analytics unavailable
    }
  }

  // ─── Global Error Handlers ──────────────────────────────────────────────────

  /**
   * Install global handlers for uncaught exceptions and unhandled rejections.
   * These act as safety nets for errors that escape component error boundaries.
   */
  private installGlobalErrorHandlers(): void {
    if (typeof window === "undefined") return;

    // Uncaught exceptions (synchronous)
    window.addEventListener("error", (event: ErrorEvent) => {
      this.fatal(
        `Uncaught exception: ${event.message}`,
        event.error,
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
        "global-error-handler",
      );
    });

    // Unhandled promise rejections
    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      this.fatal(
        `Unhandled promise rejection: ${String(event.reason)}`,
        event.reason instanceof Error ? event.reason : undefined,
        {
          reason: String(event.reason),
        },
        "global-rejection-handler",
      );
    });
  }
}

// ─── Server-Side Telemetry ─────────────────────────────────────────────────────

/**
 * Server-side API route latency wrapper.
 * Wraps a Next.js API route handler with automatic latency recording.
 *
 * @example
 * ```ts
 * import { withLatencyTracking } from "@/lib/telemetry";
 *
 * export const GET = withLatencyTracking(async (request) => {
 *   // your handler logic
 *   return NextResponse.json({ data: "ok" });
 * }, "/api/products");
 * ```
 */
export function withLatencyTracking(
  handler: (req: Request, ...args: unknown[]) => Promise<Response>,
  route: string,
): (req: Request, ...args: unknown[]) => Promise<Response> {
  return async (req: Request, ...args: unknown[]): Promise<Response> => {
    const start = performance.now();
    let statusCode = 500;

    try {
      const response = await handler(req, ...args);
      statusCode = response.status;
      return response;
    } catch (err) {
      statusCode = 500;
      throw err;
    } finally {
      const durationMs = Math.round(performance.now() - start);
      telemetry.recordLatency({
        route,
        method: req.method,
        statusCode,
        durationMs,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Server-side structured error logger for API routes and server actions.
 * Captures the request context alongside the error.
 */
export function logServerError(
  error: unknown,
  request: Request,
  context?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  telemetry.error(
    `Server error: ${err.message}`,
    err,
    {
      method: request.method,
      url: request.url,
      ...context,
    },
    "server-api",
  );
}

// ─── Singleton Instance ────────────────────────────────────────────────────────

/** Global telemetry logger instance */
export const telemetry = new TelemetryLogger();

// ─── Convenience Exports ───────────────────────────────────────────────────────

/** Quick debug log */
export const log = telemetry.debug.bind(telemetry);

/** Quick info log */
export const logInfo = telemetry.info.bind(telemetry);

/** Quick warn log */
export const logWarn = telemetry.warn.bind(telemetry);

/** Quick error log */
export const logError = telemetry.error.bind(telemetry);

/**
 * Initialize telemetry with custom configuration.
 * Should be called once at app startup (e.g., in _app.tsx or layout.tsx).
 */
export function initTelemetry(config?: Partial<TelemetryConfig>): void {
  if (config) {
    telemetry.configure(config);
  }
  telemetry.info("Telemetry initialized", {
    environment: telemetry.getConfig().environment,
    sentryEnabled: telemetry.getConfig().sentryEnabled,
  }, "telemetry-bootstrap");
}

// ─── Percentile Calculation Helper ─────────────────────────────────────────────

/**
 * Calculate a percentile value from a sorted array of numbers.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}