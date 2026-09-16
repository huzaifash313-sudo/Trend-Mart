/* -------------------------------------------------------------------------- */
/*  POS audit trail writer — SERVER ONLY                                       */
/*                                                                              */
/*  Writes go through the service-role client on purpose: `pos_audit_logs` has  */
/*  no client INSERT policy, so a cashier can neither forge nor delete entries. */
/*  Never call this from a client component.                                    */
/* -------------------------------------------------------------------------- */

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StaffSession } from "@/lib/pos/staffAuth";

export type PosAuditEvent =
  | "sale.completed"
  | "sale.discount"
  | "sale.price_override"
  | "sale.void"
  | "staff.login"
  | "staff.created"
  | "staff.pin_reset"
  | "staff.deactivated";

export type PosAuditSeverity = "info" | "warning" | "critical";

export interface PosAuditEntry {
  shopId: string;
  /** Null when the shop has no staff configured and the owner is at the counter. */
  staff?: Pick<StaffSession, "staffId" | "name"> | null;
  /** Falls back to this label when there is no staff session (e.g. "Owner"). */
  actorLabel?: string;
  eventType: PosAuditEvent;
  severity?: PosAuditSeverity;
  orderId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Record one auditable POS action.
 *
 * Deliberately non-throwing: an audit write must never be the reason a sale
 * fails at the counter. Failures are logged server-side instead.
 */
export async function logPosAudit(entry: PosAuditEntry): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();
    if (!admin) return;

    // `as never` matches the existing convention for tables the generated
    // Supabase types don't cover yet (see app/api/pos/sales/route.ts).
    await admin.from("pos_audit_logs").insert({
      shop_id: entry.shopId,
      staff_id: entry.staff?.staffId ?? null,
      staff_name: entry.staff?.name ?? entry.actorLabel ?? "Owner",
      event_type: entry.eventType,
      severity: entry.severity ?? "info",
      order_id: entry.orderId ?? null,
      metadata: entry.metadata ?? {},
    } as never);
  } catch (err) {
    console.error(
      "[posAudit] failed to record",
      entry.eventType,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Fire several audit rows for one action (e.g. a sale with a discount). */
export async function logPosAuditBatch(entries: PosAuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await Promise.all(entries.map((e) => logPosAudit(e)));
}
