/* -------------------------------------------------------------------------- */
/*  TrendMart — Centralised API Wrapper & Error Handler                        */
/*  Standardises try-catch blocks across all service functions, automatically   */
/*  intercepts Supabase database errors, and returns clean typed response       */
/*  objects { data, error } to keep component code lightweight and predictable. */
/* -------------------------------------------------------------------------- */

import { logError } from "@/services/errorService";
import type { PostgrestError } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Unified service result type used throughout the application.
 * Components can destructure { data, error } without inspecting
 * whether the call succeeded or failed — a nullish `error` means success.
 */
export interface ApiResponse<T> {
  /** The data payload — `null` when an error occurred. */
  data: T | null;
  /** A human-readable error message — `null` when the call succeeded. */
  error: string | null;
}

/**
 * Options that may be forwarded to every wrapped service call.
 */
export interface ApiCallOptions {
  /** Human-readable module/function name for error tracing (e.g. "shopService.fetchShops"). */
  module: string;
  /** Optional arbitrary metadata merged into the error log entry. */
  meta?: Record<string, unknown>;
  /** Optional user identifier for tracing. */
  userId?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise any thrown value into a human-readable error string.
 * Handles Supabase PostgrestError with special formatting.
 */
export function normaliseError(err: unknown): string {
  if (err instanceof Error) {
    // Supabase errors include a `code` property not exposed in base Error
    const pg = err as Error & { code?: string; details?: string; hint?: string };
    if (pg.code) {
      return `[${pg.code}] ${pg.message}${pg.details ? ` — ${pg.details}` : ""}`;
    }
    return err.message;
  }
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if ("message" in obj && typeof obj.message === "string") {
      return obj.message;
    }
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "An unexpected error occurred.";
  }
}

/**
 * Check if an unknown error is a Supabase PostgrestError.
 */
export function isPostgrestError(err: unknown): err is PostgrestError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    "details" in err
  );
}

// ─── Core Wrapper ─────────────────────────────────────────────────────────────

/**
 * Wrap an async function (typically a Supabase query) with automatic error
 * handling, logging, and normalisation.
 *
 * @example
 * ```ts
 * import { wrapApiCall } from "@/lib/apiHandler";
 *
 * export const fetchShops = (opts?: { category?: string }) =>
 *   wrapApiCall(async () => {
 *     const supabase = createClient();
 *     let query = supabase.from("shops").select("*");
 *     if (opts?.category) query = query.eq("category", opts.category);
 *     const { data, error } = await query.order("name");
 *     if (error) throw error;
 *     return data as Shop[];
 *   }, { module: "shopService.fetchShops", meta: { opts } });
 * ```
 *
 * The wrapper catches all errors (including Supabase PostgrestErrors),
 * logs them via the centralised error service, and returns a normalised
 * `ApiResponse<T>` so callers never need their own try-catch.
 */
export async function wrapApiCall<T>(
  fn: () => Promise<T>,
  opts: ApiCallOptions,
): Promise<ApiResponse<T>> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err) {
    logError(err, {
      module: opts.module,
      userId: opts.userId ?? null,
      meta: opts.meta,
    });
    return { data: null, error: normaliseError(err) };
  }
}

/**
 * Create a pre-configured wrapper bound to a specific module name.
 * Useful for service files that want a shorter call signature.
 *
 * @example
 * ```ts
 * const api = createApiWrapper("shopService");
 *
 * export const fetchShops = () =>
 *   api(async () => { ... });
 * ```
 */
export function createApiWrapper(defaultModule: string) {
  return <T>(
    fn: () => Promise<T>,
    opts?: Omit<ApiCallOptions, "module">,
  ): Promise<ApiResponse<T>> => {
    return wrapApiCall(fn, { module: defaultModule, ...opts });
  };
}

// ─── Result Helpers ───────────────────────────────────────────────────────────

/**
 * Transform an `ApiResponse<T>` into the legacy `{ success, data } | { success, error }` shape
 * used by older service callers.  This function is intentionally provided so that
 * you can migrate callers gradually — no breaking changes.
 *
 * @deprecated  Prefer destructuring `{ data, error }` from `ApiResponse<T>` directly
 *              in new code.  This helper exists purely for backwards compatibility.
 */
export function toLegacyResult<T>(
  response: ApiResponse<T>,
): { success: true; data: T } | { success: false; error: string } {
  if (response.error !== null) {
    return { success: false, error: response.error };
  }
  return { success: true, data: response.data as T };
}

/**
 * Extract usable data from an ApiResponse, throwing the error string
 * if present.  Convenient for callers that prefer try-catch style.
 */
export function unwrapOrThrow<T>(response: ApiResponse<T>): T {
  if (response.error !== null) {
    throw new Error(response.error);
  }
  return response.data as T;
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type { PostgrestError };