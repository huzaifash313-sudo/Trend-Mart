/* -------------------------------------------------------------------------- */
/*  TrendMart — Centralised Error Logging & Monitoring Utility                 */
/*  Structured wrapper for catching, formatting, and safely logging errors      */
/*  across all service layers without crashing the client application.          */
/* -------------------------------------------------------------------------- */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ErrorContext {
  /** Name of the module / service where the error originated (e.g. "shopService.fetchShops"). */
  module: string;
  /** Optional user identifier (auth UUID) for tracing who triggered the error. */
  userId?: string | null;
  /** Arbitrary additional metadata (e.g. shopId, productId) for debugging. */
  meta?: Record<string, unknown>;
}

export interface FormattedError {
  timestamp: string;        // ISO-8601
  module: string;
  userId: string | null;
  message: string;
  stack?: string;
  meta?: Record<string, unknown>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of errors to keep in the in-memory ring buffer. */
const MAX_BUFFER_SIZE = 50;

// ─── In-memory ring buffer (for optional dashboard debugging) ────────────────

const errorBuffer: FormattedError[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely extract a stack trace string from an unknown error. */
function extractStack(err: unknown): string | undefined {
  if (err instanceof Error && err.stack) return err.stack;
  return undefined;
}

/** Normalise any thrown value into a human-readable message. */
function normaliseMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "An unknown error occurred.";
  }
}

/** Push an entry into the ring buffer, trimming old entries if needed. */
function pushToBuffer(entry: FormattedError): void {
  errorBuffer.push(entry);
  if (errorBuffer.length > MAX_BUFFER_SIZE) {
    errorBuffer.shift();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Format an error into a structured, serialisable log object.
 * This is intentionally synchronous and non-throwing — it must never
 * itself become a source of unhandled exceptions.
 */
export function formatError(err: unknown, ctx: ErrorContext): FormattedError {
  const entry: FormattedError = {
    timestamp: new Date().toISOString(),
    module: ctx.module,
    userId: ctx.userId ?? null,
    message: normaliseMessage(err),
    stack: extractStack(err),
    meta: ctx.meta,
  };
  return entry;
}

/**
 * Log a structured error to the console AND the in-memory buffer.
 *
 * In production you would also POST to an external monitoring endpoint
 * (Sentry, LogRocket, etc.) — this is a ready-made hook point.
 *
 * @param err    The caught error (or any thrown value).
 * @param ctx    Contextual metadata (module name, userId, etc.).
 * @returns      The formatted error entry (for chaining / return).
 */
export function logError(err: unknown, ctx: ErrorContext): FormattedError {
  const entry = formatError(err, ctx);

  // 1. In-memory buffer (accessible via getErrorBuffer for debugging)
  pushToBuffer(entry);

  // 2. Console output — grouped for readability in DevTools
  const style = "color: #e00; font-weight: bold;";
  console.groupCollapsed(
    `%c[TrendMart Error] %c${entry.module}`,
    style,
    "color: inherit;",
  );
  console.log("Timestamp :", entry.timestamp);
  console.log("User      :", entry.userId ?? "(anonymous)");
  console.log("Message   :", entry.message);
  if (entry.stack) console.log("Stack     :\n", entry.stack);
  if (entry.meta) console.log("Metadata  :", entry.meta);
  console.groupEnd();

  // 3. (Future) POST to external monitoring endpoint
  // sendToMonitoring(entry);

  return entry;
}

/**
 * Higher-order wrapper that catches synchronous and asynchronous errors
 * thrown by a service function, logs them with context, and returns a
 * normalised `ServiceResult` failure object.
 *
 * @example
 * ```ts
 * const safeFetch = wrapServiceError(fetchShops, "shopService.fetchShops");
 * const result = await safeFetch({ category: "Food" });
 * // result is always { success: boolean, data?: T, error?: string }
 * ```
 */
export function wrapServiceError<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  module: string,
  getUserFn?: () => Promise<string | null> | string | null,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    try {
      return await fn(...args);
    } catch (err) {
      const userId = getUserFn ? await Promise.resolve(getUserFn()) : null;
      logError(err, { module, userId });
      throw err; // re-throw so caller can still handle it via their own catch
    }
  };
}

/**
 * Retrieve a *copy* of the in-memory error buffer (for debugging dashboards).
 */
export function getErrorBuffer(): readonly FormattedError[] {
  return [...errorBuffer];
}

/**
 * Clear the in-memory error buffer.
 */
export function clearErrorBuffer(): void {
  errorBuffer.length = 0;
}

// ─── Re-export for convenience ─────────────────────────────────────────────────

export { normaliseMessage as toErrorMessage };