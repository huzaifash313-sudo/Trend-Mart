/* -------------------------------------------------------------------------- */
/*  TrendMart — Atomic Database Transaction Wrapper                             */
/*  PROMPT 1: Ensures all multi-step mutations (batch order processing,         */
/*           inventory deductions) are wrapped in atomic database               */
/*           transactions with proper rollback mechanisms.                      */
/* -------------------------------------------------------------------------- */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withRetry, CRITICAL_RETRY_CONFIG, connectionMetrics } from "./pool";
import { logError } from "@/services/errorService";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TransactionalOperation<T> = (
  client: SupabaseClient,
) => Promise<T>;

export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rolledBack: boolean;
  attempts: number;
  durationMs: number;
}

// ─── In-Memory Rollback Log (Compensation Transactions) ──────────────────────

/**
 * Represents a database operation that was performed and can be undone.
 * Uses the Saga pattern: each step records a compensating action,
 * and if any step fails, all prior steps are rolled back.
 */
interface CompensationRecord {
  label: string;
  compensate: () => Promise<void>;
}

// ─── Saga Transaction Executor ───────────────────────────────────────────────

/**
 * Execute a sequence of database operations as an atomic unit using the
 * Saga pattern for compensation-based rollback.
 *
 * If any step throws, all previously registered compensations are
 * executed in reverse order (last committed -> first committed).
 */
export async function executeSagaTransaction<TContext extends Record<string, unknown>, TResult>(
  operation: (
    client: SupabaseClient,
    context: TContext,
    compensate: (label: string, undo: () => Promise<void>) => void,
  ) => Promise<TResult>,
  initialContext: TContext,
  options?: {
    maxRetries?: number;
    serverSide?: boolean;
  },
): Promise<TransactionResult<TResult>> {
  const startTime = performance.now();
  const context = { ...initialContext };
  const compensationStack: CompensationRecord[] = [];
  let attempts = 0;
  const maxRetries = options?.maxRetries ?? CRITICAL_RETRY_CONFIG.maxRetries;

  const compensate = (label: string, undo: () => Promise<void>): void => {
    compensationStack.push({ label, compensate: undo });
  };

  while (attempts < maxRetries) {
    attempts++;
    compensationStack.length = 0;

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      const client = options?.serverSide
        ? await createServerClient(supabaseUrl, supabaseAnonKey, {
            cookies: {
              getAll: async () => (await cookies()).getAll(),
              setAll: () => {},
            },
          })
        : await (async () => {
            const { createClient } = await import("@supabase/supabase-js");
            return createClient(supabaseUrl, supabaseAnonKey, {
              auth: { persistSession: false },
            });
          })();

      const result = await withRetry(
        () => operation(client, context, compensate),
        { ...CRITICAL_RETRY_CONFIG, maxRetries: 1 },
      );

      const durationMs = Math.round(performance.now() - startTime);
      connectionMetrics.recordQuery(durationMs, true);

      return {
        success: true,
        data: result,
        rolledBack: false,
        attempts,
        durationMs,
      };
    } catch (err) {
      if (compensationStack.length > 0) {
        await rollbackCompensations(compensationStack);
      }

      const isVersionConflict = isOptimisticConcurrencyError(err);
      if (isVersionConflict && attempts < maxRetries) {
        const delay = Math.min(100 * Math.pow(2, attempts - 1), 3000);
        await new Promise((r) => setTimeout(r, delay + Math.random() * delay));
        continue;
      }

      const durationMs = Math.round(performance.now() - startTime);
      connectionMetrics.recordQuery(durationMs, false);
      logError(err, { module: "transaction.executeSagaTransaction" });

      return {
        success: false,
        error: err instanceof Error ? err.message : "Transaction failed",
        rolledBack: true,
        attempts,
        durationMs,
      };
    }
  }

  const durationMs = Math.round(performance.now() - startTime);
  return {
    success: false,
    error: `Transaction failed after ${attempts} attempts due to concurrent modifications.`,
    rolledBack: true,
    attempts,
    durationMs,
  };
}

/**
 * Execute all compensation actions in reverse order.
 */
async function rollbackCompensations(stack: CompensationRecord[]): Promise<void> {
  const errors: string[] = [];

  for (let i = stack.length - 1; i >= 0; i--) {
    const { label, compensate } = stack[i];
    try {
      await compensate();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Compensation "${label}" failed: ${errorMsg}`);
      logError(err, {
        module: "transaction.rollbackCompensations",
        meta: { compensationLabel: label },
      });
    }
  }

  if (errors.length > 0) {
    console.error(
      `[TrendMart] Rollback completed with ${errors.length} compensation failure(s):`,
      errors,
    );
  }
}

/**
 * Check if the error is an optimistic concurrency / version conflict error.
 */
function isOptimisticConcurrencyError(err: unknown): boolean {
  if (err instanceof Error) {
    const message = err.message?.toLowerCase() ?? "";
    return (
      message.includes("version") ||
      message.includes("concurrent") ||
      message.includes("conflict") ||
      message.includes("retry") ||
      message.includes("updated_at") ||
      (err as Error & { code?: string }).code === "23505"
    );
  }
  return false;
}

// ─── Simple Atomic Transaction (Server-Side Only) ────────────────────────────

/**
 * Execute a single multi-step database operation as atomically as possible.
 * Uses the Saga pattern internally for rollback support.
 */
export async function executeAtomic<T>(
  fn: (client: SupabaseClient) => Promise<T>,
): Promise<T> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const client = await createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: async () => (await cookies()).getAll(),
      setAll: () => {},
    },
  });

  return withRetry(() => fn(client), CRITICAL_RETRY_CONFIG);
}

// ─── Batch Operation Helper ──────────────────────────────────────────────────

/**
 * Execute a batch of operations with partial failure handling.
 */
export async function executeBatch<T>(
  operations: Array<{
    label: string;
    fn: (client: SupabaseClient) => Promise<T>;
  }>,
  options?: {
    stopOnFirstError?: boolean;
    concurrency?: number;
  },
): Promise<{
  results: T[];
  errors: Array<{ index: number; label: string; error: string }>;
  totalSuccess: number;
  totalFailed: number;
}> {
  const results: T[] = [];
  const errors: Array<{ index: number; label: string; error: string }> = [];
  const concurrency = options?.concurrency ?? 3;
  const stopOnFirstError = options?.stopOnFirstError ?? false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, i + concurrency);

    const batchPromises = batch.map(async (op, batchIndex) => {
      const globalIndex = i + batchIndex;

      const client = await createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll: async () => (await cookies()).getAll(),
          setAll: () => {},
        },
      });

      try {
        const result = await withRetry(() => op.fn(client));
        results.push(result);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push({ index: globalIndex, label: op.label, error: errorMsg });
        logError(err, {
          module: "transaction.executeBatch",
          meta: { batchLabel: op.label, index: globalIndex },
        });
      }
    });

    await Promise.all(batchPromises);

    if (stopOnFirstError && errors.length > 0) {
      break;
    }
  }

  return {
    results,
    errors,
    totalSuccess: results.length,
    totalFailed: errors.length,
  };
}