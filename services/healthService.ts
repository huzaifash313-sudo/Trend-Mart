/* -------------------------------------------------------------------------- */
/*  TrendsMart — Health Monitoring & Diagnostic Service (Prompt 99)            */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { HealthCheckResult } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/* -------------------------------------------------------------------------- */
/*  Required Environment Variables                                            */
/* -------------------------------------------------------------------------- */

const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/* -------------------------------------------------------------------------- */
/*  Health Check                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Perform a full system health check across Supabase connection, key table
 * availability (shops, products, orders), and required environment variables.
 *
 * Returns a structured {@link HealthCheckResult} with status:
 * - `"healthy"` — all checks pass.
 * - `"degraded"` — some checks pass but one or more failed.
 * - `"unhealthy"` — critical checks failed (no connection, missing all env vars).
 *
 * **Note:** This is intended as a developer diagnostic / monitoring endpoint.
 * It does NOT expose sensitive values; only presence/absence is reported.
 */
export async function runFullHealthCheck(): Promise<
  ServiceResult<HealthCheckResult>
> {
  const start = performance.now();
  const supabase = createClient();

  const checks: HealthCheckResult["checks"] = {
    supabase_connection: { ok: false, latency_ms: 0 },
    tables: {
      shops: { ok: false, row_count: 0 },
      products: { ok: false, row_count: 0 },
      orders: { ok: false, row_count: 0 },
    },
    env_variables: { ok: false, missing: [], present: [] },
  };

  // ── 1. Environment Variable Validation ──────────────────────────────────
  const present: string[] = [];
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (process.env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }
  checks.env_variables = {
    ok: missing.length === 0,
    missing,
    present,
  };

  // ── 2. Supabase Connection, Table Row-Counts ────────────────────────────
  try {
    const t0 = performance.now();

    // A single round-trip to verify connectivity
    const [shopsResult, productsResult, ordersResult] = await Promise.allSettled(
      [
        supabase.from("shops").select("id", { count: "exact", head: true }),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
      ],
    );

    const t1 = performance.now();

    checks.supabase_connection = {
      ok: true,
      latency_ms: Math.round(t1 - t0),
    };

    // Shops table
    if (shopsResult.status === "fulfilled" && !shopsResult.value.error) {
      checks.tables.shops = {
        ok: true,
        row_count: shopsResult.value.count ?? 0,
      };
    } else {
      const errMsg =
        shopsResult.status === "rejected"
          ? toError(shopsResult.reason)
          : shopsResult.value.error?.message ?? "Unknown error";
      checks.tables.shops = { ok: false, row_count: 0, error: errMsg };
    }

    // Products table
    if (productsResult.status === "fulfilled" && !productsResult.value.error) {
      checks.tables.products = {
        ok: true,
        row_count: productsResult.value.count ?? 0,
      };
    } else {
      const errMsg =
        productsResult.status === "rejected"
          ? toError(productsResult.reason)
          : productsResult.value.error?.message ?? "Unknown error";
      checks.tables.products = { ok: false, row_count: 0, error: errMsg };
    }

    // Orders table
    if (ordersResult.status === "fulfilled" && !ordersResult.value.error) {
      checks.tables.orders = {
        ok: true,
        row_count: ordersResult.value.count ?? 0,
      };
    } else {
      const errMsg =
        ordersResult.status === "rejected"
          ? toError(ordersResult.reason)
          : ordersResult.value.error?.message ?? "Unknown error";
      checks.tables.orders = { ok: false, row_count: 0, error: errMsg };
    }
  } catch (err) {
    checks.supabase_connection = {
      ok: false,
      latency_ms: 0,
      error: toError(err),
    };
  }

  // ── 3. Determine Aggregate Status ───────────────────────────────────────
  const allTableChecks = [
    checks.tables.shops,
    checks.tables.products,
    checks.tables.orders,
  ];
  const tablesOk = allTableChecks.every((t) => t.ok);
  const anyTableOk = allTableChecks.some((t) => t.ok);
  const connectionOk = checks.supabase_connection.ok;
  const envOk = checks.env_variables.ok;

  let status: HealthCheckResult["status"];
  if (connectionOk && tablesOk && envOk) {
    status = "healthy";
  } else if ((connectionOk || anyTableOk) && envOk) {
    status = "degraded";
  } else {
    status = "unhealthy";
  }

  const end = performance.now();

  return {
    success: true,
    data: {
      status,
      timestamp: new Date().toISOString(),
      checks,
      uptime_seconds: Math.round((end - start) / 1000),
    },
  };
}

/**
 * Lightweight ping — checks only Supabase connectivity via a `shops` count query.
 * Returns `true` if the connection is alive, `false` otherwise.
 */
export async function pingDatabase(): Promise<boolean> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("shops")
      .select("id", { count: "exact", head: true });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Returns a URL-friendly name for the health check dashboard (if exposed).
 * Useful for a hidden `/api/health` developer diagnostic route.
 */
export function getHealthCheckPath(): string {
  return "/api/health";
}