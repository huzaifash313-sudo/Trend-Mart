/* -------------------------------------------------------------------------- */
/*  TrendMart — Enterprise-Grade Audit Logging Service                         */
/*  Centralized platform audit trail for super administrators.                 */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/**
 * Escape PostgREST filter metacharacters so user search text can't broaden an
 * ILIKE wildcard (%/_) or inject additional `.or()` clauses via commas.
 */
function escapeFilterLiteral(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, " ")
    .replace(/\(/g, " ")
    .replace(/\)/g, " ")
    .slice(0, 100);
}

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditTargetType =
  | "shop"
  | "user"
  | "order"
  | "subscription"
  | "product"
  | "system";

export interface AdminAuditLog {
  id: string;
  event_type: string;
  target_type: AuditTargetType;
  target_id: string | null;
  description: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  performed_by: string | null;
  performed_by_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  severity: AuditSeverity;
  created_at: string;
}

export interface AuditLogPayload {
  eventType: string;
  targetType: AuditTargetType;
  targetId?: string;
  description: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  performedBy?: string;
  performedByEmail?: string;
  severity?: AuditSeverity;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Log a system event to the admin audit log.
 * Fire-and-forget pattern — never blocks the calling code.
 */
export function logAuditEvent(payload: AuditLogPayload): void {
  const supabase = createClient();

  supabase
    .from("admin_audit_logs")
    .insert({
      event_type: payload.eventType,
      target_type: payload.targetType,
      target_id: payload.targetId ?? null,
      description: payload.description,
      old_value: payload.oldValue ?? null,
      new_value: payload.newValue ?? null,
      performed_by: payload.performedBy ?? null,
      performed_by_email: payload.performedByEmail ?? null,
      severity: payload.severity ?? "info",
    })
    .then(
      ({ error }) => {
        if (error) {
          // Silent fail — audit logs should never break UX
          console.error("[auditService] Failed to log audit event:", error);
        }
      },
      () => {
        // Network-level rejection (offline / Supabase unreachable) must not
        // become an unhandled promise rejection.
      },
    );
}

/**
 * Log with current session context (resolves user from Supabase session).
 */
export async function logAuditEventWithContext(
  payload: Omit<AuditLogPayload, "performedBy" | "performedByEmail">,
): Promise<void> {
  const supabase = createClient();

  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    logAuditEvent({
      ...payload,
      performedBy: user?.id,
      performedByEmail: user?.email,
    });
  } catch {
    // Still try to log without user context
    logAuditEvent(payload as AuditLogPayload);
  }
}

/**
 * Fetch audit logs with pagination and optional filters.
 * Only accessible by admin users (enforced by RLS).
 */
export async function fetchAuditLogs(opts?: {
  page?: number;
  pageSize?: number;
  eventType?: string;
  targetType?: AuditTargetType;
  severity?: AuditSeverity;
  performedBy?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}): Promise<ServiceResult<{ logs: AdminAuditLog[]; total: number }>> {
  const supabase = createClient();
  try {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Count query
    let countQuery = supabase
      .from("admin_audit_logs")
      .select("*", { count: "exact", head: true });

    if (opts?.eventType) countQuery = countQuery.eq("event_type", opts.eventType);
    if (opts?.targetType) countQuery = countQuery.eq("target_type", opts.targetType);
    if (opts?.severity) countQuery = countQuery.eq("severity", opts.severity);
    if (opts?.performedBy) countQuery = countQuery.eq("performed_by", opts.performedBy);
    if (opts?.fromDate) countQuery = countQuery.gte("created_at", opts.fromDate);
    if (opts?.toDate) countQuery = countQuery.lte("created_at", opts.toDate);
    if (opts?.search) {
      const s = escapeFilterLiteral(opts.search);
      countQuery = countQuery.or(`description.ilike.%${s}%,event_type.ilike.%${s}%`);
    }

    const { count, error: countError } = await countQuery;
    if (countError) throw countError;

    // Data query
    let dataQuery = supabase
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (opts?.eventType) dataQuery = dataQuery.eq("event_type", opts.eventType);
    if (opts?.targetType) dataQuery = dataQuery.eq("target_type", opts.targetType);
    if (opts?.severity) dataQuery = dataQuery.eq("severity", opts.severity);
    if (opts?.performedBy) dataQuery = dataQuery.eq("performed_by", opts.performedBy);
    if (opts?.fromDate) dataQuery = dataQuery.gte("created_at", opts.fromDate);
    if (opts?.toDate) dataQuery = dataQuery.lte("created_at", opts.toDate);
    if (opts?.search) {
      const s = escapeFilterLiteral(opts.search);
      dataQuery = dataQuery.or(`description.ilike.%${s}%,event_type.ilike.%${s}%`);
    }

    const { data, error } = await dataQuery;
    if (error) throw error;

    return {
      success: true,
      data: { logs: (data as AdminAuditLog[]) ?? [], total: count ?? 0 },
    };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

/**
 * Get distinct event types for filtering dropdowns.
 */
export async function fetchDistinctEventTypes(): Promise<ServiceResult<string[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("admin_audit_logs")
      .select("event_type");

    if (error) throw error;

    const types = [...new Set((data ?? []).map((r: { event_type: string }) => r.event_type))];
    return { success: true, data: types.sort() };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

/**
 * Count audit logs by severity (for dashboard view).
 */
export async function fetchAuditStats(): Promise<
  ServiceResult<{
    total: number;
    info: number;
    warning: number;
    critical: number;
    todayCount: number;
  }>
> {
  const supabase = createClient();
  try {
    const { count: total } = await supabase
      .from("admin_audit_logs")
      .select("*", { count: "exact", head: true });

    const { count: info } = await supabase
      .from("admin_audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("severity", "info");

    const { count: warning } = await supabase
      .from("admin_audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("severity", "warning");

    const { count: critical } = await supabase
      .from("admin_audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("severity", "critical");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: todayCount } = await supabase
      .from("admin_audit_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today.toISOString());

    return {
      success: true,
      data: {
        total: total ?? 0,
        info: info ?? 0,
        warning: warning ?? 0,
        critical: critical ?? 0,
        todayCount: todayCount ?? 0,
      },
    };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}